# Release Workflow & Immutability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A principal releases a class's term results — freezing per-subject totals/grades + overall average + position-in-class into immutable `ResultSheet` rows — and all further score edits for that class+term are blocked.

**Architecture:** Extends the `assessment` module with `Release`/`ResultSheet`/`ResultSheetEntry` (tenant-scoped + RLS), a pure `computePositions` helper, a release service/controller (`results.release`), and an immutability check in `ScoresService`. Frozen rows are served on read, never recomputed. Web adds a `/release` dashboard.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e (service-level) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-sprint-3-slice-4-release-immutability-design.md`

**Branch:** `sprint-3-release` (already created).

**KEY CONVENTIONS (slices 1–3):** explicitly scope every read by `schoolId` via `TenantContext.schoolIdOrThrow()` + `where:{schoolId}`; set `schoolId` on every create (incl. inside `$transaction`); validate request ids via tenant-scoped `findFirst` (IDOR); `Enrollment` has no `schoolId` (gate via class check); e2e service-level inside `TenantContext.run`; `noUncheckedIndexedAccess` (`?.`/`!`).

---

## File Structure
- Create: `apps/api/src/modules/assessment/position.util.ts` + `position.util.spec.ts`
- Create: `apps/api/src/modules/assessment/release.service.ts` + `release.controller.ts`
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`, `assessment.module.ts`, `scores.service.ts`, `test/assessment.e2e-spec.ts`, new migrations
- Create: `apps/web/src/app/(app)/release/page.tsx`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`

---

## Task 1: Models + tenancy + migration

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`

- [ ] **Step 1: Append models** to `schema.prisma` (after `Score`):
```prisma
model Release {
  id           String        @id @default(cuid())
  schoolId     String
  school       School        @relation(fields: [schoolId], references: [id])
  classId      String
  class        Class         @relation(fields: [classId], references: [id])
  termId       String
  term         Term          @relation(fields: [termId], references: [id])
  releasedBy   String
  releasedAt   DateTime      @default(now())
  resultSheets ResultSheet[]

  @@unique([classId, termId])
}

model ResultSheet {
  id        String             @id @default(cuid())
  schoolId  String
  school    School             @relation(fields: [schoolId], references: [id])
  releaseId String
  release   Release            @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  studentId String
  student   Student            @relation(fields: [studentId], references: [id])
  classId   String
  class     Class              @relation(fields: [classId], references: [id])
  termId    String
  term      Term               @relation(fields: [termId], references: [id])
  average   Int
  position  Int
  entries   ResultSheetEntry[]

  @@unique([studentId, termId])
  @@index([schoolId, classId, termId])
}

model ResultSheetEntry {
  id            String      @id @default(cuid())
  schoolId      String
  school        School      @relation(fields: [schoolId], references: [id])
  resultSheetId String
  resultSheet   ResultSheet @relation(fields: [resultSheetId], references: [id], onDelete: Cascade)
  subjectId     String
  subject       Subject     @relation(fields: [subjectId], references: [id])
  total         Int
  grade         String

  @@unique([resultSheetId, subjectId])
}
```

- [ ] **Step 2: Back-relations** on existing models: `School` → `releases Release[]`, `resultSheets ResultSheet[]`, `resultSheetEntries ResultSheetEntry[]`; `Class` → `releases Release[]`, `resultSheets ResultSheet[]`; `Term` → `releases Release[]`, `resultSheets ResultSheet[]`; `Student` → `resultSheets ResultSheet[]`; `Subject` → `resultSheetEntries ResultSheetEntry[]`.

- [ ] **Step 3:** In `prisma.service.ts`, add to `TENANT_MODELS`: `"Release", "ResultSheet", "ResultSheetEntry"`.

- [ ] **Step 4:** From `apps/api`: `pnpm exec prisma migrate dev --name release_models`. Expected: applied, "in sync". (Stop any API dev server first — engine DLL lock.)

- [ ] **Step 5:** `pnpm exec prisma validate` + `pnpm --filter @mymakaranta/api typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(assessment): Release/ResultSheet/ResultSheetEntry models + tenant scoping"
```

---

## Task 2: RLS migration

