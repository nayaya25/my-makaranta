# Score Entry & Auto-Calc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher records raw assessment scores for a class+subject+term on a web gradebook and sees each student's auto-calculated total + grade live; raw `Score` cells are the source of truth, totals/grades derived on read.

**Architecture:** Extends the existing `assessment` NestJS module with one tenant-scoped `Score` model, a pure `computeSubjectResult` helper, and a scores service/controller (batch upsert, mirrors attendance). A structure guard blocks assessment-type changes once scores exist. Web adds a `/gradebook` grid + api-client methods.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e (service-level) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-sprint-3-slice-2-score-entry-design.md`

**Branch:** `sprint-3-score-entry` (already created).

**KEY CONVENTIONS (from slice 1 — follow exactly):**
- **Explicitly scope every read/delete by `schoolId`** via `TenantContext.schoolIdOrThrow()` + `where:{schoolId}`. The Prisma `$use` middleware is NOT reliable inside `$transaction` or the service-level test context. `createMany`/`create` set `schoolId` explicitly.
- **Tenant IDOR rule:** validate every request-supplied id (`classId/subjectId/termId/studentId/assessmentTypeId`) via a tenant-scoped `findFirst({where:{id, schoolId}})` before use. `Enrollment` has no `schoolId` — gate it by first validating the class is this tenant's.
- **e2e style:** service-level inside `TenantContext.run(...)` (see `apps/api/test/assessment.e2e-spec.ts`); no HTTP/tokens.
- **noUncheckedIndexedAccess** is on — use `?.` / `!` on array index access.

---

## File Structure

**API — create:**
- `apps/api/src/modules/assessment/score.util.ts` — pure `computeSubjectResult` + `score.util.spec.ts`.
- `apps/api/src/modules/assessment/scores.service.ts` + `.controller.ts`

**API — modify:**
- `apps/api/prisma/schema.prisma` — `Score` model + back-relations.
- `apps/api/src/core/prisma/prisma.service.ts` — add `"Score"` to `TENANT_MODELS`.
- `apps/api/src/modules/assessment/assessment.module.ts` — register scores service + controller.
- `apps/api/src/modules/assessment/dto/assessment.dto.ts` — add `SaveScoresDto`.
- `apps/api/src/modules/assessment/assessment-types.service.ts` — structure guard.
- `apps/api/test/assessment.e2e-spec.ts` — scores + guard e2e.
- New migrations.

**Web — create:**
- `apps/web/src/lib/gradebook.ts` — pure row compute + `gradebook.test.ts`.
- `apps/web/src/app/(app)/gradebook/page.tsx` — the gradebook.

**Web — modify:**
- `apps/web/src/lib/api.ts` — `Score` types + `getScores`/`saveScores`.
- `apps/web/src/app/(app)/layout.tsx` — `Gradebook` nav item.

---

## Task 1: Score model + tenancy + migration

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`

- [ ] **Step 1: Add the model** (append after `SubjectAssignment` in `schema.prisma`):
```prisma
model Score {
  id               String         @id @default(cuid())
  schoolId         String
  school           School         @relation(fields: [schoolId], references: [id])
  studentId        String
  student          Student        @relation(fields: [studentId], references: [id])
  subjectId        String
  subject          Subject        @relation(fields: [subjectId], references: [id])
  classId          String
  class            Class          @relation(fields: [classId], references: [id])
  assessmentTypeId String
  assessmentType   AssessmentType @relation(fields: [assessmentTypeId], references: [id])
  termId           String
  term             Term           @relation(fields: [termId], references: [id])
  value            Int
  recordedBy       String
  updatedAt        DateTime       @updatedAt

  @@unique([studentId, subjectId, assessmentTypeId, termId])
  @@index([schoolId, classId, subjectId, termId])
}
```

- [ ] **Step 2: Add back-relations** to existing models:
  - `model School`: `scores Score[]`
  - `model Student`: `scores Score[]`
  - `model Subject`: `scores Score[]`
  - `model Class`: `scores Score[]`
  - `model AssessmentType`: `scores Score[]`
  - `model Term`: `scores Score[]`

