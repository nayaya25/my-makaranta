# Proprietor-Signed Correction (tenant-configurable OTP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A proprietor corrects one released component score on the frozen sheet — reason-required, audited via a dedicated `Correction` record, OTP-signed when the tenant requires it — and the system re-freezes the affected student and re-ranks the whole class.

**Architecture:** Extends the `assessment` module with a `correction` service/controller + a `Correction` model + a per-school `requireCorrectionOtp` flag, and adds a reusable `AuthService.assertOtp`. Re-uses `computeSubjectResult` (slice 2) and `computePositions` (slice 4). Web adds a correction modal to `/release` + a Settings toggle.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e (service-level) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-sprint-3-slice-4_5-proprietor-correction-design.md`

**Branch:** `sprint-3-correction` (already created).

**KEY CONVENTIONS (slices 1–4):** explicitly scope every read by `schoolId` via `TenantContext.schoolIdOrThrow()` + `where:{schoolId}`; set `schoolId` on every create incl. inside `$transaction` (the `tx` client runs NO middleware); validate request ids via tenant-scoped `findFirst` (IDOR); e2e is service-level inside `TenantContext.run`; ids are cuids; `noUncheckedIndexedAccess` (`?.`/`!`). Score unique key is `studentId_subjectId_assessmentTypeId_termId`. `computeSubjectResult(cells, typeIds, boundaries) → {total, grade, remark, complete}`. `computePositions(students:{studentId,average}[]) → Map`.

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (`Correction` model + `School.requireCorrectionOtp` + back-relations), `apps/api/src/core/prisma/prisma.service.ts` (TENANT_MODELS), `apps/api/prisma/seed.ts` (permission), new migrations
- Modify: `apps/api/src/core/auth/auth.service.ts` (`assertOtp`); Test `apps/api/test/auth.e2e-spec.ts`
- Create: `apps/api/src/modules/assessment/correction.service.ts`, `correction.controller.ts`
- Modify: `apps/api/src/modules/assessment/dto/assessment.dto.ts`, `assessment.module.ts`, `test/assessment.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/release/page.tsx`, `apps/web/src/app/(app)/settings/assessment/page.tsx`

---

## Task 1: `Correction` model + `School.requireCorrectionOtp` + permission + migration

**Files:** Modify `schema.prisma`, `prisma.service.ts`, `seed.ts`

- [ ] **Step 1: Add the `Correction` model** to `schema.prisma` (after `ResultSheetEntry`):
```prisma
model Correction {
  id               String        @id @default(cuid())
  schoolId         String
  school           School        @relation(fields: [schoolId], references: [id])
  classId          String
  class            Class         @relation(fields: [classId], references: [id])
  termId           String
  term             Term          @relation(fields: [termId], references: [id])
  studentId        String
  student          Student       @relation(fields: [studentId], references: [id])
  subjectId        String
  subject          Subject       @relation(fields: [subjectId], references: [id])
  assessmentTypeId String
  assessmentType   AssessmentType @relation(fields: [assessmentTypeId], references: [id])
  oldValue         Int
  newValue         Int
  oldTotal         Int
  newTotal         Int
  oldPosition      Int
  newPosition      Int
  reason           String
  otpVerified      Boolean
  correctedBy      String
  correctedAt      DateTime      @default(now())

  @@index([schoolId, classId, termId])
}
```

- [ ] **Step 2: Add the flag + back-relations.** On `School`: add `requireCorrectionOtp Boolean @default(true)` (near `currency`) and `corrections Correction[]`. Add `corrections Correction[]` to `Class`, `Term`, `Student`, `Subject`, `AssessmentType`.

- [ ] **Step 3:** In `prisma.service.ts`, add `"Correction"` to `TENANT_MODELS`.

- [ ] **Step 4: Add the permission** in `seed.ts` `PERMISSIONS` (after the `results.release` line):
```ts
  ["results.correct", "Correct (override) a released result score"],
```

- [ ] **Step 5: Migrate** (from `apps/api`; stop any dev server first):
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta/apps/api" && pnpm exec prisma migrate dev --name correction_model
```
Expected: applied + "in sync". Then re-seed the permission catalog: `pnpm exec prisma db seed` (idempotent upsert).

