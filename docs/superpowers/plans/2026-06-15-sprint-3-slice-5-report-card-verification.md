# Report-Card PDF + Public Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A printable per-student report card (browser Save-as-PDF) carrying a QR/code that anyone can use on a public page to confirm the result is authentic.

**Architecture:** A non-tenant `Verification` table (no RLS) holds the minimal public snapshot per `ResultSheet`, written at release and refreshed on correction. An authenticated report-card read service feeds a print-styled web page; a new `PublicModule` exposes one unauthenticated verify endpoint that reads only `Verification`. Web adds the print page, a public verify page, a QR, and a `/release` entry point.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e (service-level) + vitest; `qrcode` (new web dep).

**Spec:** `docs/superpowers/specs/2026-06-15-sprint-3-slice-5-report-card-verification-design.md`

**Branch:** `sprint-3-report-card` (already created).

**KEY CONVENTIONS (slices 1–4.5):** explicit `schoolId` scoping on every tenant read/create incl. inside `$transaction` (the `tx` client runs no middleware); IDOR via tenant-scoped `findFirst`; service-level e2e inside `TenantContext.run`; ids are cuids; `noUncheckedIndexedAccess` (`?.`/`!`). `computeSubjectResult`/`computePositions` already exist. Term label = `"<academicYear.name> · Term <number>"`.

**CRITICAL:** `Verification` is NOT a tenant model — do NOT add it to `TENANT_MODELS` and do NOT give it an RLS policy. The public endpoint reads it with no tenant context; adding RLS or tenant scoping would break the public path.

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (`Verification` model + `ResultSheet.verification` back-relation), new migration. (NO change to `prisma.service.ts` TENANT_MODELS, NO RLS migration.)
- Create: `apps/api/src/modules/assessment/verification.util.ts` + `.spec.ts`
- Modify: `apps/api/src/modules/assessment/release.service.ts` (create Verification), `correction.service.ts` (refresh Verification)
- Create: `apps/api/src/modules/assessment/report-card.service.ts`, `report-card.controller.ts`
- Create: `apps/api/src/modules/public/public.module.ts`, `public.service.ts`, `public.controller.ts`
- Modify: `apps/api/src/modules/assessment/assessment.module.ts`, `apps/api/src/app.module.ts`, `apps/api/test/assessment.e2e-spec.ts`, new `apps/api/test/public.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/package.json` (qrcode)
- Create: `apps/web/src/app/(app)/report-card/[studentId]/page.tsx`, `apps/web/src/app/verify/[code]/page.tsx`
- Modify: `apps/web/src/app/(app)/release/page.tsx` (entry point)

---

## Task 1: `Verification` model + migration + code util

**Files:** Modify `schema.prisma`; create `verification.util.ts` + `.spec.ts`

- [ ] **Step 1: Add the model** to `schema.prisma` (after `Correction`):
```prisma
model Verification {
  id            String      @id @default(cuid())
  code          String      @unique
  resultSheetId String      @unique
  resultSheet   ResultSheet @relation(fields: [resultSheetId], references: [id], onDelete: Cascade)
  schoolId      String
  studentName   String
  className     String
  termLabel     String
  schoolName    String
  average       Int
  position      Int
  issuedAt      DateTime
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```
Add `verification Verification?` to the `ResultSheet` model's relation fields. Do NOT add `Verification` to `TENANT_MODELS` in `prisma.service.ts`.

- [ ] **Step 2: Migrate** (from `apps/api`; stop any dev server first):
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta/apps/api" && pnpm exec prisma migrate dev --name verification_model
```
Expected: applied + "in sync". (Do NOT create an RLS migration for this table.)

- [ ] **Step 3: Failing unit test** — `apps/api/src/modules/assessment/verification.util.spec.ts`:
```ts
import { generateVerificationCode } from "./verification.util";

