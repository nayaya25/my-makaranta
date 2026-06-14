# Sprint 3 · Slice 2 — Score Entry & Auto-Calc (Design)

- **Date:** 2026-06-14
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 2 of 6. Builds on slice 1 (assessment config).
- **Builds on:** `apps/api/src/modules/assessment/` (AssessmentType, GradeBoundary, SubjectAssignment, `resolveGrade`) + slice-1 spec.

## Goal

Let a teacher record raw assessment scores (CA1, CA2, CA3, Exam…) for the students
in a class+subject+term on a responsive web gradebook, and see each student's
auto-calculated total and grade live. Raw scores are the source of truth; totals and
grades are always derived (slice 4 freezes them at release).

## Scope (locked decisions)

1. **Approach A — raw scores only, compute on read.** A `Score` row per
   `(student, subject, assessmentType, term)` cell. Total + grade are derived in the
   gradebook GET (and reused by slices 3–4), never persisted in this slice.
2. **Access: permission-only (`results.record`).** Any holder records scores for any
   `(class, subject, term)` the school offers. Assigned-teacher enforcement is deferred
   until user↔staff identity-linking exists (not built; out of scope here).
3. **Additive total = sum of entered component values** (out of 100, per slice-1
   model). Grade via slice-1 `resolveGrade(total, boundaries)`.
4. **Structure guard: hard-block.** Once any `Score` exists for the school, the
   slice-1 `PUT /assessment/types` replace returns **409**. Grade boundaries stay
   editable (safe remap).

### Non-goals (this slice)
- Position-in-class, frozen `ResultSheet`, release workflow, immutability (slice 4).
- Review sheets / anomaly detection (slice 3). Report card / reveal (slices 5–6).
- Assigned-teacher enforcement / user↔staff identity-linking.
- Weighted scoring (slice-1 additive model only). Offline entry.

## Architecture

Extends the existing `apps/api/src/modules/assessment/` module. One new tenant-scoped
model + a pure compute helper + a scores service/controller. Web adds a `/gradebook`
page + api-client methods. Mirrors the attendance batch-upsert pattern.

### Data model — `Score`
- `id, schoolId, studentId, subjectId, classId, assessmentTypeId, termId, value (Int),
  recordedBy (String), updatedAt (DateTime @updatedAt)`
- `@@unique([studentId, subjectId, assessmentTypeId, termId])` — one cell, last-write-wins
- `@@index([schoolId, classId, subjectId, termId])` — the gradebook query
- Relations to `Student`, `Subject`, `Class`, `AssessmentType`, `Term`, `School`
  (add back-relations on each; mirror slice-1 additions).
- Tenant-scoped: add `"Score"` to `TENANT_MODELS`; RLS FORCE migration (mirror slice-1).
- `classId` is denormalized at entry (the gradebook always supplies it; a student's
  class is stable per term via unique `Enrollment(studentId, termId)`). Slices 3–4 group
  by it (class-master sheet, position-in-class).
- `value` validated server-side: `0 ≤ value ≤ assessmentType.maxScore`.

### Compute helper (pure, unit-tested, reused by slices 3–4)
`computeSubjectResult(scores: {assessmentTypeId, value}[], types: AssessmentType[],
boundaries: GradeBand[]) → { total, grade, remark, complete }`
- `total` = sum of entered component values.
- `complete` = every type in `types` has a value.
- `grade`/`remark` = `resolveGrade(total, boundaries)` or null if no boundaries.

## API (under `/v1/assessment`, `results.record`)

**`GET /v1/assessment/scores?classId=&subjectId=&termId=`** → gradebook payload:
```
{
  assessmentTypes: AssessmentType[],          // columns, ordered
  gradeBoundaries: GradeBoundary[],            // for live client recompute
  students: [{ studentId, firstName, lastName,
               scores: { [assessmentTypeId]: value },
               total, grade, remark, complete }]
}
```
- Students = `Enrollment` for `(classId, termId)`. `class`/`subject`/`term` validated via
  explicit `schoolId`-scoped finds; `Enrollment` has no `schoolId` so the class-ownership
  check gates the roster (same guard as attendance `getRoster`).