- [ ] **Step 6:** `pnpm exec prisma validate` + `pnpm --filter @mymakaranta/api typecheck` → clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/seed.ts apps/api/prisma/migrations
git commit -m "feat(assessment): Correction model + School.requireCorrectionOtp + results.correct permission"
```

---

## Task 2: RLS migration for `Correction`

**Files:** Create `apps/api/prisma/migrations/<ts>_rls_correction/migration.sql`

- [ ] **Step 1:** `cd apps/api && pnpm exec prisma migrate dev --create-only --name rls_correction`.

- [ ] **Step 2:** Replace the generated `migration.sql` with (mirrors `rls_release`):
```sql
-- Defense-in-depth tenant isolation for Correction.
ALTER TABLE "Correction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Correction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Correction";
CREATE POLICY tenant_isolation ON "Correction"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Correction" TO mymakaranta_app;
```

- [ ] **Step 3:** `pnpm exec prisma migrate dev` → applied; `pnpm exec prisma migrate status` → up to date.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/migrations
git commit -m "feat(assessment): RLS (FORCE) for Correction"
```

---

## Task 3: `AuthService.assertOtp` + auth e2e

**Files:** Modify `apps/api/src/core/auth/auth.service.ts`; Test `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** Read `apps/api/test/auth.e2e-spec.ts` to match its setup (it has an `AuthService` handle + a `SmsService` — `SmsService.lastCodeForTest(phone)` returns the last code when `NODE_ENV=test`). Add:
```ts
  describe("assertOtp (step-up)", () => {
    const phone = "+2348090000111";

    it("accepts a fresh code once, then rejects the replay", async () => {
      await auth.requestOtp(phone);
      const code = sms.lastCodeForTest(phone)!;
      await expect(auth.assertOtp(phone, code)).resolves.toBeUndefined();
      await expect(auth.assertOtp(phone, code)).rejects.toThrow(/invalid|expired/i);
    });

    it("rejects a wrong code", async () => {
      await auth.requestOtp(phone);
      await expect(auth.assertOtp(phone, "000000")).rejects.toThrow(/invalid|expired/i);
    });
  });
```
Ensure `auth` (AuthService) and `sms` (SmsService) handles exist in that file's `beforeAll` via `moduleRef.get(...)`; add them if missing.

- [ ] **Step 2:** Run `pnpm --filter @mymakaranta/api test:e2e -- auth` → FAIL (`assertOtp` undefined).

- [ ] **Step 3: Implement `assertOtp`** in `auth.service.ts` (add after `verifyOtp`; mirrors its validation minus JWT/user, single-uses the code):
```ts
  /** Step-up re-verification: validate a fresh OTP for an already-authenticated user. No JWT issued; single-use. */
  async assertOtp(phone: string, code: string): Promise<void> {
    const otp = await this.prisma.otpRequest.findFirst({
      where: { phone, consumed: false },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt < new Date()) throw new BadRequestException("Invalid or expired code.");
    if (otp.attempts >= MAX_ATTEMPTS) throw new BadRequestException("Too many attempts.");
    const ok = await bcrypt.compare(code, otp.codeHash);
    await this.prisma.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 }, consumed: ok },
    });
    if (!ok) throw new BadRequestException("Invalid or expired code.");
  }
```

- [ ] **Step 4:** Run `pnpm --filter @mymakaranta/api test:e2e -- auth` → PASS (incl. the 2 new). Full suite stays green.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/core/auth/auth.service.ts apps/api/test/auth.e2e-spec.ts
git commit -m "feat(auth): assertOtp — single-use step-up OTP re-verification"
```

---

## Task 4: Correction service `correct()` + DTO + controller POST + e2e

**Files:** Create `correction.service.ts`, `correction.controller.ts`; modify `dto/assessment.dto.ts`, `assessment.module.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: DTOs.** In `apps/api/src/modules/assessment/dto/assessment.dto.ts` add (match the file's existing class-validator style):
```ts
export class CorrectScoreDto {
  @IsString() @IsNotEmpty() classId!: string;
  @IsString() @IsNotEmpty() termId!: string;
  @IsString() @IsNotEmpty() studentId!: string;
  @IsString() @IsNotEmpty() subjectId!: string;
  @IsString() @IsNotEmpty() assessmentTypeId!: string;
  @IsInt() @Min(0) newValue!: number;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() otpCode?: string;
}