describe("generateVerificationCode", () => {
  it("returns a 16-char code from the unambiguous alphabet", () => {
    const c = generateVerificationCode();
    expect(c).toHaveLength(16);
    expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it("returns distinct codes across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateVerificationCode()));
    expect(seen.size).toBe(50);
  });
});
```

- [ ] **Step 4:** `cd apps/api && pnpm exec jest verification.util` → FAIL (module missing).

- [ ] **Step 5: Implement `verification.util.ts`:**
```ts
import { randomBytes } from "node:crypto";

// Unambiguous alphabet: no 0/1/I/L/O. 31 symbols.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Crypto-random, human-transcribable verification code (default 16 chars). */
export function generateVerificationCode(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
```

- [ ] **Step 6:** `pnpm exec jest verification.util` → PASS (2). `pnpm --filter @mymakaranta/api typecheck` clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/assessment/verification.util.ts apps/api/src/modules/assessment/verification.util.spec.ts
git commit -m "feat(assessment): Verification model (non-tenant) + code generator"
```

---

## Task 2: Release creates a `Verification` per sheet

**Files:** Modify `apps/api/src/modules/assessment/release.service.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** In the existing `describe("release")` block in `assessment.e2e-spec.ts`, add (it reuses that block's released `cls`/`rTerm` and the `s1`..`s3` students; confirm names):
```ts
    it("creates a Verification per released sheet with a code + snapshot", async () => {
      const sheets = await prisma.resultSheet.findMany({ where: { schoolId, classId: cls, termId: rTerm }, include: { verification: true } });
      expect(sheets.length).toBeGreaterThan(0);
      for (const s of sheets) {
        expect(s.verification).toBeTruthy();
        expect(s.verification!.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/);
        expect(s.verification!.average).toBe(s.average);
        expect(s.verification!.position).toBe(s.position);
        expect(s.verification!.studentName.length).toBeGreaterThan(0);
        expect(s.verification!.schoolId).toBe(schoolId);
      }
    });
```
(NOTE: this asserts on the release performed by the existing release test. If the release describe's release runs in a `beforeAll`/first `it`, this new `it` must come after it. Confirm ordering.)

- [ ] **Step 2:** Run `pnpm --filter @mymakaranta/api test:e2e` → this test FAILS (no verification rows).

- [ ] **Step 3: Implement** in `release.service.ts` `release(...)`. The method already loads `klass` and `term`. Add loads for `school.name`, `term.academicYear.name`, and the students' names. Concretely:
  - Change the `term` load to include the academic year, or fetch it: after validating, `const academicYear = await this.prisma.academicYear.findFirst({ where: { id: term.academicYearId, schoolId } });`
  - `const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });`
  - Replace the `enrollments` select to also get names: `const students = await this.prisma.student.findMany({ where: { id: { in: studentIds }, schoolId }, select: { id: true, firstName: true, lastName: true } });` and build `const nameById = new Map(students.map((s) => [s.id, \`${s.firstName} ${s.lastName}\`]));` (keep the existing `studentIds` derivation from enrollments).
  - Compute `const termLabel = \`${academicYear?.name ?? ""} · Term ${term.number}\`;`
  - Inside the `$transaction`, after creating each `ResultSheet` `rs` (and its entries), create the verification:
```ts
        await tx.verification.create({
          data: {
            code: generateVerificationCode(),
            resultSheetId: rs.id,
            schoolId,
            studentName: nameById.get(p.studentId) ?? "",
            className: klass.name,
            termLabel,
            schoolName: school?.name ?? "",
            average: p.average,
            position: positions.get(p.studentId) ?? 0,
            issuedAt: rel.releasedAt,
          },
        });
```
  - Add `import { generateVerificationCode } from "./verification.util";` at the top.
  (NOTE: `rel.releasedAt` is available from `tx.release.create` — it returns the row incl. `releasedAt`. Confirm `klass.name` is loaded; the method's `klass` is from `class.findFirst` so it has `name`.)

- [ ] **Step 4:** Run e2e → green (the new test + full suite). `pnpm --filter @mymakaranta/api typecheck` clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/assessment/release.service.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): release writes a Verification snapshot per sheet"
```

---

## Task 3: Correction refreshes affected `Verification` snapshots

**Files:** Modify `apps/api/src/modules/assessment/correction.service.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** In the `describe("correction")` block, add after the first correction test (which corrects `lo`):
```ts
    it("refreshes the Verification snapshot after a correction", async () => {
      // the first correction test already lifted Lo to avg 70 / position 1
      const loSheet = await prisma.resultSheet.findFirst({ where: { schoolId, classId: cls, termId: cTerm, studentId: lo }, include: { verification: true } });
      expect(loSheet!.verification).toBeTruthy();
      expect(loSheet!.verification!.average).toBe(loSheet!.average);
      expect(loSheet!.verification!.position).toBe(loSheet!.position);
      // Hi's position also changed in the re-rank → its snapshot must reflect it
      const hiSheet = await prisma.resultSheet.findFirst({ where: { schoolId, classId: cls, termId: cTerm, studentId: hi }, include: { verification: true } });
      expect(hiSheet!.verification!.position).toBe(hiSheet!.position);
    });
```

- [ ] **Step 2:** Run e2e → FAILS (snapshots stale / null).

- [ ] **Step 3: Implement** in `correction.service.ts` `correct(...)`, inside the `$transaction`, in the existing loop that updates every sheet's `position` (the re-rank loop `for (const s of sheets) { await tx.resultSheet.update(...) }`), ALSO upsert each sheet's verification. Replace that loop body with:
```ts
      for (const s of sheets) {
        const pos = positions.get(s.studentId) ?? 0;
        await tx.resultSheet.update({ where: { id: s.id, schoolId }, data: { position: pos } });
        const isCorrected = s.studentId === dto.studentId;
        await tx.verification.upsert({
          where: { resultSheetId: s.id },
          update: { average: isCorrected ? average : s.average, position: pos },
          create: {
            code: generateVerificationCode(),
            resultSheetId: s.id,
            schoolId,
            studentName: nameById.get(s.studentId) ?? "",
            className,
            termLabel,
            schoolName,
            average: isCorrected ? average : s.average,
            position: pos,
            issuedAt: release.releasedAt,
          },
        });
      }
```
This needs a few values in scope inside the txn:
  - `average` (the corrected student's recomputed average) — already computed just above.
  - `nameById`, `className`, `termLabel`, `schoolName`, `release.releasedAt` — load these in `correct()` BEFORE the transaction:
    - The method already has `release` from `this.prisma.release.findFirst(...)` (it has `releasedAt`).
    - `const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });` → `className = klass!.name` (assertTarget already validated it exists).
    - `const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });` + `const ay = await this.prisma.academicYear.findFirst({ where: { id: term!.academicYearId, schoolId } });` → `termLabel = \`${ay?.name ?? ""} · Term ${term!.number}\``.
    - `const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });` → `schoolName = school?.name ?? ""`.
    - `const classStudents = await this.prisma.resultSheet.findMany({ where: { schoolId, classId: dto.classId, termId: dto.termId }, select: { studentId: true } });` then `const studs = await this.prisma.student.findMany({ where: { id: { in: classStudents.map((c) => c.studentId) }, schoolId }, select: { id: true, firstName: true, lastName: true } });` → `nameById = new Map(studs.map((s) => [s.id, \`${s.firstName} ${s.lastName}\`]))`.
  - `import { generateVerificationCode } from "./verification.util";`
  (`s.studentId`/`s.average` come from the existing `sheets` select — confirm that select includes `studentId` and `average`; the slice-4.5 code selects `{ id, studentId, average }` — if `average` isn't selected, add it.)

- [ ] **Step 4:** Run e2e → green (full suite). typecheck clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/assessment/correction.service.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): correction refreshes Verification snapshots on re-rank"
```

---

## Task 4: Authenticated report-card service + controller

**Files:** Create `report-card.service.ts`, `report-card.controller.ts`; modify `assessment.module.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** Add a `describe("report card")` inside the top-level describe. Reuse the `release` block's released class — but to stay isolated, build a tiny released class here OR reuse. Simplest: add the test INSIDE the existing `describe("release")` block (its `cls`/`rTerm`/`s1` are released). Add `let reportCard: ReportCardService;` to the top-level beforeAll (`moduleRef.get`), import `ReportCardService` from `../src/modules/assessment/report-card.service`. Then inside `describe("release")`:
```ts
    it("returns a report card with the frozen sheet + a stable verification code", async () => {
      const rc = await asA(() => reportCard.getReportCard(s1, rTerm));
      expect(rc.student.name.length).toBeGreaterThan(0);
      expect(rc.entries.length).toBeGreaterThan(0);
      expect(typeof rc.average).toBe("number");
      expect(rc.position).toBeGreaterThan(0);
      expect(rc.classSize).toBeGreaterThan(0);
      expect(rc.verificationCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/);
      expect(Array.isArray(rc.gradeKey)).toBe(true);
      const again = await asA(() => reportCard.getReportCard(s1, rTerm));
      expect(again.verificationCode).toBe(rc.verificationCode); // idempotent
    });

    it("rejects a report card for another tenant's student", async () => {
      await expect(asB(() => reportCard.getReportCard(s1, rTerm))).rejects.toThrow(NotFoundException);
    });
```

- [ ] **Step 2:** Run e2e → FAIL (service missing).

- [ ] **Step 3: Implement `report-card.service.ts`:**
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { generateVerificationCode } from "./verification.util";

@Injectable()
export class ReportCardService {
  constructor(private prisma: PrismaService) {}

  async getReportCard(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const sheet = await this.prisma.resultSheet.findFirst({
      where: { schoolId, studentId, termId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        class: { select: { name: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
        release: { select: { releasedAt: true } },
        entries: { include: { subject: { select: { name: true } } } },
        verification: true,
      },
    });
    if (!sheet) throw new NotFoundException("No released result for this student/term.");

    let code = sheet.verification?.code;
    if (!code) {
      code = generateVerificationCode();
      const termLabel = `${sheet.term.academicYear.name} · Term ${sheet.term.number}`;
      const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await this.prisma.verification.create({
        data: {
          code, resultSheetId: sheet.id, schoolId,
          studentName: `${sheet.student.firstName} ${sheet.student.lastName}`,
          className: sheet.class.name, termLabel, schoolName: school?.name ?? "",
          average: sheet.average, position: sheet.position, issuedAt: sheet.release.releasedAt,
        },
      });
    }

    const [boundaries, classSize] = await Promise.all([
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } }),
      this.prisma.resultSheet.count({ where: { schoolId, classId: sheet.classId, termId } }),
    ]);

    return {
      school: { name: (await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }))?.name ?? "" },
      student: { name: `${sheet.student.firstName} ${sheet.student.lastName}`, admissionNo: sheet.student.admissionNo },
      className: sheet.class.name,
      term: { label: `${sheet.term.academicYear.name} · Term ${sheet.term.number}` },
      entries: sheet.entries.map((e) => ({ subjectId: e.subjectId, subjectName: e.subject.name, total: e.total, grade: e.grade })),
      average: sheet.average,
      position: sheet.position,
      classSize,
      releasedAt: sheet.release.releasedAt.toISOString(),
      gradeKey: boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })),
      verificationCode: code,
    };
  }
}
```
(Minor: the double school fetch is acceptable; an implementer may hoist it to one `const school = ...` above. Keep it correct + tenant-scoped.)

- [ ] **Step 4: Implement `report-card.controller.ts`** (mirror `release.controller.ts` guard imports):
```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReportCardService } from "./report-card.service";