- [ ] **Step 3:** In `prisma.service.ts`, add `"Score",` to the `TENANT_MODELS` set.

- [ ] **Step 4: Migrate.** From `apps/api`: `pnpm exec prisma migrate dev --name score_model`
Expected: migration created + applied; client regenerated; "in sync". (Stop any running API dev server first — it locks the Prisma engine DLL on Windows.)

- [ ] **Step 5:** `pnpm exec prisma validate` (valid) + `pnpm --filter @mymakaranta/api typecheck` (clean).

- [ ] **Step 6: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(assessment): Score model + tenant scoping"
```

---

## Task 2: RLS migration for Score

**Files:** Create `apps/api/prisma/migrations/<timestamp>_rls_score/migration.sql`

- [ ] **Step 1:** From `apps/api`: `pnpm exec prisma migrate dev --create-only --name rls_score`

- [ ] **Step 2:** Replace the generated `migration.sql` with (mirror `*_rls_assessment`):
```sql
-- Defense-in-depth tenant isolation for Score.
ALTER TABLE "Score" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Score" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Score";
CREATE POLICY tenant_isolation ON "Score"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Score" TO mymakaranta_app;
```

- [ ] **Step 3:** Apply: `pnpm exec prisma migrate dev`. Confirm `pnpm exec prisma migrate status` → up to date.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/migrations
git commit -m "feat(assessment): RLS (FORCE) for Score"
```

---

## Task 3: computeSubjectResult helper

**Files:** Create `apps/api/src/modules/assessment/score.util.ts`, `score.util.spec.ts`

- [ ] **Step 1: Write the failing test** — `score.util.spec.ts`:
```ts
import { computeSubjectResult } from "./score.util";
import type { GradeBand } from "./grade.util";

const bands: GradeBand[] = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];
const typeIds = ["ca1", "ca2", "ca3", "exam"];

describe("computeSubjectResult", () => {
  it("sums entered values and maps to a grade", () => {
    const r = computeSubjectResult(
      [{ assessmentTypeId: "ca1", value: 10 }, { assessmentTypeId: "ca2", value: 10 },
       { assessmentTypeId: "ca3", value: 10 }, { assessmentTypeId: "exam", value: 55 }],
      typeIds, bands,
    );
    expect(r.total).toBe(85);
    expect(r.grade).toBe("A1");
    expect(r.complete).toBe(true);
  });

  it("treats missing components as 0 and flags incomplete", () => {
    const r = computeSubjectResult([{ assessmentTypeId: "ca1", value: 8 }], typeIds, bands);
    expect(r.total).toBe(8);
    expect(r.complete).toBe(false);
    expect(r.grade).toBe("F9");
  });

  it("returns null grade when no boundaries configured", () => {
    const r = computeSubjectResult([{ assessmentTypeId: "ca1", value: 8 }], typeIds, []);
    expect(r.grade).toBeNull();
    expect(r.remark).toBeNull();
  });
});
```

- [ ] **Step 2:** `pnpm exec jest score.util` (from `apps/api`) → FAIL (no module).

- [ ] **Step 3: Implement `score.util.ts`:**
```ts
import { resolveGrade, type GradeBand } from "./grade.util";

export interface ScoreCell {
  assessmentTypeId: string;
  value: number;
}

export interface SubjectResult {
  total: number;
  grade: string | null;
  remark: string | null;
  complete: boolean;
}

/**
 * Additive subject result: total = sum of entered component values (missing = 0),
 * complete = every assessment type has a value, grade via resolveGrade (null if no
 * boundaries). `typeIds` is the school's full ordered set of assessment-type ids.
 */
export function computeSubjectResult(
  scores: ScoreCell[],
  typeIds: string[],
  boundaries: GradeBand[],
): SubjectResult {
  const byType = new Map(scores.map((s) => [s.assessmentTypeId, s.value]));
  const total = typeIds.reduce((sum, id) => sum + (byType.get(id) ?? 0), 0);
  const complete = typeIds.every((id) => byType.has(id));
  const g = resolveGrade(total, boundaries);
  return { total, grade: g?.grade ?? null, remark: g?.remark ?? null, complete };
}
```