export class CorrectionConfigDto {
  @IsBoolean() requireCorrectionOtp!: boolean;
}
```
Ensure the import line includes `IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min` from `class-validator` (add any missing).

- [ ] **Step 2: Failing e2e.** In `test/assessment.e2e-spec.ts`, inside the top-level describe, add a `describe("correction", ...)`. It builds its own released class with a tie-adjacent cohort so a correction flips ranking, and uses `AuthService` + `SmsService` for OTP. Add handles: `let correction: CorrectionService;`, `let auth: AuthService;`, `let sms: SmsService;` assigned in the top-level `beforeAll` (`moduleRef.get(...)`). Import `CorrectionService` from `../src/modules/assessment/correction.service`, `AuthService` from `../src/core/auth/auth.service`, `SmsService` from `../src/core/auth/sms.service`.
```ts
  describe("correction", () => {
    let cTerm: string; let subj: string; let cls: string;
    let lo: string; let hi: string; // lo starts behind, correction lifts lo above hi
    let caId: string; let examId: string;
    const actorPhone = "+2348090000222";

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 2, startDate: new Date("2025-01-10"), endDate: new Date("2025-04-10"), isCurrent: false } });
      cTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Biology", code: `BIO-${suffix}` } });
      subj = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `SS1-${suffix}`, order: 4 } });
      const klass = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `SS1A-${suffix}` } });
      cls = klass.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `CR-${suffix}`, firstName: "Cor", lastName: "T", email: `cr${suffix}@s.test`, phone: "+2348000000333" } });
      await prisma.subjectAssignment.create({ data: { schoolId, subjectId: subj, classId: cls, staffId: staff.id, academicYearId } });
      const t = await asA(() => types.list());
      caId = t.find((x) => x.name === "CA1")!.id;
      examId = t.find((x) => x.name === "Exam")!.id;
      const mk = async (label: string, caV: number, examV: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2009-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: cTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: cTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: caV }, { studentId: st.id, assessmentTypeId: examId, value: examV },
        ] }, "rec"));
        return st.id;
      };
      lo = await mk("Lo", 10, 40); // total 50 -> behind
      hi = await mk("Hi", 20, 50); // total 70 -> ahead
      await asA(() => release2.release(cls, cTerm, "principal"));
      // ensure OTP is required for school A (default true)
    });

    const freshOtp = async () => { await auth.requestOtp(actorPhone); return sms.lastCodeForTest(actorPhone)!; };
    const actor = { id: "prop-1", phone: actorPhone, schoolId, identityType: "PROPRIETOR" };

    it("corrects a score (OTP required), re-ranks the class, and records the Correction", async () => {
      // pre: Hi=1, Lo=2
      const before = await asA(() => release2.getSheet(cls, cTerm));
      expect(before.students.find((s) => s.name.startsWith("Lo"))!.position).toBe(2);
      const code = await freshOtp();
      // lift Lo's Exam 40 -> 60 => total 70? actually 10+60=70 ties Hi(70) -> both rank 1
      await asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: examId, newValue: 60, reason: "marking error", otpCode: code }, actor));
      const after = await asA(() => release2.getSheet(cls, cTerm));
      const loRow = after.students.find((s) => s.name.startsWith("Lo"))!;
      expect(loRow.entries[0]!.total).toBe(70);
      expect(loRow.average).toBe(70);
      expect(loRow.position).toBe(1); // tie with Hi
      const rec = await prisma.correction.findFirst({ where: { schoolId, studentId: lo, subjectId: subj, assessmentTypeId: examId } });
      expect(rec).toBeTruthy();
      expect(rec!.oldValue).toBe(40); expect(rec!.newValue).toBe(60);
      expect(rec!.oldTotal).toBe(50); expect(rec!.newTotal).toBe(70);
      expect(rec!.oldPosition).toBe(2); expect(rec!.newPosition).toBe(1);
      expect(rec!.otpVerified).toBe(true);
      expect(rec!.reason).toBe("marking error");
    });

    it("rejects an invalid OTP when the tenant requires it", async () => {
      await auth.requestOtp(actorPhone);
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: "000000" }, actor))).rejects.toThrow(/invalid|expired/i);
    });

    it("rejects an empty reason", async () => {
      const code = await freshOtp();
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "  ", otpCode: code }, actor))).rejects.toThrow(/reason/i);
    });

    it("rejects a value above the component max", async () => {
      const code = await freshOtp();
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 999, reason: "x", otpCode: code }, actor))).rejects.toThrow(/max|exceed/i);
    });

    it("rejects correcting an unreleased class", async () => {
      const code = await freshOtp();
      // JSS1A-style fresh unreleased class would need setup; reuse: a term with no release
      const t2 = await prisma.term.create({ data: { schoolId, academicYearId, number: 4, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-01"), isCurrent: false } });
      await expect(asA(() => correction.correct({ classId: cls, termId: t2.id, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: code }, actor))).rejects.toThrow(/not released|released/i);
    });

    it("rejects cross-tenant correction", async () => {
      const code = await freshOtp();
      await expect(asB(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: code }, { ...actor, schoolId: schoolIdB }), )).rejects.toThrow(/not found/i);
    });
  });