**Files:** Create `apps/api/prisma/migrations/<ts>_rls_release/migration.sql`

- [ ] **Step 1:** `pnpm exec prisma migrate dev --create-only --name rls_release` (from `apps/api`).

- [ ] **Step 2:** Replace the generated `migration.sql` with (mirror `*_rls_score`, one block per table):
```sql
-- Defense-in-depth tenant isolation for release tables.
ALTER TABLE "Release" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Release" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Release";
CREATE POLICY tenant_isolation ON "Release"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Release" TO mymakaranta_app;

ALTER TABLE "ResultSheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultSheet" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ResultSheet";
CREATE POLICY tenant_isolation ON "ResultSheet"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ResultSheet" TO mymakaranta_app;

ALTER TABLE "ResultSheetEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultSheetEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ResultSheetEntry";
CREATE POLICY tenant_isolation ON "ResultSheetEntry"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ResultSheetEntry" TO mymakaranta_app;
```

- [ ] **Step 3:** `pnpm exec prisma migrate dev` → applied; `pnpm exec prisma migrate status` → up to date.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/migrations
git commit -m "feat(assessment): RLS (FORCE) for release tables"
```

---

## Task 3: computePositions (pure)

**Files:** Create `apps/api/src/modules/assessment/position.util.ts`, `position.util.spec.ts`

- [ ] **Step 1: Failing test** — `position.util.spec.ts`:
```ts
import { computePositions } from "./position.util";

