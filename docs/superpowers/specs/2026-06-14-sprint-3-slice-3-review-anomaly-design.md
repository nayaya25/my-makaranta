# Sprint 3 · Slice 3 — Review Sheets & Anomaly Detection (Design)

- **Date:** 2026-06-14
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 3 of 6. Builds on slices 1+2.
- **Builds on:** `apps/api/src/modules/assessment/` — `Score`, `computeSubjectResult`, `resolveGrade`, `SubjectAssignment`, `Enrollment`.

## Goal

Pre-release review: a form teacher reviews her class across all subjects (class-master
sheet); an HOD reviews a subject across parallel classes (subject-master sheet) with
drift detection; both surface anomalous student scores (>2σ from the subject-term mean).
All read-only, computed on the fly — no new persisted model.

## Scope (locked decisions)

1. **Compute-on-read read endpoints + pure stats helper.** No new model; raw `Score`
   stays the source of truth (consistent with slice 2).
2. **Anomaly cohort = per (subject, term), all classes.** For each subject, the cohort is
   all enrolled students' subject totals across every class that term → one mean/σ →
   z = (total − mean)/σ; flag |z| > 2. Drives both sheets + the subject-master drift.
3. **Position deferred to slice 4** (frozen at release, never recomputed on read — charter).
   Review sheets show totals/grades + per-student average, not position.
4. **Access: permission-only (`results.review`).** Any holder views any class/subject
   (no user↔staff link yet; same constraint as slice 2).

### Non-goals
- Position-in-class, frozen `ResultSheet`, release, immutability (slice 4).
- Report card / reveal (slices 5–6). Editing scores (slice 2 owns the gradebook).
- Assigned-teacher/HOD enforcement (needs identity-linking, not built).

## Architecture

Extends `apps/api/src/modules/assessment/`. One pure helper + a review service/controller
(two read endpoints). Web adds a `/review` two-mode page + api client. No schema change.

### Pure helper — `anomaly.util.ts`
```
flagAnomalies(totals: { studentId: string; total: number }[], threshold = 2)
  → Map<string, { z: number; anomaly: boolean }>
```
- Population mean + σ over the totals; `z = (total − mean) / σ`; `anomaly = |z| > threshold`.
- σ = 0 (all equal) or n < 2 → all `z = 0`, `anomaly = false` (no false flags on tiny/uniform cohorts).
- Pure, unit-tested; reused by both sheets.

### Review service (`results.review`, explicit `schoolId` scoping, tenant-IDOR on ids)

**`GET /v1/assessment/review/class-master?classId=&termId=`** (form-teacher sheet):
- Subjects the class offers = distinct subjects from `SubjectAssignment(classId, year-of-term)`.
- Students enrolled in (classId, termId).
- Per (student, subject): `computeSubjectResult` → total + grade.
- Per student: average of subject totals (over subjects with any score).
- Anomaly flag per the (subject, term) cohort (see below).
- Payload:
```
{ subjects: [{id,name}],
  students: [{ studentId, name,
               perSubject: { [subjectId]: { total, grade, complete, anomaly } },
               average }] }
```

**`GET /v1/assessment/review/subject-master?subjectId=&termId=`** (HOD sheet):
- All classes offering the subject that term (distinct classId from `SubjectAssignment`
  for the subject+year, intersected with classes having enrollments that term).
- Per class: students' subject totals/grades, class mean, drift = classMean − subjectMean.
- Subject-wide mean/σ over the (subject, term) cohort.
- Payload:
```
{ subjectMean, subjectStdDev,
  classes: [{ classId, name, mean, drift,
              students: [{ studentId, name, total, grade, z, anomaly }] }] }
```

### Cohort computation
For a subject+term: collect every enrolled student's subject total (across all offering
classes) → `flagAnomalies` → one `{z, anomaly}` map. Class-master flags a cell using its
subject's cohort map; subject-master uses the same map + computes per-class means + drift.

## Validation & errors
- Foreign `classId/subjectId/termId` → 404 (explicit schoolId-scoped finds; `Enrollment`
  gated by class-ownership check, per the attendance/slice-2 pattern).
- No scores yet / empty cohort → sheets render with empty cells / `0` means, no crash.
- No subjects offered / no students → guiding empty states.

## Web — `/review` (`results.review`)
New `Review` sidebar item. Two-mode page (toggle Class master / Subject master), read-only:
- Class master: Class + Term selectors → matrix (students × subjects; cell = total +
  grade chip; anomaly cells highlighted warning) + Average column.
- Subject master: Subject + Term selectors → subject mean/σ header; per-class sections
  (class mean + drift badge; student rows with total/grade/z, anomalies highlighted).
- api client: `getClassMaster(classId, termId)`, `getSubjectMaster(subjectId, termId)`.
  Terms via `listAcademicYears`; classes/subjects via existing list endpoints.
- Empty/loading states; built from existing design-system primitives.

## Testing
- **`anomaly.util` unit:** mean/σ/z correctness; threshold; σ=0 and n<2 → no flags; a
  known >2σ outlier flagged; symmetric low/high outliers.
- **API e2e** (extend `assessment.e2e-spec.ts`): class-master matrix (totals/grades/average);
  subject-master per-class means + subject mean/σ + flags an injected outlier + drift sign;
  **cross-tenant** (school B → A's class/subject) → 404; explicit scoping holds.
- **Web** (vitest): optional light render/compute check.
- **Browser QA**: seed scores incl. one outlier across 2 classes → view both sheets →
  confirm anomaly highlight, class drift, averages.

## Dependencies
- Slices 1+2 (`Score`, `computeSubjectResult`, `SubjectAssignment`, `GradeBoundary`),
  `Enrollment`, the `results.review` permission (seeded), tenancy stack. No new npm deps.

## Out-of-scope future
- Slice 4: release workflow, frozen `ResultSheet` (position-in-class), immutability +
  correction flow — consumes these review views + the same compute helpers.