```
NOTE: confirm the e2e file exposes `schoolIdB` (school B's id) or the `asB` helper's school id; if it's named differently, use the real handle. If school B's id isn't already captured, capture it in the top-level beforeAll. The `actor` object matches `RequestUser` ({id, phone, schoolId, identityType}).

- [ ] **Step 3:** Run e2e → the `correction` describe FAILS (service missing).

- [ ] **Step 4: Implement `correction.service.ts`:**
```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AuthService } from "../../core/auth/auth.service";
import { computeSubjectResult } from "./score.util";
import { computePositions } from "./position.util";
import { CorrectScoreDto } from "./dto/assessment.dto";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class CorrectionService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  async getConfig() {
    const schoolId = TenantContext.schoolIdOrThrow();
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { requireCorrectionOtp: true } });
    return { requireCorrectionOtp: school?.requireCorrectionOtp ?? true };
  }

  async setConfig(requireCorrectionOtp: boolean) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.school.update({ where: { id: schoolId }, data: { requireCorrectionOtp } });
    return { requireCorrectionOtp };
  }

  async getCorrectableScores(classId: string, termId: string, studentId: string, subjectId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertTarget(schoolId, classId, termId, studentId, subjectId);
    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const rows = await this.prisma.score.findMany({ where: { schoolId, studentId, subjectId, termId } });
    const byType = new Map(rows.map((r) => [r.assessmentTypeId, r.value]));
    return types.map((t) => ({ assessmentTypeId: t.id, name: t.name, maxScore: t.maxScore, value: byType.get(t.id) ?? null }));
  }

  private async assertTarget(schoolId: string, classId: string, termId: string, studentId: string, subjectId: string) {
    const [klass, term, subject] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    const sheet = await this.prisma.resultSheet.findFirst({ where: { schoolId, classId, termId, studentId } });
    if (!sheet) throw new NotFoundException("No released result sheet for this student/class/term.");
    return { sheet };
  }

  async correct(dto: CorrectScoreDto, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();

    // OTP gate (tenant-configurable).
    const cfg = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { requireCorrectionOtp: true } });
    const otpRequired = cfg?.requireCorrectionOtp ?? true;
    if (otpRequired) {
      if (!actor.phone) throw new BadRequestException("No phone on the authenticated account for OTP.");
      if (!dto.otpCode) throw new BadRequestException("OTP code required.");
      await this.auth.assertOtp(actor.phone, dto.otpCode);
    }

    if (!dto.reason || dto.reason.trim().length === 0) throw new BadRequestException("A correction reason is required.");

    // Tenant + release validation.
    const { sheet } = await this.assertTarget(schoolId, dto.classId, dto.termId, dto.studentId, dto.subjectId);
    const release = await this.prisma.release.findFirst({ where: { classId: dto.classId, termId: dto.termId, schoolId } });
    if (!release) throw new ConflictException("Class not released; edit in the gradebook.");
    const type = await this.prisma.assessmentType.findFirst({ where: { id: dto.assessmentTypeId, schoolId } });
    if (!type) throw new NotFoundException("Assessment type not found in this school.");
    if (dto.newValue < 0 || dto.newValue > type.maxScore) {
      throw new BadRequestException(`Score ${dto.newValue} exceeds max ${type.maxScore} for this component.`);
    }

    // Capture old state.
    const oldScore = await this.prisma.score.findFirst({ where: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId } });
    const oldValue = oldScore?.value ?? 0;
    const oldEntry = await this.prisma.resultSheetEntry.findFirst({ where: { schoolId, resultSheetId: sheet.id, subjectId: dto.subjectId } });
    const oldTotal = oldEntry?.total ?? 0;
    const oldPosition = sheet.position;

    // Recompute the corrected subject + the student's average + the whole-class re-rank.
    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const typeIds = types.map((t) => t.id);
    const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });

    await this.prisma.$transaction(async (tx) => {
      // 1. Upsert the score.
      await tx.score.upsert({
        where: { studentId_subjectId_assessmentTypeId_termId: { studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId } },
        create: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, classId: dto.classId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId, value: dto.newValue, recordedBy: actor.id },
        update: { value: dto.newValue, classId: dto.classId, recordedBy: actor.id },
      });

      // 2. Recompute corrected subject total/grade from live scores of that subject.
      const subjScores = await tx.score.findMany({ where: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, termId: dto.termId } });
      const r = computeSubjectResult(subjScores.map((s) => ({ assessmentTypeId: s.assessmentTypeId, value: s.value })), typeIds, boundaries);
      const newTotal = r.total;

      // 3. Update or create the frozen entry.
      if (oldEntry) {
        await tx.resultSheetEntry.update({ where: { id: oldEntry.id }, data: { total: newTotal, grade: r.grade ?? "" } });
      } else {
        await tx.resultSheetEntry.create({ data: { schoolId, resultSheetId: sheet.id, subjectId: dto.subjectId, total: newTotal, grade: r.grade ?? "" } });
      }

      // 4. Recompute the student's average over their (now-updated) entries.
      const entries = await tx.resultSheetEntry.findMany({ where: { schoolId, resultSheetId: sheet.id } });
      const totals = entries.map((e) => e.total);
      const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      await tx.resultSheet.update({ where: { id: sheet.id }, data: { average } });

      // 5. Re-rank the whole class from stored averages.
      const sheets = await tx.resultSheet.findMany({ where: { schoolId, classId: dto.classId, termId: dto.termId }, select: { id: true, studentId: true, average: true } });
      const positions = computePositions(sheets.map((s) => ({ studentId: s.studentId, average: s.average })));
      for (const s of sheets) {
        const pos = positions.get(s.studentId) ?? 0;
        await tx.resultSheet.update({ where: { id: s.id }, data: { position: pos } });
      }
      const newPosition = positions.get(dto.studentId) ?? 0;

      // 6. Record the correction.
      await tx.correction.create({
        data: {
          schoolId, classId: dto.classId, termId: dto.termId, studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId,
          oldValue, newValue: dto.newValue, oldTotal, newTotal, oldPosition, newPosition,
          reason: dto.reason.trim(), otpVerified: otpRequired, correctedBy: actor.id,
        },
      });
    });

    return { corrected: true };
  }
}
```

- [ ] **Step 5: Implement `correction.controller.ts`** (POST only this task; config/scores GET added next task — but include all routes now to avoid a second controller edit):
```ts
import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { CorrectionService } from "./correction.service";
import { CorrectScoreDto, CorrectionConfigDto } from "./dto/assessment.dto";