describe("computePositions", () => {
  it("ranks by average descending", () => {
    const m = computePositions([
      { studentId: "a", average: 60 }, { studentId: "b", average: 90 }, { studentId: "c", average: 75 },
    ]);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(2);
    expect(m.get("a")).toBe(3);
  });

  it("uses standard competition ranking for ties (1,2,2,4)", () => {
    const m = computePositions([
      { studentId: "a", average: 90 }, { studentId: "b", average: 80 },
      { studentId: "c", average: 80 }, { studentId: "d", average: 70 },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(2);
    expect(m.get("d")).toBe(4);
  });

  it("returns an empty map for no students", () => {
    expect(computePositions([]).size).toBe(0);
  });
});
```

- [ ] **Step 2:** `pnpm exec jest position.util` (from `apps/api`) → FAIL.

- [ ] **Step 3: Implement `position.util.ts`:**
```ts
export interface StudentAverage {
  studentId: string;
  average: number;
}

/**
 * Standard competition ranking ("1224"): position = 1 + (# of students with a
 * strictly greater average). Tied students share a position; the next distinct
 * average skips accordingly. Empty input → empty map.
 */
export function computePositions(students: StudentAverage[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of students) {
    const higher = students.filter((o) => o.average > s.average).length;
    out.set(s.studentId, higher + 1);
  }
  return out;
}
```

- [ ] **Step 4:** `pnpm exec jest position.util` → PASS (3).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/assessment/position.util.ts apps/api/src/modules/assessment/position.util.spec.ts
git commit -m "feat(assessment): computePositions (competition ranking)"
```

---

## Task 4: Release service + controller + e2e

**Files:** Create `release.service.ts`, `release.controller.ts`; modify `assessment.module.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** In `assessment.e2e-spec.ts`: import `ReleaseService` from `../src/modules/assessment/release.service`; `let release2: ReleaseService;` (name avoids clashing with any `release` var); `release2 = moduleRef.get(ReleaseService);` in top-level beforeAll. Add a `describe("release", ...)` INSIDE the top-level describe — fresh fixtures with a position tie:
```ts
  describe("release", () => {
    let rTerm: string;
    let subj: string;
    let cls: string;
    let s1: string; let s2: string; let s3: string;

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 3, startDate: new Date("2025-04-15"), endDate: new Date("2025-07-31"), isCurrent: false } });
      rTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Chemistry", code: `CHM-${suffix}` } });
      subj = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `JSS3-${suffix}`, order: 3 } });
      const klass = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS3A-${suffix}` } });
      cls = klass.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `RL-${suffix}`, firstName: "Rel", lastName: "T", email: `rl${suffix}@s.test`, phone: "+2348000000222" } });
      await prisma.subjectAssignment.create({ data: { schoolId, subjectId: subj, classId: cls, staffId: staff.id, academicYearId } });
      const t = await asA(() => types.list());
      const caId = t.find((x) => x.name === "CA1")!.id;
      const examId = t.find((x) => x.name === "Exam")!.id;
      const mk = async (label: string, caV: number, examV: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: rTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: rTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: caV }, { studentId: st.id, assessmentTypeId: examId, value: examV },
        ] }, "rel"));
        return st.id;
      };
      s1 = await mk("S1", 28, 52); // 80
      s2 = await mk("S2", 30, 50); // 80 — tie with S1
      s3 = await mk("S3", 20, 40); // 60
    });

    it("releases a class: freezes ResultSheets with averages, positions (ties), and entries", async () => {
      const res = await asA(() => release2.release(cls, rTerm, "principal-1"));
      expect(res.released).toBe(3);
      const sheet = await asA(() => release2.getSheet(cls, rTerm));
      const byName = (n: string) => sheet.students.find((x) => x.name.startsWith(n))!;
      expect(byName("S1").average).toBe(80);
      expect(byName("S1").position).toBe(1);
      expect(byName("S2").position).toBe(1); // tie
      expect(byName("S3").position).toBe(3); // competition ranking
      expect(byName("S1").entries[0]!.subjectId).toBe(subj);
      expect(byName("S1").entries[0]!.total).toBe(80);
      // ordered by position
      expect(sheet.students[0]!.position).toBeLessThanOrEqual(sheet.students[sheet.students.length - 1]!.position);
    });

    it("rejects re-releasing an already-released class", async () => {
      await expect(asA(() => release2.release(cls, rTerm, "principal-1"))).rejects.toThrow(ConflictException);
    });

    it("status reflects the released class for the term", async () => {
      const st = await asA(() => release2.getStatus(rTerm));
      const row = st.find((c) => c.classId === cls)!;
      expect(row.released).toBe(true);
      expect(row.releasedAt).toBeTruthy();
    });

    it("rejects cross-tenant release/read", async () => {
      await expect(asB(() => release2.release(cls, rTerm, "x"))).rejects.toThrow(NotFoundException);
      await expect(asB(() => release2.getSheet(cls, rTerm))).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2:** Run e2e → FAIL (ReleaseService missing).

- [ ] **Step 3: Implement `release.service.ts`:**
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { computePositions } from "./position.util";

@Injectable()
export class ReleaseService {
  constructor(private prisma: PrismaService) {}

  async release(classId: string, termId: string, releasedBy: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [klass, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");

    const existing = await this.prisma.release.findFirst({ where: { classId, termId, schoolId } });
    if (existing) throw new ConflictException("This class has already been released for this term.");

    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const typeIds = types.map((t) => t.id);
    const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });
    const assignments = await this.prisma.subjectAssignment.findMany({ where: { classId, academicYearId: term.academicYearId } });
    const subjectIds = assignments.map((a) => a.subjectId);
    const enrollments = await this.prisma.enrollment.findMany({ where: { classId, termId }, select: { studentId: true } });
    const studentIds = enrollments.map((e) => e.studentId);

    const scoreRows = await this.prisma.score.findMany({
      where: { schoolId, classId, termId, studentId: { in: studentIds }, subjectId: { in: subjectIds } },
    });
    // studentId -> subjectId -> cells
    const bySS = new Map<string, Map<string, { assessmentTypeId: string; value: number }[]>>();
    for (const r of scoreRows) {
      const m = bySS.get(r.studentId) ?? new Map();
      const a = m.get(r.subjectId) ?? [];
      a.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
      m.set(r.subjectId, a);
      bySS.set(r.studentId, m);
    }

    // Per student: entries (per scored subject) + average over scored subjects.
    const perStudent = studentIds.map((studentId) => {
      const subjMap = bySS.get(studentId) ?? new Map();
      const entries: { subjectId: string; total: number; grade: string }[] = [];
      const totals: number[] = [];
      for (const subjectId of subjectIds) {
        const cells = subjMap.get(subjectId);
        if (!cells || cells.length === 0) continue;
        const r = computeSubjectResult(cells, typeIds, boundaries);
        entries.push({ subjectId, total: r.total, grade: r.grade ?? "" });
        totals.push(r.total);
      }
      const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      return { studentId, entries, average };
    });
    const positions = computePositions(perStudent.map((p) => ({ studentId: p.studentId, average: p.average })));

    await this.prisma.$transaction(async (tx) => {
      const rel = await tx.release.create({ data: { schoolId, classId, termId, releasedBy } });
      for (const p of perStudent) {
        const rs = await tx.resultSheet.create({
          data: { schoolId, releaseId: rel.id, studentId: p.studentId, classId, termId, average: p.average, position: positions.get(p.studentId) ?? 0 },
        });
        if (p.entries.length) {
          await tx.resultSheetEntry.createMany({
            data: p.entries.map((e) => ({ schoolId, resultSheetId: rs.id, subjectId: e.subjectId, total: e.total, grade: e.grade })),
          });
        }
      }
    });

    return { released: perStudent.length, classId, termId };
  }

  async getStatus(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    const enr = await this.prisma.enrollment.findMany({ where: { termId }, select: { classId: true } });
    const classIds = [...new Set(enr.map((e) => e.classId))];
    const [classes, releases] = await Promise.all([
      this.prisma.class.findMany({ where: { id: { in: classIds }, schoolId } }),
      this.prisma.release.findMany({ where: { termId, schoolId } }),
    ]);
    const relBy = new Map(releases.map((r) => [r.classId, r.releasedAt]));
    return classes.map((c) => ({
      classId: c.id,
      name: c.name,
      released: relBy.has(c.id),
      releasedAt: relBy.get(c.id)?.toISOString() ?? null,
    }));
  }

  async getSheet(classId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const rel = await this.prisma.release.findFirst({ where: { classId, termId, schoolId } });
    if (!rel) throw new NotFoundException("This class has not been released for this term.");
    const sheets = await this.prisma.resultSheet.findMany({
      where: { schoolId, classId, termId },
      orderBy: { position: "asc" },
      include: {
        student: { select: { firstName: true, lastName: true } },
        entries: { include: { subject: { select: { name: true } } } },
      },
    });
    return {
      releasedAt: rel.releasedAt.toISOString(),
      students: sheets.map((s) => ({
        studentId: s.studentId,
        name: `${s.student.firstName} ${s.student.lastName}`,
        average: s.average,
        position: s.position,
        entries: s.entries.map((e) => ({ subjectId: e.subjectId, subjectName: e.subject.name, total: e.total, grade: e.grade })),
      })),
    };
  }
}
```

