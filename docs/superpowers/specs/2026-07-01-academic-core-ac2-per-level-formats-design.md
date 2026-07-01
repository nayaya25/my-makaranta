# Academic Core AC-2 — Per-Level Assessment Formats + Subject Categories — Design Spec

> **Status:** Approved (2026-07-01) · **Workstream 2 (Academic Core), sub-project 2 of 3.**
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let a school run **different assessment formats and grade boundaries per class-level** (Nursery vs Primary vs Senior grade differently) while keeping today's single school-wide setup working as a default — and add a **subject category** that groups subjects on the report card. Backward-compatible; the scoring math is unchanged.

## Context

`AssessmentType` (CA/Exam components with `maxScore` + `order`) and `GradeBoundary` (`grade`, `minScore`, `remark`) are currently **school-level** and consumed by `scores.service` (gradebook), the grade/position utils, `release.service`, `review.service`, `correction.service`, and `report-card.service`. `ClassLevel` is flat (Primary 1, JSS 1…); each `Class` belongs to a `ClassLevel`. `Subject` has no category.

## Decisions (locked)

1. **Scoping:** per-level **overrides + school default**. `AssessmentType`/`GradeBoundary` gain nullable `classLevelId`; `null` = school default, set = level override; resolve = the level's own set if it has any, else the default set. Existing rows (`null`) become the default with zero data migration.
2. **Subject category:** a single, optional, school-managed **`SubjectCategory`** per subject (seeded NG defaults), used to group subjects into sections on the report card and filter in Review.

## Data model

```
model AssessmentType {              // MODIFY
  // ...existing: id, schoolId, school, name, maxScore, order, scores, corrections
  classLevelId String?              // null = school default; set = per-level override
  classLevel   ClassLevel? @relation(fields: [classLevelId], references: [id])
  // REMOVE  @@unique([schoolId, name])
  @@unique([schoolId, classLevelId, name])   // enforces per-level uniqueness
  @@index([schoolId, classLevelId])
}
model GradeBoundary {               // MODIFY  (same shape of change)
  // ...existing: id, schoolId, school, grade, minScore, remark, order
  classLevelId String?
  classLevel   ClassLevel? @relation(fields: [classLevelId], references: [id])
  // REMOVE  @@unique([schoolId, grade])
  @@unique([schoolId, classLevelId, grade])
  @@index([schoolId, classLevelId])
}
model SubjectCategory {             // NEW
  id String @id @default(cuid())
  schoolId String
  name String
  order Int @default(0)
  subjects Subject[]
  @@unique([schoolId, name])
}
model Subject {                     // MODIFY
  // ...existing
  categoryId String?
  category   SubjectCategory? @relation(fields: [categoryId], references: [id])
}
```

**Default-uniqueness (nullable compound unique):** Postgres treats NULLs as distinct, so `@@unique([schoolId, classLevelId, name])` does NOT stop two `(schoolId, NULL, "CA1")` default rows. The migration therefore ALSO adds raw **partial unique indexes** for the default rows:
```sql
CREATE UNIQUE INDEX "AssessmentType_school_name_default_key"
  ON "AssessmentType" ("schoolId", "name") WHERE "classLevelId" IS NULL;
CREATE UNIQUE INDEX "GradeBoundary_school_grade_default_key"
  ON "GradeBoundary" ("schoolId", "grade") WHERE "classLevelId" IS NULL;
```
`ClassLevel` gains inverse relation arrays (`assessmentTypes`, `gradeBoundaries`).

## Resolution logic (the one refactor touchpoint)

New helpers (a small `format-resolution.ts` util in the assessment module):
- `resolveAssessmentTypes(prisma, schoolId, classLevelId): Promise<AssessmentType[]>` — return rows where `classLevelId = <level>`; if none, return the default rows (`classLevelId IS NULL`), ordered by `order`.
- `resolveGradeBoundaries(prisma, schoolId, classLevelId): Promise<GradeBoundary[]>` — same fallback.

Every consumer that currently loads `assessmentType.findMany({ where: { schoolId } })` / `gradeBoundary.findMany({ where: { schoolId } })` switches to the resolver, passing the class's `classLevelId` (from `class.classLevelId`). The grade/position/score math (`grade.util`, `position.util`, `score.util`) is UNCHANGED — it just receives the resolved components/boundaries. Report cards and released sheets use the level's resolved set. (Already-released `ResultSheetEntry` rows are frozen totals/grades and are untouched.)

## API

- **Assessment-type CRUD** (perm `results.record`/`school.manage` — match existing guard): create/update accept optional `classLevelId`. `GET /v1/assessment/assessment-types?classLevelId=` returns the **resolved** set with an `isDefault` flag per row (so the UI shows "inherited from default" vs "override"). Without `classLevelId` → the default set.
- **Grade-boundary CRUD**: same shape.
- **Copy format to levels:** `POST /v1/assessment/assessment-types/apply` body `{ sourceClassLevelId: string | null, targetClassLevelIds: string[] }` — clones the source (a level's set, or the default when null) into each target level as overrides (replacing any existing override rows for those levels, in a transaction). Same for grade boundaries (either a combined endpoint or a sibling). Perm `school.manage`.
- **SubjectCategory CRUD** (`school.manage`) + seeded defaults (lazy on first read + on school creation, like AC-1's skill defaults). Assigning a subject's category is part of the existing subject update (`categoryId`).

## Web

- **Settings → Assessment:** a **level selector** ("Default" + each ClassLevel). Editing components (CA/Exam names + maxScores + order) and grade boundaries applies to the selected level (or the default); rows inherited from default are shown read-only with an "Override for this level" action. An **"Apply to levels"** multi-select clones the current set to chosen levels.
- **Subjects screen:** manage `SubjectCategory` list + a category picker per subject.
- **Report card:** group subjects by `category` (extends AC-1 composition; uncategorised subjects fall under a default "Subjects" group).

## Migration / backward-compat

Additive column + partial indexes only. Existing school-level `AssessmentType`/`GradeBoundary` rows have `classLevelId = NULL` → they ARE the default; no data movement. All current consumers keep working because the resolver falls back to the default when a level has no override.

## Testing

- Unit: `resolveAssessmentTypes`/`resolveGradeBoundaries` — level with overrides returns overrides; level without returns defaults; ordering preserved.
- Constraint: two default "CA1" → rejected (partial index); a per-level "CA1" coexists with the default "CA1"; two "CA1" for the same level → rejected.
- Integration: a class whose level has an override computes grades from the override components/boundaries; a class on a level with no override uses the default; `report-card` groups subjects by category; `apply` clones onto targets (replacing prior overrides) transactionally.
- Regression: existing scores/gradebook/release/correction specs still pass (default fallback path).

## Out of scope (fast-follows / later)

- Per-level **skill scales** (AC-1 kept a single scale).
- **Bands/sections** grouping (chose flat + override).
- **Early Years** assessment (AC-3).
- Weighting beyond `maxScore` (components already encode weight via maxScore summing to 100).