@Controller("v1/assessment/correction")
export class CorrectionController {
  constructor(private service: CorrectionService) {}

  @Get("config")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  getConfig() {
    return this.service.getConfig();
  }

  @Patch("config")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  setConfig(@Body() dto: CorrectionConfigDto) {
    return this.service.setConfig(dto.requireCorrectionOtp);
  }

  @Get("scores")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  scores(@Query("classId") classId: string, @Query("termId") termId: string, @Query("studentId") studentId: string, @Query("subjectId") subjectId: string) {
    return this.service.getCorrectableScores(classId, termId, studentId, subjectId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  correct(@Body() dto: CorrectScoreDto, @CurrentUser() user: RequestUser) {
    return this.service.correct(dto, user);
  }
}
```
Confirm the guard/decorator import paths match `release.controller.ts` exactly; fix if different.

- [ ] **Step 6: Register** `CorrectionService` (providers) + `CorrectionController` (controllers) in `assessment.module.ts`. (AuthModule is already imported, exporting AuthService.)

- [ ] **Step 7:** Run e2e → all `correction` tests + full suite green. `pnpm --filter @mymakaranta/api build` + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/assessment/correction.service.ts apps/api/src/modules/assessment/correction.controller.ts apps/api/src/modules/assessment/dto/assessment.dto.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): proprietor-signed correction — re-freeze + re-rank + audit (OTP-gated)"
```

---

## Task 5: Config + correctable-scores e2e (OTP-off path)

**Files:** Modify `test/assessment.e2e-spec.ts`

(The service methods + routes already exist from Task 4; this task proves the config flag + read.)

- [ ] **Step 1: Add tests** inside the `describe("correction")` block (after the existing ones):
```ts
    it("exposes and flips the OTP config (tenant-scoped)", async () => {
      const c0 = await asA(() => correction.getConfig());
      expect(c0.requireCorrectionOtp).toBe(true);
      const c1 = await asA(() => correction.setConfig(false));
      expect(c1.requireCorrectionOtp).toBe(false);
      expect((await asA(() => correction.getConfig())).requireCorrectionOtp).toBe(false);
    });

    it("allows a correction with NO otp when the tenant disabled it (otpVerified=false)", async () => {
      await asA(() => correction.setConfig(false));
      await asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: hi, subjectId: subj, assessmentTypeId: caId, newValue: 15, reason: "no-otp path", otpCode: undefined }, actor));
      const rec = await prisma.correction.findFirst({ where: { schoolId, studentId: hi, assessmentTypeId: caId }, orderBy: { correctedAt: "desc" } });
      expect(rec!.otpVerified).toBe(false);
      await asA(() => correction.setConfig(true)); // restore for any later tests
    });

    it("returns correctable component scores for a student+subject", async () => {
      const comps = await asA(() => correction.getCorrectableScores(cls, cTerm, hi, subj));
      const exam = comps.find((c) => c.name === "Exam")!;
      expect(exam.maxScore).toBe(70);
      expect(typeof exam.value === "number" || exam.value === null).toBe(true);
    });
```
NOTE: `actor`, `cls`, `cTerm`, `hi`, `subj`, `caId` are in scope from Task 4's block. These tests mutate the school A flag — the last test restores `true`; if any later describe relies on the flag, confirm ordering.

- [ ] **Step 2:** Run e2e → green (full suite).

- [ ] **Step 3: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/test/assessment.e2e-spec.ts
git commit -m "test(assessment): correction OTP-config flip + no-OTP path + correctable scores"
```

---

## Task 6: Web api client — correction

**Files:** Modify `apps/web/src/lib/api.ts`

- [ ] **Step 1: Types** (near the other assessment interfaces):
```ts
export interface CorrectableComponent {
  assessmentTypeId: string;
  name: string;
  maxScore: number;
  value: number | null;
}

export interface CorrectScorePayload {
  classId: string;
  termId: string;
  studentId: string;
  subjectId: string;
  assessmentTypeId: string;
  newValue: number;
  reason: string;
  otpCode?: string;
}
```

- [ ] **Step 2: Methods** inside the `api` object (match the existing `authedRequest` style; confirm a `requestOtp` already exists — if not, add it):
```ts
  getCorrectionConfig: () =>
    authedRequest<{ requireCorrectionOtp: boolean }>("/v1/assessment/correction/config"),
  setCorrectionConfig: (requireCorrectionOtp: boolean) =>
    authedRequest<{ requireCorrectionOtp: boolean }>("/v1/assessment/correction/config", {
      method: "PATCH",
      body: JSON.stringify({ requireCorrectionOtp }),
    }),
  getCorrectableScores: (classId: string, termId: string, studentId: string, subjectId: string) =>
    authedRequest<CorrectableComponent[]>(`/v1/assessment/correction/scores?classId=${classId}&termId=${termId}&studentId=${studentId}&subjectId=${subjectId}`),
  correctScore: (payload: CorrectScorePayload) =>
    authedRequest<{ corrected: boolean }>("/v1/assessment/correction", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  requestCorrectionOtp: (phone: string) =>
    authedRequest<void>("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),
```
NOTE: if `/auth/otp/request` is unauthenticated and `authedRequest` injects a bearer that's harmless, fine; otherwise use the plain request helper the login page uses. Check how the login page calls OTP request and mirror it for `requestCorrectionOtp`.

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts
git commit -m "feat(assessment): web api client for corrections + OTP config"
```

---

## Task 7: Web — correction modal on `/release` + Settings toggle

**Files:** Modify `apps/web/src/app/(app)/release/page.tsx`, `apps/web/src/app/(app)/settings/assessment/page.tsx`

- [ ] **Step 1: Settings toggle.** In `settings/assessment/page.tsx`, read its existing patterns (panels, `@mymakaranta/ui` imports, save handlers). Add a small "Result corrections" section with a checkbox/switch bound to `getCorrectionConfig()` / `setCorrectionConfig(next)`:
```tsx
// state
const [requireOtp, setRequireOtp] = useState<boolean | null>(null);
useEffect(() => { void api.getCorrectionConfig().then((c) => setRequireOtp(c.requireCorrectionOtp)); }, []);
const toggleOtp = async () => {
  if (requireOtp === null) return;
  const next = !requireOtp;
  setRequireOtp(next);
  try { await api.setCorrectionConfig(next); } catch { setRequireOtp(!next); }
};
```
Render (place in a section consistent with the page; use a native checkbox + label if the design system has no Switch):
```tsx
<label className="flex items-center gap-2 text-small text-ink-700 dark:text-ink-300">
  <input type="checkbox" checked={requireOtp ?? true} onChange={toggleOtp} className="h-4 w-4" />
  Require OTP for result corrections
</label>
```
Add `getCorrectionConfig`/`setCorrectionConfig` to the `api` import as needed.

- [ ] **Step 2: Correction modal on `/release`.** In `release/page.tsx`, add per-student correction. Read the existing file first (it has `sheet.data.students`, `Button`, etc.). Add:
  - On load, fetch the OTP config once: `const [requireOtp, setRequireOtp] = useState(true);` + `useEffect(() => { void api.getCorrectionConfig().then((c) => setRequireOtp(c.requireCorrectionOtp)).catch(() => {}); }, []);`
  - A `Correct` button in each student row of the rendered sheet, opening a modal with state:
```tsx
const [correcting, setCorrecting] = useState<{ studentId: string; name: string } | null>(null);
const [subjectId, setSubjectId] = useState("");
const [comps, setComps] = useState<CorrectableComponent[]>([]);
const [typeId, setTypeId] = useState("");
const [newValue, setNewValue] = useState("");
const [reason, setReason] = useState("");
const [otp, setOtp] = useState("");
const [otpSent, setOtpSent] = useState(false);
const [cErr, setCErr] = useState<string | null>(null);
const [cBusy, setCBusy] = useState(false);
```
  - When a subject is chosen in the modal, load components: `await api.getCorrectableScores(sheet.classId, termId, correcting.studentId, subjectId)` → `setComps`. (Use the released `sheet.classId` — confirm the page tracks the released class id; the `sheet` state holds `{classId, data}`.)
  - "Send code" button (only when `requireOtp`): `await api.requestCorrectionOtp(user.phone)` — read the logged-in user's phone from `localStorage` `mm.user` (the page can parse it) → `setOtpSent(true)`. If phone unavailable, show guidance.
  - Submit:
```tsx
const submitCorrection = async () => {
  setCBusy(true); setCErr(null);
  try {
    await api.correctScore({ classId: sheet!.classId, termId, studentId: correcting!.studentId, subjectId, assessmentTypeId: typeId, newValue: Number(newValue), reason, otpCode: requireOtp ? otp : undefined });
    setCorrecting(null);
    setSheet({ classId: sheet!.classId, data: await api.getReleasedSheet(sheet!.classId, termId) }); // refresh
  } catch (e) {
    setCErr(e instanceof ApiError ? e.message : "Correction failed.");
  } finally { setCBusy(false); }
};
```
  - Modal markup: subject `<select>` (options from `sheet.data.students.find(...).entries` → subjectId+subjectName), component `<select>` (from `comps`, showing `name` + current `value`), number input for `newValue`, text input for `reason`, and (when `requireOtp`) an OTP input + Send code button; a Submit button (disabled while `cBusy` or missing required fields); inline `cErr`. Reuse the page's token classes.

- [ ] **Step 3: Verify (no dev server running):**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; fix unused imports / prop mismatches. Import `CorrectableComponent`, `ApiError` as needed.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add "apps/web/src/app/(app)/release/page.tsx" "apps/web/src/app/(app)/settings/assessment/page.tsx"
git commit -m "feat(assessment): correction modal on /release + Settings OTP toggle"
```

---

## Task 8: Browser QA + docs + finish

- [ ] **Step 1: Backfill the permission** for the existing QA proprietor (the auto-grant only fires at school creation). Using a one-off Prisma script in `apps/api` (delete after):
```js
// grant results.correct to all existing proprietors that lack it
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const perm = await p.permission.findUnique({ where: { key: "results.correct" } });
const props = await p.user.findMany({ where: { identityType: "PROPRIETOR" } });
for (const u of props) {
  await p.userPermission.upsert({ where: { userId_permissionId: { userId: u.id, permissionId: perm.id } }, create: { userId: u.id, permissionId: perm.id, scope: {} }, update: {} });
}
console.log(`backfilled ${props.length} proprietors`);
await p.$disconnect();
```
(Confirm the `userPermission` unique key name `userId_permissionId`; adjust if different. The proprietor must re-login to refresh the JWT only if permissions are read from the token — they're DB-resolved by `PermissionGuard`, so no re-login needed.)

- [ ] **Step 2: Browser QA** (RESUME playbook; per-call auth re-inject). Start API + web. Log in as the QA proprietor (`+2348033344455`, school "S3 Gradebook QA" with the released JSS1A). On `/release` → View the released sheet → use the per-student **Correct** action on Bola Ade → pick Mathematics → a component (e.g. Exam) → new value + reason → **Send code** (OTP prints to api log) → enter it → Submit → confirm the sheet re-ranks/totals update + a `Correction` row exists (verify via Prisma). Then in **Settings → Assessment**, turn **off** "Require OTP for result corrections"; back on `/release`, the correction modal no longer shows the OTP field and a correction submits without it. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored). (Gotchas: stop web dev before any prod build; re-inject `mm.token`/`mm.user`; OTP code regex `code is [0-9]{6}`.)

- [ ] **Step 3: Update `docs/RESUME.md`** — current state: slice 4.5 (proprietor-signed correction, tenant-configurable OTP) built + QA'd on `sprint-3-correction`; remaining slices 5–6; note `results.correct` backfill done for QA proprietor. Commit.

- [ ] **Step 4: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + builds, then merge `sprint-3-correction` → main per the user's choice).

---

## Notes for the implementer
- **Explicit `schoolId`** on every read AND every create, incl. inside the interactive `$transaction` (the `tx` client runs no middleware). `Enrollment`/`ResultSheet` gated by tenant-scoped finds.
- **Re-rank uses stored averages** read back inside the txn AFTER updating the corrected student's average, so positions reflect the change.
- **Average = mean of the student's frozen entries** (the corrected subject's entry is updated/created first). Matches slice-4 release averaging.
- **OTP single-use:** `assertOtp` consumes the code; the e2e requests a fresh code per correction.
- **`otpVerified`** is `true` only when the tenant flag was on at correction time.
- **`noUncheckedIndexedAccess`** — `entries[0]!`, `comps.find(...)!`, etc.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **`@mymakaranta/ui`** — confirm component/prop names against `release/page.tsx` + `settings/assessment/page.tsx`.