- [ ] **Step 4: Implement `release.controller.ts`:**
```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ReleaseService } from "./release.service";
import { IsNotEmpty, IsString } from "class-validator";

class ReleaseDto {
  @IsString() @IsNotEmpty() classId!: string;
  @IsString() @IsNotEmpty() termId!: string;
}

@Controller("v1/assessment/release")
export class ReleaseController {
  constructor(private service: ReleaseService) {}

  @Get("status")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  status(@Query("termId") termId: string) {
    return this.service.getStatus(termId);
  }

  @Get("sheet")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  sheet(@Query("classId") classId: string, @Query("termId") termId: string) {
    return this.service.getSheet(classId, termId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  release(@Body() dto: ReleaseDto, @CurrentUser() user: RequestUser) {
    return this.service.release(dto.classId, dto.termId, user.id);
  }
}
```
(Define `ReleaseDto` inline here, or add to `dto/assessment.dto.ts` if you prefer — keep it with class-validator.)

- [ ] **Step 5: Register** `ReleaseService` (providers) + `ReleaseController` (controllers) in `assessment.module.ts`.

- [ ] **Step 6:** Run e2e → ALL pass (existing + 4 release). `pnpm --filter @mymakaranta/api build` + typecheck → clean.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/assessment/release.service.ts apps/api/src/modules/assessment/release.controller.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): release workflow — freeze ResultSheet + position-in-class"
```

---

## Task 5: Immutability in ScoresService

**Files:** Modify `apps/api/src/modules/assessment/scores.service.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Failing e2e.** Append as the LAST `it` in the `describe("release")` block (a release for `cls`/`rTerm` exists from Task 4's first test):
```ts
    it("blocks score edits after release (immutability)", async () => {
      const t = await asA(() => types.list());
      const caId = t.find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: rTerm, scores: [{ studentId: s1, assessmentTypeId: caId, value: 5 }] }, "rel")),
      ).rejects.toThrow(/released/i);
    });
```

- [ ] **Step 2:** Run e2e → this test FAILS (saveScores still succeeds post-release).

- [ ] **Step 3: Add the guard** in `scores.service.ts` `saveScores`, immediately AFTER `await this.assertContext(schoolId, dto.classId, dto.subjectId, dto.termId);`:
```ts
    const released = await this.prisma.release.findFirst({ where: { classId: dto.classId, termId: dto.termId, schoolId } });
    if (released) {
      throw new ConflictException("Results released for this class/term; correction required.");
    }
```
Add `ConflictException` to the `@nestjs/common` import in that file (it currently imports `BadRequestException, Injectable, NotFoundException`).

- [ ] **Step 4:** Run full assessment e2e → ALL pass. typecheck clean. (Ordering: the immutability `it` is last in `describe("release")`, after the release happened.)

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/assessment/scores.service.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): block score edits after release (immutability)"
```

---

## Task 6: Web api client — release

**Files:** Modify `apps/web/src/lib/api.ts`

- [ ] **Step 1: Types** (near other assessment interfaces):
```ts
export interface ReleaseStatusRow {
  classId: string;
  name: string;
  released: boolean;
  releasedAt: string | null;
}

