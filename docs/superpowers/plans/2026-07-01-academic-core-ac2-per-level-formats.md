# Academic Core AC-2 — Per-Level Assessment Formats + Subject Categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Scope assessment components + grade boundaries **per class-level** (with the current school-wide setup as the default), and add a **subject category** that groups the report card — backward-compatible, scoring math unchanged.

**Architecture:** Add nullable `classLevelId` to `AssessmentType`/`GradeBoundary` (null = default). A `resolveAssessmentTypes/resolveGradeBoundaries(schoolId, classLevelId)` util returns the level's overrides else the default set; every consumer (gradebook, release, review, correction, report-card) switches to the resolver keyed by the class's level. Add `SubjectCategory` + `Subject.categoryId`; group the report card by category.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL (raw partial indexes), Jest, Next.js 15 + `@mymakaranta/ui`.

## Global Constraints

- Branch off `dev` (AC-1 merged). Work in `apps/api/src/modules/assessment/` + `apps/web`.
- Multi-tenancy: every read/write scoped by `schoolId` (per `prisma-tenant-scope-explicitly`, `tenant-idor-rule`).
- **Resolution (verbatim):** for a class level, use rows where `classLevelId = <level>`; if that set is empty, use rows where `classLevelId IS NULL` (the school default). Ordering by `order`.
- **Default uniqueness** must be enforced by raw partial unique indexes (Prisma can't express partial-unique): `… (schoolId, name) WHERE "classLevelId" IS NULL` for AssessmentType, `… (schoolId, grade) WHERE "classLevelId" IS NULL` for GradeBoundary. Per-level uniqueness via `@@unique([schoolId, classLevelId, name|grade])`.
- Backward-compat: existing rows have `classLevelId = NULL` (the default). Do NOT migrate data; do NOT change the grade/position/score math (`grade.util`, `position.util`, `score.util`).
- Seed `SubjectCategory` defaults lazily on first read + on school creation (mirror AC-1's `seedSkillDefaults` wiring).
- Tests: local test DB — prefix `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`; argon2-touching suites `--runInBand`. Never commit that URL. The prod build must still emit `dist/main.js` (tsconfig.build.json invariant).
- Web: verify `tsc --noEmit` (0) + `next lint`; do NOT run `next build`. Web tsc must stay at 0 errors (a single `@types/react@19` is pinned — don't add deps that reintroduce `@types/react@18`).

## File Structure

- `apps/api/prisma/schema.prisma` + migration — nullable `classLevelId`, uniques, partial indexes, `SubjectCategory`, `Subject.categoryId` (modify/create).
- `apps/api/prisma/seed-subject-categories.ts` (+ spec) — seedable defaults (create).
- `apps/api/src/modules/assessment/format-resolution.ts` (+ spec) — resolvers (create).
- `apps/api/src/modules/assessment/assessment-types.service.ts` / `.controller.ts` / `dto` — classLevelId + apply (modify).
- `apps/api/src/modules/assessment/grade-boundaries.service.ts` / `.controller.ts` / `dto` — classLevelId + apply (modify).
- `apps/api/src/modules/assessment/scores.service.ts`, `release.service.ts`, `review.service.ts`, `correction.service.ts`, `report-card.service.ts` — use the resolver (modify).
- `apps/api/src/modules/structure/subjects.*` + a `subject-categories` controller/service — category CRUD + `categoryId` (modify/create).
- `apps/web/src/app/(app)/settings/assessment/…` — level selector + apply-to-levels (modify/create).
- `apps/web/src/app/(app)/settings/subjects` (or subjects screen) — categories + picker (modify).
- `apps/web/src/app/(app)/report-card/[studentId]/page.tsx` — group by category (modify).
- `apps/web/src/lib/api.ts` — helpers (modify).

---

### Task 1: Schema — classLevelId overrides, SubjectCategory, partial indexes

**Files:** Modify `apps/api/prisma/schema.prisma`; migration; Test `apps/api/src/modules/assessment/per-level-model.spec.ts`.

**Interfaces:** Produces `AssessmentType.classLevelId?`, `GradeBoundary.classLevelId?`, `SubjectCategory`, `Subject.categoryId?`, per the spec's Data model, plus the two partial unique indexes.

- [ ] **Step 1:** Edit `schema.prisma` per the spec: add nullable `classLevelId` + `classLevel ClassLevel? @relation(...)` to `AssessmentType` and `GradeBoundary`; replace their `@@unique` with `@@unique([schoolId, classLevelId, name|grade])` + `@@index([schoolId, classLevelId])`; add inverse arrays on `ClassLevel`; add `SubjectCategory` + `Subject.categoryId? + category` relation.
- [ ] **Step 2:** `DATABASE_URL=... pnpm exec prisma migrate dev --name per_level_formats --create-only`, then **hand-edit the generated `migration.sql`** to append the two partial unique indexes (verbatim from the spec's SQL). Then `DATABASE_URL=... pnpm exec prisma migrate dev` (or `migrate deploy`) to apply.
- [ ] **Step 3: Failing test** `per-level-model.spec.ts`: create a school + a ClassLevel; create a default `AssessmentType` (classLevelId null) "CA1" and a level override "CA1" (classLevelId set) — BOTH succeed; a second default "CA1" → throws (partial index); a second override "CA1" for the same level → throws. Also assert `SubjectCategory` + `Subject.categoryId` link works.
- [ ] **Step 4:** `DATABASE_URL=... pnpm exec jest per-level-model` → fail then pass.
- [ ] **Step 5: Commit** `feat(assessment): per-level classLevelId overrides + SubjectCategory schema (AC-2)`.

---

### Task 2: Resolution util

**Files:** Create `apps/api/src/modules/assessment/format-resolution.ts` (+ `.spec.ts`).

**Interfaces:** Produces
`resolveAssessmentTypes(prisma, schoolId, classLevelId): Promise<AssessmentType[]>` and
`resolveGradeBoundaries(prisma, schoolId, classLevelId): Promise<GradeBoundary[]>` — rows for the level ordered by `order`; if empty, the `classLevelId IS NULL` default set ordered by `order`.

- [ ] **Step 1: Failing test** — seed default set + a level with its own overrides: resolver(level with overrides) → the overrides; resolver(level with none) → the defaults; both ordered by `order`.

```typescript
// format-resolution.spec.ts (essence)
it("returns level overrides, else school defaults", async () => {
  // default CA1(20),Exam(80); level L1 override CA(40),Exam(60)
  expect((await resolveAssessmentTypes(prisma, sch, L1)).map(t=>t.maxScore)).toEqual([40,60]);
  expect((await resolveAssessmentTypes(prisma, sch, L2none)).map(t=>t.maxScore)).toEqual([20,80]);
});
```

- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement**

```typescript
// apps/api/src/modules/assessment/format-resolution.ts
import type { PrismaClient } from "@prisma/client";
export async function resolveAssessmentTypes(prisma: PrismaClient, schoolId: string, classLevelId: string) {
  const overrides = await prisma.assessmentType.findMany({ where: { schoolId, classLevelId }, orderBy: { order: "asc" } });
  if (overrides.length) return overrides;
  return prisma.assessmentType.findMany({ where: { schoolId, classLevelId: null }, orderBy: { order: "asc" } });
}
export async function resolveGradeBoundaries(prisma: PrismaClient, schoolId: string, classLevelId: string) {
  const overrides = await prisma.gradeBoundary.findMany({ where: { schoolId, classLevelId }, orderBy: { order: "asc" } });
  if (overrides.length) return overrides;
  return prisma.gradeBoundary.findMany({ where: { schoolId, classLevelId: null }, orderBy: { order: "asc" } });
}
```

- [ ] **Step 4: Run** `jest format-resolution` → pass.
- [ ] **Step 5: Commit** `feat(assessment): per-level format resolver (AC-2)`.

---

### Task 3: Route consumers through the resolver (the refactor)

**Files:** Modify `scores.service.ts`, `release.service.ts`, `review.service.ts`, `correction.service.ts`, `report-card.service.ts`; extend their specs.

**Interfaces:** Consumes `resolveAssessmentTypes`/`resolveGradeBoundaries` (T2). Each consumer resolves the format from the **class's `classLevelId`** (fetch the class → `classLevelId`) instead of `findMany({ where: { schoolId } })`.

- [ ] **Step 1:** `grep -rn "assessmentType.findMany\|gradeBoundary.findMany" apps/api/src/modules/assessment` to list every consumer. For each: identify the class in scope (gradebook/release/review operate on a `classId`; report-card/correction on a student→class), fetch `class.classLevelId`, and replace the school-wide `findMany` with the T2 resolver.
- [ ] **Step 2: Failing test** — a class whose level has an override computes totals/grades using the OVERRIDE components/boundaries (e.g. override Exam max 60 vs default 80 changes the max/grade); a class on a level with NO override uses the defaults (unchanged behaviour). Add to `scores.service.spec.ts` (or a focused `per-level-scoring.spec.ts`).
- [ ] **Step 3: Run to fail** (currently uses school-wide set).
- [ ] **Step 4: Implement** the resolver swap in each consumer. Do NOT touch `grade.util`/`position.util`/`score.util` math — only change WHICH components/boundaries are fed in.
- [ ] **Step 5: Run** the full assessment suite `DATABASE_URL=... pnpm exec jest assessment --runInBand` → all pass (regression: existing default-path specs still green + new override test passes).
- [ ] **Step 6: Commit** `feat(assessment): resolve per-level formats in gradebook/release/review/report-card (AC-2)`.

---

### Task 4: Assessment-type + grade-boundary CRUD (classLevelId + apply-to-levels)

**Files:** Modify `assessment-types.service.ts`/`.controller.ts`/`dto`, `grade-boundaries.service.ts`/`.controller.ts`/`dto`; Test the two service specs.

**Interfaces:**
- Create/update accept optional `classLevelId` (validated to belong to the school when set).
- `GET /v1/assessment/assessment-types?classLevelId=` → the resolved set, each row flagged `isDefault: boolean` (true when the returned row's `classLevelId` is null — i.e. inherited). No `classLevelId` → the default set (all `isDefault:true`).
- `POST /v1/assessment/assessment-types/apply` (perm `school.manage`) body `{ sourceClassLevelId: string | null, targetClassLevelIds: string[] }` → in a `$transaction`, for each target: delete existing override rows for that level, then clone the resolved source set (types) as new rows with `classLevelId = target`. Grade boundaries get an equivalent `.../grade-boundaries/apply` (or a shared endpoint). Validate all target levels belong to the school.

- [ ] **Step 1: Failing test** — create accepts classLevelId (rejects a foreign-school level); `list(classLevelId)` returns overrides with `isDefault:false`, or defaults with `isDefault:true` when no override; `apply({source:null, targets:[L1]})` clones the default set onto L1 (now `list(L1)` returns non-default rows matching the defaults); re-apply replaces (no duplicate rows).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** on both services + controllers (scope by schoolId; validate levels; transactional apply). Match existing guard/DTO patterns.
- [ ] **Step 4: Run** `jest "assessment-types|grade-boundaries" --runInBand` → pass.
- [ ] **Step 5: Commit** `feat(assessment): per-level format CRUD + apply-to-levels (AC-2)`.

---

### Task 5: SubjectCategory CRUD + seeded defaults + subject assignment

**Files:** Create `apps/api/prisma/seed-subject-categories.ts` (+ spec), `subject-categories.controller.ts`/`.service.ts` (in `structure` module), `dto`; Modify `subjects.service.ts` (accept `categoryId`), the structure module, `schools.service.ts` + `signup.service.ts` (seed on create).

**Interfaces:** `seedSubjectCategories(prisma, schoolId)` (idempotent; defaults: General, Languages, Sciences, Arts, Vocational, Religious). `GET/POST/PATCH/DELETE /v1/subject-categories` (`school.manage`), lazy-seed on GET. Subject create/update accept `categoryId` (validated to school).

- [ ] **Step 1: Failing test** `seed-subject-categories.spec.ts`: idempotent seed creates the 6 defaults; second call no-ops.
- [ ] **Step 2: Run to fail; implement the seeder** (mirror `seed-skill-defaults.ts`).
- [ ] **Step 3:** wire lazy-seed into the category `list()` + call `seedSubjectCategories` after school creation in `schools.service.createSchool` and `signup.service` (mirror AC-1's `seedSkillDefaults` wiring).
- [ ] **Step 4:** add `categoryId` to subject create/update DTO + service (validate the category belongs to the school). Test: assigning a category persists; a foreign-school categoryId → rejected.
- [ ] **Step 5: Run** `jest "subject-categ|subjects" --runInBand` → pass.
- [ ] **Step 6: Commit** `feat(structure): subject categories (seeded) + subject assignment (AC-2)`.

---

### Task 6: Report-card grouping by category

**Files:** Modify `report-card.service.ts` (+ spec).

**Interfaces:** The report-card payload's `subjects` are grouped: add `subjectGroups: { category: string | null; subjects: <existing subject entry>[] }[]` (ordered by category `order`; uncategorised subjects under a `category: null` "Subjects" group). Keep the flat `subjects` array too (BC for AC-1's renderer until the web updates in T8).

- [ ] **Step 1: Failing test** — seed subjects in 2 categories + 1 uncategorised; assert `subjectGroups` groups them correctly with category names, ordered.
- [ ] **Step 2: Run to fail; implement** (read each subject's `category`, group, order).
- [ ] **Step 3: Run** `jest report-card.service --runInBand` → pass.
- [ ] **Step 4: Commit** `feat(assessment): group report-card subjects by category (AC-2)`.

---

### Task 7: Web — per-level format editor + apply-to-levels

**Files:** Modify `apps/web/src/app/(app)/settings/assessment/…` (find the existing assessment settings page: `grep -rl "assessment-types\|grade-bound" apps/web/src/app`), `apps/web/src/lib/api.ts`.

**Interfaces:** api helpers: `listAssessmentTypes(classLevelId?)`, `createAssessmentType({...,classLevelId?})`, `applyAssessmentFormat({sourceClassLevelId,targetClassLevelIds})`, same for grade boundaries; `listClassLevels()` (exists).

- [ ] **Step 1:** add api helpers.
- [ ] **Step 2:** add a **level selector** ("Default" + each ClassLevel) at the top of the assessment settings page; editing components/boundaries targets the selected level (or default). Rows returned with `isDefault:true` for a specific level render read-only with an **"Override for this level"** button (creates level rows). Add an **"Apply to levels"** multi-select that calls the apply endpoints.
- [ ] **Step 3: Verify** web `tsc --noEmit` (0) + `next lint` (no errors).
- [ ] **Step 4: Commit** `feat(web): per-level assessment format editor + apply-to-levels (AC-2)`.

---

### Task 8: Web — subject categories + report-card grouping

**Files:** Modify the subjects screen (`grep -rl "listSubjects\|/subjects" apps/web/src/app`), `apps/web/src/app/(app)/report-card/[studentId]/page.tsx`, `lib/api.ts`.

**Interfaces:** api helpers `listSubjectCategories`, `createSubjectCategory`, `updateSubject({categoryId})`; report card consumes `subjectGroups` (T6).

- [ ] **Step 1:** api helpers.
- [ ] **Step 2:** on the subjects screen, add a `SubjectCategory` manager (list add/rename/delete) + a category `<Select>` per subject (saves `categoryId`).
- [ ] **Step 3:** in the report-card render (all 3 layouts), render subjects grouped by `subjectGroups` (category heading rows), falling back to the flat list if `subjectGroups` is absent.
- [ ] **Step 4: Verify** web `tsc --noEmit` (0) + `next lint`.
- [ ] **Step 5: Commit** `feat(web): subject categories UI + grouped report card (AC-2)`.

---

### Task 9: Regression gate

- [ ] `DATABASE_URL=... pnpm --filter @mymakaranta/api exec prisma migrate reset --force` → `tsc --noEmit` (0) → `jest --runInBand` (all pass, incl. existing scores/release/correction/report-card) → `nest build` then confirm `dist/main.js`.
- [ ] `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0, no TS2786 regression) + `vitest run` + `next lint`.
- [ ] Commit (`--allow-empty`): `test: AC-2 regression gate green`.

---

## Self-Review

**Spec coverage:** nullable classLevelId + partial-unique indexes + SubjectCategory (T1) ✓ · resolver (T2) ✓ · consumer refactor to resolver (T3) ✓ · CRUD + classLevelId + apply-to-levels (T4) ✓ · SubjectCategory CRUD + seeded + subject assignment (T5) ✓ · report-card grouping (T6) ✓ · web format editor + apply (T7) ✓ · web categories + grouped card (T8) ✓ · gate (T9) ✓.

**Placeholder scan:** T3/T7/T8 point to grep-located existing files + exact endpoints/patterns rather than full code (established codebase, web tasks); API model/logic tasks (T1,T2,T4,T5,T6) carry concrete code/tests. Reviewer enforces real assertions.

**Type consistency:** `resolveAssessmentTypes`/`resolveGradeBoundaries` (T2) consumed by T3; `classLevelId` param + `isDefault` flag (T4) consumed by T7; `subjectGroups` shape (T6) consumed by T8; `SubjectCategory`/`categoryId` (T1) consumed by T5/T6/T8.

**Risks:** T3 is the only behaviour change to scoring inputs — its test asserts BOTH the override path and the default (regression) path, and T9 re-runs the whole assessment suite. T1's partial indexes need raw SQL in the migration (`--create-only` then hand-edit). No dep additions (avoids the AC-1 `@types/react` hazard).