- Per-student result via `computeSubjectResult`.

**`POST /v1/assessment/scores`** (batch upsert) — body
`{ classId, subjectId, termId, scores: [{ studentId, assessmentTypeId, value }] }`:
- Validate (explicit `schoolId` scoping throughout — middleware is not relied upon, per
  the slice-1 tenancy learning): class/subject/term are this tenant's (else 404); each
  `assessmentTypeId` belongs to the school and `0 ≤ value ≤ maxScore` (else 400); each
  `studentId` is enrolled in `(classId, termId)` (else reject).
- Upsert by `(studentId, subjectId, assessmentTypeId, termId)`, set `value`, `classId`,
  `recordedBy`; explicit `schoolId` on create. Returns `{ saved }`.

**Structure guard** (modify slice-1 `AssessmentTypesService.replace`): if
`score.count({ where: { schoolId } }) > 0`, throw `ConflictException` (409,
"Cannot change assessment structure after scores have been entered.").

## Web — gradebook (`/gradebook`)

New `Gradebook` sidebar item. Page built from existing design-system primitives:
- Selectors: **Class**, **Term** (default current), **Subject**. Subject options = the
  class's offered subjects (distinct from slice-1 `listSubjectAssignments(classId,
  academicYearId)`, the year resolved from the selected term).
- Grid: rows = enrolled students; columns = assessment types (number inputs,
  `max=maxScore`) + **Total** + **Grade** (tone chip). Live recompute on input via the
  web `resolveGrade` + payload boundaries. Inline error + save-blocked on out-of-range.
- Save: batch `POST` with a saving/saved indicator.
- Empty states: no types → link to Settings → Assessment; no offered subjects / no
  enrolled students → guiding prompts.
- api-client: `getScores(classId, subjectId, termId)`, `saveScores(payload)`; terms
  derived from existing `listAcademicYears` (years carry terms); offered subjects via
  existing `listSubjectAssignments`.

## Validation & errors
- `value` out of `[0, maxScore]` → 400 (server) + inline UI flag, save blocked.
- Foreign `classId/subjectId/termId` → 404 (tenant-scoped finds).
- Non-enrolled `studentId` in a POST → rejected.
- Editing assessment types after scores exist → 409 surfaced in Settings → Assessment.
- No assessment types configured → gradebook empty state guides to config.

## Testing
- **API e2e** (extend `apps/api/test/assessment.e2e-spec.ts`):
  - `computeSubjectResult` unit (sum, grade, `complete` true/false).
  - POST batch upsert → GET returns scores + computed total/grade.
  - `value > maxScore` → 400; foreign class/subject/term → 404; non-enrolled student
    rejected; **cross-tenant** (school B POST to A's class) → 404.
  - **Structure guard**: after a score exists, `PUT /assessment/types` → 409.
  - All service reads/deletes explicitly `schoolId`-scoped (slice-1 tenancy learning).
- **Web** (vitest): unit-test the gradebook row compute (total + grade preview).
- **Browser QA**: enter scores → save → totals/grades correct + persisted; out-of-range
  rejected; structure-edit 409 surfaces in Settings.

## Dependencies
- Slice-1 assessment module (types, boundaries, assignments, `resolveGrade`),
  `Enrollment`, `Student`, `Subject`, `Class`, `Term`, the `results.record` permission
  (already seeded), the tenancy stack. No new npm deps.

## Out-of-scope future (later slices)
- Slice 3: class-master / subject-master review sheets + z-score anomaly detection
  (consumes `Score` + `computeSubjectResult`).
- Slice 4: release workflow, frozen `ResultSheet` (position-in-class), score immutability
  after release + correction flow.