@Controller("v1/assessment/report-card")
export class ReportCardController {
  constructor(private service: ReportCardService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  get(@Query("studentId") studentId: string, @Query("termId") termId: string) {
    return this.service.getReportCard(studentId, termId);
  }
}
```

- [ ] **Step 5: Register** `ReportCardService` (providers) + `ReportCardController` (controllers) in `assessment.module.ts`.

- [ ] **Step 6:** Run e2e → green. `pnpm --filter @mymakaranta/api build` + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/assessment/report-card.service.ts apps/api/src/modules/assessment/report-card.controller.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): authenticated report-card read (+ lazy Verification)"
```

---

## Task 5: Public verification module + endpoint

**Files:** Create `public.module.ts`, `public.service.ts`, `public.controller.ts`; modify `app.module.ts`; create `test/public.e2e-spec.ts`

- [ ] **Step 1: Failing e2e** — `apps/api/test/public.e2e-spec.ts`. Model the bootstrap on the top of `assessment.e2e-spec.ts` (create a Nest app/module ref, get `PrismaService`). The test creates a `Verification` row directly (no tenant needed) and verifies the service reads it with NO `TenantContext`:
```ts
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { PublicService } from "../src/modules/public/public.service";

describe("public verification (no tenant context)", () => {
  let prisma: PrismaService; let pub: PublicService; let app: import("@nestjs/common").INestApplicationContext;
  const code = "ABCDEFGHJKMNPQRS";
  let rsId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await moduleRef.createNestApplication().init();
    prisma = moduleRef.get(PrismaService);
    pub = moduleRef.get(PublicService);
    // minimal tenant scaffold to satisfy the FK on resultSheetId
    const school = await prisma.school.create({ data: { name: "Verify Co", slug: `vc-${Date.now()}` } });
    const ay = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2025/2026", startDate: new Date(), endDate: new Date() } });
    const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: ay.id, number: 1, startDate: new Date(), endDate: new Date() } });
    const lvl = await prisma.classLevel.create({ data: { schoolId: school.id, name: "L1", order: 1 } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, classLevelId: lvl.id, name: "C1" } });
    const stu = await prisma.student.create({ data: { schoolId: school.id, admissionNo: `A-${Date.now()}`, firstName: "Pub", lastName: "Verify", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
    await prisma.enrollment.create({ data: { studentId: stu.id, classId: klass.id, termId: term.id } });
    const rel = await prisma.release.create({ data: { schoolId: school.id, classId: klass.id, termId: term.id, releasedBy: "x" } });
    const rs = await prisma.resultSheet.create({ data: { schoolId: school.id, releaseId: rel.id, studentId: stu.id, classId: klass.id, termId: term.id, average: 77, position: 1 } });
    rsId = rs.id;
    await prisma.verification.create({ data: { code, resultSheetId: rs.id, schoolId: school.id, studentName: "Pub Verify", className: "C1", termLabel: "2025/2026 · Term 1", schoolName: "Verify Co", average: 77, position: 1, issuedAt: new Date() } });
  });

  afterAll(async () => { await app.close(); });

  it("returns minimal authenticity for a valid code (no tenant context)", async () => {
    const r = await pub.verify(code);
    expect(r.valid).toBe(true);
    expect(r).toMatchObject({ student: "Pub Verify", className: "C1", school: "Verify Co", average: 77, position: 1 });
    expect((r as Record<string, unknown>).entries).toBeUndefined();
  });

  it("returns valid:false for an unknown code", async () => {
    expect((await pub.verify("ZZZZZZZZZZZZZZZZ")).valid).toBe(false);
  });
});
```
(NOTE: this calls `pub.verify(...)` directly WITHOUT wrapping in `TenantContext.run` — proving it needs no tenant. Confirm the `School` create shape + `AcademicYear` required fields against the schema; adjust to the real required columns.)

- [ ] **Step 2:** Run `pnpm --filter @mymakaranta/api test:e2e -- public` → FAIL (service missing).

- [ ] **Step 3: Implement `apps/api/src/modules/public/public.service.ts`:**
```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async verify(code: string) {
    if (!code) return { valid: false as const };
    const v = await this.prisma.verification.findUnique({ where: { code } });
    if (!v) return { valid: false as const };
    return {
      valid: true as const,
      student: v.studentName,
      className: v.className,
      term: v.termLabel,
      school: v.schoolName,
      average: v.average,
      position: v.position,
      issuedAt: v.issuedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/modules/public/public.controller.ts`** (NO guards):
```ts
import { Controller, Get, Param } from "@nestjs/common";
import { PublicService } from "./public.service";

@Controller("v1/public")
export class PublicController {
  constructor(private service: PublicService) {}

  @Get("verify/:code")
  verify(@Param("code") code: string) {
    return this.service.verify(code);
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/modules/public/public.module.ts`:**
```ts
import { Module } from "@nestjs/common";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
```
(PrismaService comes from the global `PrismaModule` — confirm `PrismaModule` is `@Global()` or import it here. Check `prisma.module.ts`; if not global, add `imports: [PrismaModule]`.)

- [ ] **Step 6: Register** `PublicModule` in `app.module.ts` `imports`.

- [ ] **Step 7:** Run e2e (`public` + full suite) → green. Build + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/public apps/api/src/app.module.ts apps/api/test/public.e2e-spec.ts
git commit -m "feat(public): unauthenticated GET /v1/public/verify/:code (reads non-RLS Verification)"
```

---

## Task 6: Web api client + qrcode dep

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/package.json`

- [ ] **Step 1: Add `qrcode`** (+ types):
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web add qrcode && pnpm --filter @mymakaranta/web add -D @types/qrcode
```

- [ ] **Step 2: Types + methods** in `api.ts` (match the existing `authedRequest` + a plain unauth `request` helper — confirm the plain helper's name used by the login/OTP path):
```ts
export interface ReportCard {
  school: { name: string };
  student: { name: string; admissionNo: string };
  className: string;
  term: { label: string };
  entries: Array<{ subjectId: string; subjectName: string; total: number; grade: string }>;
  average: number;
  position: number;
  classSize: number;
  releasedAt: string;
  gradeKey: Array<{ grade: string; minScore: number; remark: string }>;
  verificationCode: string;
}

export type VerifyResult =
  | { valid: false }
  | { valid: true; student: string; className: string; term: string; school: string; average: number; position: number; issuedAt: string };
```
Methods inside `api`:
```ts
  getReportCard: (studentId: string, termId: string) =>
    authedRequest<ReportCard>(`/v1/assessment/report-card?studentId=${studentId}&termId=${termId}`),
  verifyResult: (code: string) =>
    request<VerifyResult>(`/v1/public/verify/${encodeURIComponent(code)}`),
```
Use the UNAUTHENTICATED helper for `verifyResult` (the public page has no token). If the only helper is `authedRequest` and it tolerates a missing token, that's acceptable; otherwise add/locate the plain `request<T>` helper the login page uses.

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts apps/web/package.json "pnpm-lock.yaml"
git commit -m "feat(assessment): web api client for report card + public verify; add qrcode"
```

---

## Task 7: Web print page + public verify page + `/release` entry

**Files:** Create `report-card/[studentId]/page.tsx`, `verify/[code]/page.tsx`; modify `release/page.tsx`

- [ ] **Step 1: Report-card print page** — `apps/web/src/app/(app)/report-card/[studentId]/page.tsx`. A client component that reads `studentId` from the route param and `termId` from the query (`useSearchParams`), fetches `api.getReportCard`, and renders a print-optimized card. Read `release/page.tsx` for token classes + ui imports. Key pieces:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type ReportCard } from "@/lib/api";