- [ ] **Step 4:** `pnpm exec jest score.util` → PASS (3).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/assessment/score.util.ts apps/api/src/modules/assessment/score.util.spec.ts
git commit -m "feat(assessment): computeSubjectResult (additive total + grade)"
```

---

## Task 4: Scores service + controller + e2e

**Files:** Create `scores.service.ts`, `scores.controller.ts`; modify `dto/assessment.dto.ts`, `assessment.module.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Add `SaveScoresDto`** to `apps/api/src/modules/assessment/dto/assessment.dto.ts`:
```ts
export class ScoreItemDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  assessmentTypeId!: string;

  @IsInt()
  @Min(0)
  value!: number;
}

export class SaveScoresDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreItemDto)
  scores!: ScoreItemDto[];
}
```
(`IsInt, Min, IsString, IsNotEmpty, IsArray, ValidateNested, Type` are already imported in this file.)

- [ ] **Step 2: Write the failing e2e block.** In `apps/api/test/assessment.e2e-spec.ts`, add a `describe("scores", ...)` INSIDE the top-level describe. It needs a term + 2 enrolled students for school A (the slice-1 bootstrap didn't create these), so create them in a nested `beforeAll` reusing the outer `schoolId/classId/subjectId/academicYearId`:
```ts
  describe("scores", () => {
    let termId: string;
    let s1: string;
    let s2: string;
    const recorder = "rec-user";

    beforeAll(async () => {
      const term = await prisma.term.create({
        data: { schoolId, academicYearId, number: 1, startDate: new Date("2024-09-01"), endDate: new Date("2024-12-20"), isCurrent: true },
      });
      termId = term.id;
      const st1 = await prisma.student.create({ data: { schoolId, admissionNo: `A1-${suffix}`, firstName: "Ada", lastName: "Eze", gender: "FEMALE", dateOfBirth: new Date("2012-01-01") } });
      const st2 = await prisma.student.create({ data: { schoolId, admissionNo: `A2-${suffix}`, firstName: "Bola", lastName: "Ade", gender: "MALE", dateOfBirth: new Date("2012-02-02") } });
      s1 = st1.id; s2 = st2.id;
      await prisma.enrollment.createMany({ data: [
        { studentId: s1, classId, termId },
        { studentId: s2, classId, termId },
      ] });
      // Assessment types must exist + sum to 100 for grading; set them for school A.
      await asA(() => types.replace([
        { name: "CA1", maxScore: 30, order: 0 },
        { name: "Exam", maxScore: 70, order: 1 },
      ]));
      await asA(() => boundaries.applyTemplate("WAEC"));
    });

    it("saves a batch of scores and reads them back with computed totals/grades", async () => {
      const t = await asA(() => types.list());
      const ca1 = t.find((x) => x.name === "CA1")!.id;
      const exam = t.find((x) => x.name === "Exam")!.id;
      const res = await asA(() => scores.saveScores({
        classId, subjectId, termId,
        scores: [
          { studentId: s1, assessmentTypeId: ca1, value: 25 },
          { studentId: s1, assessmentTypeId: exam, value: 60 },
          { studentId: s2, assessmentTypeId: ca1, value: 10 },
        ],
      }, recorder));
      expect(res.saved).toBe(3);

      const gb = await asA(() => scores.getGradebook(classId, subjectId, termId));
      expect(gb.assessmentTypes.length).toBe(2);
      const ada = gb.students.find((x) => x.studentId === s1)!;
      expect(ada.total).toBe(85);
      expect(ada.grade).toBe("A1");
      expect(ada.complete).toBe(true);
      const bola = gb.students.find((x) => x.studentId === s2)!;
      expect(bola.total).toBe(10);
      expect(bola.complete).toBe(false);
    });

    it("rejects a value greater than the assessment type's maxScore", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: s1, assessmentTypeId: ca1, value: 31 }] }, recorder)),
      ).rejects.toThrow(/max|exceed|30/i);
    });

    it("rejects a non-enrolled student", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: "nope", assessmentTypeId: ca1, value: 5 }] }, recorder)),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a foreign classId (cross-tenant)", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asB(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: s1, assessmentTypeId: ca1, value: 5 }] }, recorder)),
      ).rejects.toThrow(NotFoundException);
    });
  });
```
Also add `scores = moduleRef.get(SubjectAssignmentsService)`-style wiring: in the top-level `beforeAll`, after the other `moduleRef.get(...)` lines, add `scores = moduleRef.get(ScoresService);` and declare `let scores: ScoresService;` + import `ScoresService` + `ScoreItemDto` not needed in test. Import `ScoresService` from `../src/modules/assessment/scores.service`.

- [ ] **Step 3:** `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment` → FAIL (ScoresService missing).

- [ ] **Step 4: Implement `scores.service.ts`:**
```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { SaveScoresDto } from "./dto/assessment.dto";

@Injectable()
export class ScoresService {
  constructor(private prisma: PrismaService) {}

  private async assertContext(schoolId: string, classId: string, subjectId: string, termId: string) {
    const [klass, subject, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
  }

  async getGradebook(classId: string, subjectId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertContext(schoolId, classId, subjectId, termId);

    const [assessmentTypes, gradeBoundaries, enrollments] = await Promise.all([
      this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } }),
      this.prisma.enrollment.findMany({
        where: { classId, termId },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    const typeIds = assessmentTypes.map((t) => t.id);
    const studentIds = enrollments.map((e) => e.studentId);
    const rows = await this.prisma.score.findMany({
      where: { schoolId, subjectId, termId, studentId: { in: studentIds } },
    });
    const byStudent = new Map<string, { assessmentTypeId: string; value: number }[]>();
    for (const r of rows) {
      const arr = byStudent.get(r.studentId) ?? [];
      arr.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
      byStudent.set(r.studentId, arr);
    }

    const students = enrollments.map((e) => {
      const cells = byStudent.get(e.studentId) ?? [];
      const result = computeSubjectResult(cells, typeIds, gradeBoundaries);
      const scores: Record<string, number> = {};
      for (const c of cells) scores[c.assessmentTypeId] = c.value;
      return {
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        scores,
        ...result,
      };
    });

    return { assessmentTypes, gradeBoundaries, students };
  }

  async saveScores(dto: SaveScoresDto, recordedBy: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertContext(schoolId, dto.classId, dto.subjectId, dto.termId);

    // Valid assessment types for this school, with max scores.
    const types = await this.prisma.assessmentType.findMany({ where: { schoolId } });
    const maxById = new Map(types.map((t) => [t.id, t.maxScore]));
    // Enrolled students for this class+term.
    const enrolled = new Set(
      (await this.prisma.enrollment.findMany({ where: { classId: dto.classId, termId: dto.termId }, select: { studentId: true } }))
        .map((e) => e.studentId),
    );

    for (const s of dto.scores) {
      const max = maxById.get(s.assessmentTypeId);
      if (max === undefined) throw new NotFoundException(`Unknown assessment type ${s.assessmentTypeId}.`);
      if (s.value < 0 || s.value > max) {
        throw new BadRequestException(`Score ${s.value} exceeds max ${max} for this component.`);
      }
      if (!enrolled.has(s.studentId)) {
        throw new NotFoundException(`Student ${s.studentId} is not enrolled in this class/term.`);
      }
    }

    let saved = 0;
    for (const s of dto.scores) {
      await this.prisma.score.upsert({
        where: {
          studentId_subjectId_assessmentTypeId_termId: {
            studentId: s.studentId,
            subjectId: dto.subjectId,
            assessmentTypeId: s.assessmentTypeId,
            termId: dto.termId,
          },
        },
        create: {
          schoolId,
          studentId: s.studentId,
          subjectId: dto.subjectId,
          classId: dto.classId,
          assessmentTypeId: s.assessmentTypeId,
          termId: dto.termId,
          value: s.value,
          recordedBy,
        },
        update: { value: s.value, classId: dto.classId, recordedBy },
      });
      saved++;
    }
    return { saved };
  }
}
```
(NOTE: the upsert `where` uses the composite unique name Prisma generates from `@@unique([studentId, subjectId, assessmentTypeId, termId])` → `studentId_subjectId_assessmentTypeId_termId`. The upsert's `where` is keyed on that unique, so it does not need an explicit `schoolId`; tenant safety comes from the prior `assertContext` + enrolled/type validation + RLS, mirroring attendance `markAttendance`.)

- [ ] **Step 5: Implement `scores.controller.ts`:**
```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ScoresService } from "./scores.service";
import { SaveScoresDto } from "./dto/assessment.dto";

@Controller("v1/assessment/scores")
export class ScoresController {
  constructor(private service: ScoresService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.record")
  gradebook(
    @Query("classId") classId: string,
    @Query("subjectId") subjectId: string,
    @Query("termId") termId: string,
  ) {
    return this.service.getGradebook(classId, subjectId, termId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.record")
  save(@Body() dto: SaveScoresDto, @CurrentUser() user: RequestUser) {
    return this.service.saveScores(dto, user.id);
  }
}
```

- [ ] **Step 6: Register in `assessment.module.ts`** — import `ScoresService` + `ScoresController`, add `ScoresController` to `controllers` and `ScoresService` to `providers`.

- [ ] **Step 7:** `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment` → ALL pass (slice-1 14 + new scores tests). Then `pnpm --filter @mymakaranta/api build` + `typecheck` → clean.

- [ ] **Step 8: Commit**
```bash
git add apps/api/src/modules/assessment/scores.service.ts apps/api/src/modules/assessment/scores.controller.ts apps/api/src/modules/assessment/dto/assessment.dto.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): scores gradebook GET + batch save with validation"
```

---

## Task 5: Structure guard (block type changes once scores exist)

**Files:** Modify `apps/api/src/modules/assessment/assessment-types.service.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Add the failing e2e.** Append this `it` as the LAST test INSIDE the existing `describe("scores", ...)` block (where `termId`, `s1/s2`, and saved scores already exist from earlier tests in that describe — avoids cross-describe state and guarantees a score is present):
```ts
    it("blocks assessment-type replace once a score exists (structure guard)", async () => {
      // earlier tests in this describe already saved scores for school A
      await expect(
        asA(() => types.replace([{ name: "CA1", maxScore: 100, order: 0 }])),
      ).rejects.toThrow(/scores have been entered/i);
    });
```

- [ ] **Step 2:** Run e2e → the new guard test FAILS (replace currently succeeds).

- [ ] **Step 3: Add the guard** in `assessment-types.service.ts` `replace()`, immediately after computing `const schoolId = TenantContext.schoolIdOrThrow();` and BEFORE the `$transaction`:
```ts
    const scoreCount = await this.prisma.score.count({ where: { schoolId } });
    if (scoreCount > 0) {
      throw new ConflictException("Cannot change assessment structure after scores have been entered.");
    }
```
Add `ConflictException` to the `@nestjs/common` import in that file.

- [ ] **Step 4:** Run e2e → ALL pass (the guard test + everything). Note: ordering — Jest runs `it`s in declaration order within a describe; ensure the guard `it` is the LAST in the `scores` describe so the score-saving tests run first. typecheck clean.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/assessment/assessment-types.service.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): hard-block assessment-type changes once scores exist"
```

---

## Task 6: Web api client — scores

**Files:** Modify `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add types** (near the other assessment interfaces):
```ts
export interface GradebookStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  scores: Record<string, number>;
  total: number;
  grade: string | null;
  remark: string | null;
  complete: boolean;
}

export interface Gradebook {
  assessmentTypes: AssessmentType[];
  gradeBoundaries: GradeBoundary[];
  students: GradebookStudent[];
}
```

- [ ] **Step 2: Add methods** inside the `api` object:
```ts
  getScores: (classId: string, subjectId: string, termId: string) =>
    authedRequest<Gradebook>(
      `/v1/assessment/scores?classId=${classId}&subjectId=${subjectId}&termId=${termId}`,
    ),
  saveScores: (body: {
    classId: string; subjectId: string; termId: string;
    scores: Array<{ studentId: string; assessmentTypeId: string; value: number }>;
  }) =>
    authedRequest<{ saved: number }>("/v1/assessment/scores", {
      method: "POST",
      body: JSON.stringify(body),
    }),
```

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(assessment): web api client for gradebook scores"
```

---

## Task 7: Web gradebook row-compute helper

**Files:** Create `apps/web/src/lib/gradebook.ts`, `gradebook.test.ts`

- [ ] **Step 1: Write the failing test** — `gradebook.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeRow } from "./gradebook";

const bands = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];

describe("computeRow", () => {
  it("sums the values map and resolves a grade", () => {
    const r = computeRow({ ca1: 20, exam: 60 }, bands);
    expect(r.total).toBe(80);
    expect(r.grade).toBe("A1");
  });
  it("ignores NaN/blank entries", () => {
    const r = computeRow({ ca1: 10, exam: NaN }, bands);
    expect(r.total).toBe(10);
    expect(r.grade).toBe("F9");
  });
});
```

- [ ] **Step 2:** `pnpm --filter @mymakaranta/web test gradebook` → FAIL.

- [ ] **Step 3: Implement `gradebook.ts`:**
```ts
import { resolveGrade, type GradeBand } from "./grade";

/** Live gradebook-row total + grade for the UI. Sums a {assessmentTypeId: value}
 *  map (ignoring NaN/blank) and resolves the grade against the school's bands. */
export function computeRow(
  values: Record<string, number>,
  boundaries: GradeBand[],
): { total: number; grade: string | null; remark: string | null } {
  const total = Object.values(values).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const g = resolveGrade(total, boundaries);
  return { total, grade: g?.grade ?? null, remark: g?.remark ?? null };
}
```

- [ ] **Step 4:** `pnpm --filter @mymakaranta/web test gradebook` → PASS (2).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/gradebook.ts apps/web/src/lib/gradebook.test.ts
git commit -m "feat(assessment): web gradebook row-compute helper"
```

---

## Task 8: Gradebook page + nav

**Files:** Create `apps/web/src/app/(app)/gradebook/page.tsx`; modify `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Add the nav item.** In `layout.tsx`: add `ClipboardList` to the `lucide-react` import block, and add to `NAV_ITEMS` after the Attendance entry:
```ts
  { href: "/gradebook", label: "Gradebook", icon: ClipboardList },
```

- [ ] **Step 2: Create `apps/web/src/app/(app)/gradebook/page.tsx`** (read `apps/web/src/app/(app)/attendance/page.tsx` first for the exact `@mymakaranta/ui` import surface + Select usage; align imports to real exports). Full implementation:
```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Select, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AssessmentType,
  type GradeBoundary,
  type Class,
  type SubjectAssignment,
} from "@/lib/api";
import { computeRow } from "@/lib/gradebook";
import { ClipboardList } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function GradebookPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [subjectOpts, setSubjectOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectId, setSubjectId] = useState("");

  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>([]);
  // rows: studentId -> { name, values: { [typeId]: number } }
  const [rows, setRows] = useState<Array<{ studentId: string; name: string; values: Record<string, number> }>>([]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: classes + terms (from academic years).
  useEffect(() => {
    void (async () => {
      const [cs, years] = await Promise.all([api.listClasses(), api.listAcademicYears()]);
      setClasses(cs);
      if (cs[0]) setClassId(cs[0].id);
      const ts: TermOpt[] = years.flatMap((y) =>
        (y.terms ?? [])
          .filter((t) => t.id)
          .map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })),
      );
      setTerms(ts);
      const current = ts.find((t) => t.isCurrent) ?? ts[0];
      if (current) setTermId(current.id);
    })();
  }, []);

  // Offered subjects for the selected class+year (year resolved from the term's year is approximated
  // by listing all assignments for the class for the current year; we filter by classId).
  useEffect(() => {
    if (!classId || !termId) return;
    void (async () => {
      // academic year of the selected term: re-fetch years and find the owning year.
      const years = await api.listAcademicYears();
      const year = years.find((y) => (y.terms ?? []).some((t) => t.id === termId));
      if (!year) { setSubjectOpts([]); return; }
      const assignments: SubjectAssignment[] = await api.listSubjectAssignments(classId, year.id);
      const seen = new Map<string, string>();
      for (const a of assignments) if (a.subject) seen.set(a.subject.id, a.subject.name);
      const opts = [...seen].map(([id, name]) => ({ id, name }));
      setSubjectOpts(opts);
      setSubjectId(opts[0]?.id ?? "");
    })();
  }, [classId, termId]);

  const loadGradebook = useCallback(async () => {
    if (!classId || !subjectId || !termId) return;
    setLoading(true);
    setError(null);
    try {
      const gb = await api.getScores(classId, subjectId, termId);
      setTypes(gb.assessmentTypes);
      setBoundaries(gb.gradeBoundaries);
      setRows(gb.students.map((s) => ({
        studentId: s.studentId,
        name: `${s.firstName} ${s.lastName}`,
        values: { ...s.scores },
      })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the gradebook.");
    } finally {
      setLoading(false);
    }
  }, [classId, subjectId, termId]);
  useEffect(() => { void loadGradebook(); }, [loadGradebook]);

  const maxById = useMemo(() => new Map(types.map((t) => [t.id, t.maxScore])), [types]);
  const overMax = (typeId: string, v: number) => {
    const m = maxById.get(typeId);
    return m !== undefined && (v < 0 || v > m);
  };
  const hasError = rows.some((r) => Object.entries(r.values).some(([tid, v]) => overMax(tid, v)));

  const setCell = (studentId: string, typeId: string, raw: string) => {
    const v = raw === "" ? NaN : Number(raw);
    setRows((prev) => prev.map((r) =>
      r.studentId === studentId ? { ...r, values: { ...r.values, [typeId]: v } } : r));
  };

  const save = async () => {
    setSaveState("saving");
    setError(null);
    const payload = {
      classId, subjectId, termId,
      scores: rows.flatMap((r) =>
        types
          .filter((t) => Number.isFinite(r.values[t.id]))
          .map((t) => ({ studentId: r.studentId, assessmentTypeId: t.id, value: r.values[t.id]! }))),
    };
    try {
      await api.saveScores(payload);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof ApiError ? e.message : "Could not save scores.");
    }
  };

  return (
    <div className="px-4 py-8 mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Gradebook</h1>
        <p className="text-small text-ink-500">Record assessment scores for a class and subject.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-small text-ink-500 flex flex-col gap-1">Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-small text-ink-500 flex flex-col gap-1">Subject
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
            {subjectOpts.length === 0 && <option value="">No subjects assigned</option>}
            {subjectOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-3 ml-auto">
          <Button onClick={save} disabled={saveState === "saving" || hasError || rows.length === 0}>Save scores</Button>
          <span aria-live="polite" className={cn("text-caption tabular-nums",
            saveState === "saved" ? "text-success" : saveState === "error" ? "text-error" : "text-ink-500")}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
          </span>
        </div>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : types.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="No assessment structure"
          description="Configure assessment components in Settings → Assessment before recording scores." />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="No students"
          description="This class has no enrolled students for the selected term." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small border-collapse">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-2 pr-3 font-medium">Student</th>
                {types.map((t) => <th key={t.id} className="py-2 px-2 font-medium text-center">{t.name}<span className="text-caption text-ink-400">/{t.maxScore}</span></th>)}
                <th className="py-2 px-2 font-medium text-center">Total</th>
                <th className="py-2 px-2 font-medium text-center">Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const res = computeRow(r.values, boundaries);
                return (
                  <tr key={r.studentId} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-1.5 pr-3 text-ink-1000 dark:text-ink-100 whitespace-nowrap">{r.name}</td>
                    {types.map((t) => {
                      const v = r.values[t.id];
                      const bad = Number.isFinite(v) && overMax(t.id, v as number);
                      return (
                        <td key={t.id} className="py-1.5 px-2 text-center">
                          <input type="number" min={0} max={t.maxScore}
                            aria-label={`${r.name} ${t.name}`}
                            value={Number.isFinite(v) ? String(v) : ""}
                            onChange={(e) => setCell(r.studentId, t.id, e.target.value)}
                            className={cn("h-9 w-16 rounded-input border bg-surface dark:bg-surface-dark px-2 text-center",
                              bad ? "border-error" : "border-ink-300 dark:border-white/15")} />
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center tabular-nums font-medium">{res.total}</td>
                    <td className="py-1.5 px-2 text-center">{res.grade ? <Badge tone="info">{res.grade}</Badge> : <span className="text-ink-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
All pass; `/gradebook` builds. Align any `@mymakaranta/ui` import (e.g. `EmptyState`, `Badge`) to the real exports if a name differs (check `attendance/page.tsx` + `attendance/overview/page.tsx`).

- [ ] **Step 4: Commit**
```bash
git add "apps/web/src/app/(app)/gradebook/page.tsx" "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(assessment): gradebook score-entry grid + nav"
```

---

## Task 9: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook). Start API + web. Seed a fresh school with: academic year + current term, class level + class, 2 subjects, 1 staff, a subject assignment (so the class offers a subject), 2 students enrolled in (class, term). Configure assessment types (CA1/CA2/CA3/Exam = 10/10/10/70) + apply WAEC in Settings → Assessment. Then at `/gradebook`: pick class + term + subject → enter scores for the 2 students → live totals/grades update → Save → reload shows persisted values; enter a value > maxScore → input flagged + Save disabled; then go to Settings → Assessment and try to change components → 409 surfaced. Verify persistence via `GET /v1/assessment/scores`. Fix any seam bug (atomic `fix(qa):` commit). Record in `.gstack/qa-reports/` (gitignored). (Browser gotchas: warm a new route once before auth_goto; re-inject `mm.token`/`mm.user` per call; stop web dev before any production build.)

- [ ] **Step 2: Update `docs/RESUME.md`** — Current state: Sprint 3 slice 2 (score entry) built + QA'd; note `Score` model + gradebook; remaining slices now 3–6; bump counts. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify e2e + builds, merge `sprint-3-score-entry` → main).

---

## Notes for the implementer
- **Explicit `schoolId` scoping everywhere** (slice-1 learning) — every read/delete; `create` sets `schoolId`. The score `upsert` keys on the composite unique (safe via prior `assertContext` + validation + RLS), mirroring attendance `markAttendance`.
- **e2e is service-level** (`TenantContext.run`), not HTTP. The `scores` describe creates its own term + students + enrollments + assessment types for school A.
- **Structure-guard test ordering:** the guard `it` must be the LAST test in the `scores` describe (Jest runs in declaration order) so the score-saving tests have already inserted a score.
- **`noUncheckedIndexedAccess`** — use `?.`/`!` on `arr[0]`, `.find(...)!`, `r.values[t.id]!` (guarded by the `Number.isFinite` filter before it).
- **Don't run `next build` while `next dev` is up** (poisons `.next`). Stop dev servers before API `prisma migrate`/builds (engine DLL lock on Windows).
- **`@mymakaranta/ui` exports** — confirm `Badge`, `EmptyState`, `Select`, `Spinner`, `cn` against the attendance pages before importing.