export interface ReleasedSheet {
  releasedAt: string;
  students: Array<{
    studentId: string;
    name: string;
    average: number;
    position: number;
    entries: Array<{ subjectId: string; subjectName: string; total: number; grade: string }>;
  }>;
}
```

- [ ] **Step 2: Methods** inside `api`:
```ts
  getReleaseStatus: (termId: string) =>
    authedRequest<ReleaseStatusRow[]>(`/v1/assessment/release/status?termId=${termId}`),
  getReleasedSheet: (classId: string, termId: string) =>
    authedRequest<ReleasedSheet>(`/v1/assessment/release/sheet?classId=${classId}&termId=${termId}`),
  releaseClass: (classId: string, termId: string) =>
    authedRequest<{ released: number }>("/v1/assessment/release", {
      method: "POST",
      body: JSON.stringify({ classId, termId }),
    }),
```

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(assessment): web api client for release workflow"
```

---

## Task 7: Release dashboard page + nav

**Files:** Create `apps/web/src/app/(app)/release/page.tsx`; modify `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Nav.** In `layout.tsx`: add `Lock` to the `lucide-react` import; add to `NAV_ITEMS` after `/review`:
```ts
  { href: "/release", label: "Release", icon: Lock },
```

- [ ] **Step 2: Create `apps/web/src/app/(app)/release/page.tsx`** (read `apps/web/src/app/(app)/review/page.tsx` for term-selector + ui-import patterns; align imports to real exports):
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type ReleaseStatusRow,
  type ReleasedSheet,
} from "@/lib/api";
import { Lock } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ReleasePage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<ReleaseStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ classId: string; data: ReleasedSheet } | null>(null);

  useEffect(() => {
    void (async () => {
      const yrs = await api.listAcademicYears();
      setYears(yrs);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
    })();
  }, []);

  const loadStatus = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    setSheet(null);
    try {
      setRows(await api.getReleaseStatus(termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load release status.");
    } finally {
      setLoading(false);
    }
  }, [termId]);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const doRelease = async (classId: string) => {
    if (!confirm("Release this class? Scores become locked (immutable) for this term.")) return;
    setBusy(classId);
    setError(null);
    try {
      await api.releaseClass(classId, termId);
      await loadStatus();
      setSheet({ classId, data: await api.getReleasedSheet(classId, termId) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not release.");
    } finally {
      setBusy(null);
    }
  };

  const viewSheet = async (classId: string) => {
    setError(null);
    try {
      setSheet({ classId, data: await api.getReleasedSheet(classId, termId) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the sheet.");
    }
  };

  const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  return (
    <div className="px-4 py-8 mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Release</h1>
        <p className="text-small text-ink-500">Freeze and release a class's results. Released scores are locked.</p>
      </div>

      <div className="mb-6 flex items-end gap-3">
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Lock size={28} />} title="No classes" description="No classes have enrolments for this term." />
      ) : (
        <div className="flex flex-col gap-2 mb-8">
          {rows.map((r) => (
            <div key={r.classId} className="flex items-center justify-between gap-3 border-b border-ink-100 dark:border-white/10 pb-2">
              <span className="text-body text-ink-1000 dark:text-ink-100">{r.name}</span>
              <div className="flex items-center gap-3">
                {r.released ? (
                  <>
                    <Badge tone="success">Released</Badge>
                    <Button variant="outline" size="sm" onClick={() => viewSheet(r.classId)}>View</Button>
                  </>
                ) : (
                  <Button size="sm" disabled={busy === r.classId} onClick={() => doRelease(r.classId)}>
                    {busy === r.classId ? "Releasing…" : "Release"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <div>
          <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-3">Released sheet</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-small border-collapse">
              <thead><tr className="text-left text-ink-500">
                <th className="py-2 pr-3 font-medium">Pos</th>
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 px-2 font-medium text-center">Average</th>
                <th className="py-2 pl-3 font-medium">Subjects</th>
              </tr></thead>
              <tbody>
                {sheet.data.students.map((st) => (
                  <tr key={st.studentId} className="border-t border-ink-100 dark:border-white/10 align-top">
                    <td className="py-1.5 pr-3 tabular-nums font-medium">{st.position}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{st.name}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{st.average}</td>
                    <td className="py-1.5 pl-3 text-ink-700 dark:text-ink-300">
                      {st.entries.map((e) => `${e.subjectName} ${e.total}${e.grade ? ` (${e.grade})` : ""}`).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; `/release` builds. Align `@mymakaranta/ui` imports if any differ (check `review/page.tsx`). `confirm()` is the browser global; if lint flags it, use `window.confirm`.

- [ ] **Step 4: Commit**
```bash
git add "apps/web/src/app/(app)/release/page.tsx" "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(assessment): release dashboard page + nav"
```

---

## Task 8: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook). Start API + web. Seed a fresh school: year + current term, 1 class, 1 subject assigned, 3 students enrolled (two tied), assessment types (CA1/Exam=30/70) + WAEC, scores entered (two students tie on total, one lower). Then `/release`: pick term → class shows "Release" → click → confirm → status flips to "Released", frozen sheet renders ranked by position (tie shares position, e.g. 1,1,3); go to `/gradebook` for that class+subject+term → edit a score + Save → 409 "Results released" surfaced; back on `/release`, the class shows Released (no re-release). Verify via `GET /v1/assessment/release/sheet`. Fix any seam bug (`fix(qa):`). Record in `.gstack/qa-reports/` (gitignored). (Gotchas: warm a new route before auth_goto; re-inject `mm.token`/`mm.user`; stop web dev before any prod build.)

- [ ] **Step 2: Update `docs/RESUME.md`** — Current state: slice 4 (release + immutability) built + QA'd; remaining slices 4.5 (correction) + 5–6; bump counts. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify e2e + builds, merge `sprint-3-release` → main).

---

## Notes for the implementer
- **Explicit `schoolId`** on every read AND every create (incl. inside the `$transaction` interactive callback — the `tx` client does NOT run middleware). `Enrollment` reads gated by the class check.
- **Interactive `$transaction(async (tx) => …)`** is used (not array form) because creates depend on the prior `Release.id`/`ResultSheet.id`. Set `schoolId` explicitly on every `tx.*.create`.
- **Average = mean of scored subjects only** (skip subjects with no scores), rounded. Matches the slice-3 class-master convention.
- **e2e ordering:** the immutability `it` (Task 5) must be the LAST test in `describe("release")` so the release (Task 4 first test) already happened.
- **`noUncheckedIndexedAccess`** — `entries[0]!`, `sheet.students[0]!`, `t.find(...)!`.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **`@mymakaranta/ui` / tokens** — confirm `Badge`/`Button`/`Spinner`/`EmptyState`/`cn` against `review/page.tsx`.