export default function ReportCardPage() {
  const params = useParams<{ studentId: string }>();
  const search = useSearchParams();
  const termId = search.get("termId") ?? "";
  const [rc, setRc] = useState<ReportCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (!params.studentId || !termId) return;
    void api.getReportCard(params.studentId, termId)
      .then(setRc)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load the report card."));
  }, [params.studentId, termId]);

  const verifyUrl = useMemo(
    () => (rc ? `${window.location.origin}/verify/${rc.verificationCode}` : ""),
    [rc],
  );
  useEffect(() => {
    if (verifyUrl) void QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 }).then(setQr).catch(() => setQr(""));
  }, [verifyUrl]);

  if (err) return <p className="p-8 text-small text-error">{err}</p>;
  if (!rc) return <div className="flex justify-center p-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-2xl p-6 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <div className="rounded-card border border-ink-100 dark:border-white/10 p-6 print:border-0">
        <header className="text-center mb-4">
          <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">{rc.school.name}</h1>
          <p className="text-small text-ink-500">Terminal Report Card</p>
        </header>
        <div className="grid grid-cols-2 gap-2 text-small mb-4">
          <div><span className="text-ink-500">Student:</span> {rc.student.name}</div>
          <div><span className="text-ink-500">Admission No:</span> {rc.student.admissionNo}</div>
          <div><span className="text-ink-500">Class:</span> {rc.className}</div>
          <div><span className="text-ink-500">Term:</span> {rc.term.label}</div>
        </div>
        <table className="w-full text-small border-collapse mb-4">
          <thead><tr className="text-left text-ink-500 border-b border-ink-100 dark:border-white/10">
            <th className="py-1.5">Subject</th><th className="py-1.5 text-center">Total</th><th className="py-1.5 text-center">Grade</th>
          </tr></thead>
          <tbody>
            {rc.entries.map((e) => (
              <tr key={e.subjectId} className="border-b border-ink-100 dark:border-white/10">
                <td className="py-1.5">{e.subjectName}</td>
                <td className="py-1.5 text-center tabular-nums">{e.total}</td>
                <td className="py-1.5 text-center">{e.grade || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between text-small mb-4">
          <div><span className="text-ink-500">Average:</span> <span className="tabular-nums font-medium">{rc.average}</span></div>
          <div><span className="text-ink-500">Position:</span> <span className="tabular-nums font-medium">{rc.position} / {rc.classSize}</span></div>
        </div>
        <div className="text-caption text-ink-500 mb-4">
          Grade key: {rc.gradeKey.map((g) => `${g.grade} ≥ ${g.minScore} (${g.remark})`).join("  ·  ")}
        </div>
        <footer className="flex items-end justify-between border-t border-ink-100 dark:border-white/10 pt-4">
          <div className="text-caption text-ink-500">
            <p>Issued {new Date(rc.releasedAt).toLocaleDateString()}</p>
            <p>Verify at /verify/{rc.verificationCode}</p>
            <p className="font-mono">{rc.verificationCode}</p>
          </div>
          {qr && <img src={qr} alt="Verification QR" width={96} height={96} />}
        </footer>
      </div>
    </div>
  );
}
```
Reconcile `@mymakaranta/ui` imports + token class names against `release/page.tsx` (e.g. `rounded-card`, `text-caption` — use whatever the design system actually exposes; if `text-caption` doesn't exist, use `text-small`/`text-xs`). Ensure `next/navigation` `useParams`/`useSearchParams` usage is correct for the App Router. If lint flags the `<img>` (next/image rule) for the QR data URL, add an eslint-disable-next-line for that line or use a plain `<img>` with a comment (data URLs don't benefit from next/image).

- [ ] **Step 2: Public verify page** — `apps/web/src/app/verify/[code]/page.tsx`. This must live OUTSIDE the `(app)` shell (it's at `app/verify/...`, not `app/(app)/verify/...`) so it has no sidebar/auth. Client component:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type VerifyResult } from "@/lib/api";

export default function VerifyPage() {
  const params = useParams<{ code: string }>();
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.verifyResult(params.code).then(setRes).catch(() => setRes({ valid: false })).finally(() => setLoading(false));
  }, [params.code]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas dark:bg-canvas-dark p-6">
      <div className="w-full max-w-md rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 text-center">
        <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-1">myMakaranta</h1>
        <p className="text-small text-ink-500 mb-5">Result verification</p>
        {loading ? (
          <p className="text-small text-ink-500">Checking…</p>
        ) : res && res.valid ? (
          <div className="text-left">
            <p className="mb-3 inline-flex items-center gap-2 text-small font-medium text-success">● Genuine result</p>
            <dl className="grid grid-cols-3 gap-y-1 text-small">
              <dt className="text-ink-500">Student</dt><dd className="col-span-2 text-ink-1000 dark:text-ink-100">{res.student}</dd>
              <dt className="text-ink-500">Class</dt><dd className="col-span-2">{res.className}</dd>
              <dt className="text-ink-500">Term</dt><dd className="col-span-2">{res.term}</dd>
              <dt className="text-ink-500">School</dt><dd className="col-span-2">{res.school}</dd>
              <dt className="text-ink-500">Average</dt><dd className="col-span-2 tabular-nums">{res.average}</dd>
              <dt className="text-ink-500">Position</dt><dd className="col-span-2 tabular-nums">{res.position}</dd>
              <dt className="text-ink-500">Issued</dt><dd className="col-span-2">{new Date(res.issuedAt).toLocaleDateString()}</dd>
            </dl>
          </div>
        ) : (
          <p className="text-small text-error">This code does not match any issued result.</p>
        )}
      </div>
    </main>
  );
}
```
Reconcile token names (`bg-canvas`, `text-success`, `rounded-card`) against the design system; swap to real tokens if different (check `login` page + `release` page).

- [ ] **Step 3: Entry point on `/release`.** In `release/page.tsx`, in the rendered sheet's per-student row (the same row that has the "Correct" action from slice 4.5), add a **Report card** link/button that opens the print page in a new tab:
```tsx
<a href={`/report-card/${st.studentId}?termId=${termId}`} target="_blank" rel="noopener noreferrer" className="text-small text-brand-600 hover:underline">Report card</a>
```
Place it next to the existing Correct button (match the row's action layout). Use `sheet.classId`/`termId` already in scope.

- [ ] **Step 4: Verify (no dev server running):**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; `/report-card/[studentId]` and `/verify/[code]` build. Fix unused imports / prop / token mismatches.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add "apps/web/src/app/(app)/report-card" "apps/web/src/app/verify" "apps/web/src/app/(app)/release/page.tsx"
git commit -m "feat(assessment): report-card print page + public /verify page + /release entry"
```

---

## Task 8: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject for the authenticated pages; the `/verify` page needs NO auth). Start API + web. Log in as the QA proprietor (`+2348033344455`, school "S3 Gradebook QA", released JSS1A). On `/release` → View → click **Report card** for a student → the print page renders (letterhead, subject table, average/position, grade key, QR + code) → trigger print preview (or assert the layout/`@media print`). Copy the `verificationCode`, open `/verify/<code>` in a fresh context (no token) → confirm the minimal authenticity card shows the right student/class/term/school/average/position and **no subject breakdown**. Open `/verify/BADCODEBADCODE00` → "does not match". Cross-check the API: `GET /v1/public/verify/<code>` returns `valid:true`; a random code → `valid:false`. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored). (Gotchas: stop web dev before any prod build; the `/verify` page must work with localStorage cleared.)

- [ ] **Step 2: Update `docs/RESUME.md`** — current state: slice 5 (report-card PDF + public verification) built + QA'd on `sprint-3-report-card`; the `Verification` table is non-tenant/no-RLS by design; first public endpoint added; remaining slice 6. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + units + builds, then merge `sprint-3-report-card` → main per the user's choice).

---

## Notes for the implementer
- **`Verification` is NOT tenant-scoped** — never add it to `TENANT_MODELS`, never give it RLS. The public read must work with no tenant context.
- **Explicit `schoolId`** on every tenant read/create incl. inside `$transaction`; the `Verification` create at release/correction sets `schoolId` as a plain reference column (not for scoping).
- **Term label** = `"<academicYear.name> · Term <number>"` — consistent across release/correction snapshots + the report card.
- **Public payload** must contain ONLY {valid, student, className, term, school, average, position, issuedAt} — no entries/ids.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **`@mymakaranta/ui` / tokens / `next/navigation`** — reconcile against `release/page.tsx` + the login page.
- The QR uses the client-side `qrcode` lib → data URL `<img>`; data URLs don't need `next/image`.
