# Sprint 5 · Slice 2 — Principal Operational Dashboard (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 5 (Reporting & Dashboards), slice 2 — the principal's operational class-by-class view (PRD §2.2.2 story #1: "a single dashboard showing class-by-class status (attendance, results submitted, fees paid), so that I know who to call into my office today").
- **Builds on:** slice 1 (`apps/api/src/modules/dashboard/`, pure `attendanceRate`, role-aware `/dashboard`), attendance (`AttendanceRecord`), assessment (`SubjectAssignment`, `Score`, `Release`), fees (`Invoice`, `Enrollment`), `Class.formTeacherId` → `Staff`, `reports.view` (seeded + proprietor-granted), `formatMoney` (web).

## Goal

A principal opens `/dashboard` and sees a dense, per-class status table for the current term —
attendance rate, results submission coverage (+ release state), and fee collection — so they know
which form teachers to chase and which classes need attention today. One read-only aggregation over
data already built. No new model, no migration.

## Scope (locked decisions, slice 2)
1. **Per-class table** for the term: each class = one row.
2. **Results column = submission coverage + released:** `subjectsScored / subjectsOffered` (the
   chase signal — which form teacher is behind) PLUS a released yes/no badge.
3. **Fees per class via enrollment** (a true per-class paid%, not the class-level figure repeated).
4. **Reuse `reports.view`** (no new permission). The endpoint is permission-gated; the **web** shows
   this view to non-proprietor staff and falls back to the quick-links stub on a 403.

### Non-goals
- Smart alerts / trend detection (slice 3); the proprietor showpiece (slice 1, unchanged); inline
  tactical entry (scoring, attendance marking — PRD anti-feature: link out, don't embed); staff
  attendance/lateness (a different module); Ministry termly-returns export; command palette;
  per-class drill-in pages (the cells may deep-link to existing `/release` and `/fees`, but no new
  detail page in this slice); re-sorting rows by "attention score" (problems are surfaced by visual
  flags on a predictably-ordered table).

## Architecture

Extend `DashboardService` (slice 1) with `getPrincipalSummary(termId?)` + a new
`GET /v1/dashboard/principal?termId=` route on the existing `DashboardController`. All reads are
**explicitly tenant-scoped** (`where: { schoolId }`) and **batched** across the term's classes — one
query per dimension, assembled in JS (NO per-class query loop / N+1). Reuses the slice-1 pure
`attendanceRate`; adds one pure helper `feePaidRate(collectedKobo, expectedKobo)` (returns 0 when
`expectedKobo === 0`). No new model, no migration.

### Endpoint
`GET /v1/dashboard/principal?termId=` (`JwtAuthGuard` + `PermissionGuard`, `@RequirePermissions("reports.view")`):
- Resolve the term exactly as slice 1: `termId` given → `term.findFirst({ id, schoolId })` → **404** if
  not in this school; omitted → current term (`isCurrent`); neither → `{ term: null, classes: [] }`.

### Response shape
```ts
{
  term: { id: string; name: string; number: number } | null,   // name = academicYear.name
  classes: Array<{
    classId: string;
    className: string;
    formTeacher: string | null;                 // "First Last" or null if unassigned
    attendance: { rate: number; presentDays: number; totalDays: number };  // rate 0..1
    results: { subjectsScored: number; subjectsOffered: number; released: boolean };
    fees: { expectedKobo: number; collectedKobo: number; paidRate: number };  // paidRate 0..1
  }>
}
```
Sorted by `classLevel.order` then `className` (stable, predictable). `term: null` → `classes: []`.

### Per-class computation (all batched over the term's classes)
1. **Classes** — `class.findMany({ where: { schoolId, enrollments: { some: { termId } } }, include: { classLevel: { select: { order: true } } } })` → `classIds`, `formTeacherId`s, level order for the sort.
2. **Form teachers** — `staff.findMany({ where: { schoolId, id: { in: formTeacherIds } }, select: { id, firstName, lastName } })` → id→"First Last" map; `null` when `formTeacherId` is null.
3. **Attendance** — `attendanceRecord.groupBy({ by: ["classId", "status"], where: { schoolId, classId: { in: classIds }, date: { gte: term.startDate, lte: min(now, term.endDate) } }, _count: { _all: true } })` → per-class `AttendanceCounts` → `attendanceRate`.
4. **Offered subjects** — `subjectAssignment.groupBy({ by: ["classId"], where: { schoolId, classId: { in: classIds }, academicYearId: term.academicYearId }, _count: { _all: true } })` → per-class `subjectsOffered`.
5. **Scored subjects** — `score.findMany({ where: { schoolId, termId, classId: { in: classIds } }, distinct: ["classId", "subjectId"], select: { classId: true } })` → count rows per class = `subjectsScored` (distinct subjects with ≥1 score).
6. **Released** — `release.findMany({ where: { schoolId, termId, classId: { in: classIds } }, select: { classId: true } })` → set → `released` per class.
7. **Fees** — `enrollment.findMany({ where: { classId: { in: classIds }, termId }, select: { studentId, classId } })` → student→class map; `invoice.findMany({ where: { schoolId, termId, studentId: { in: studentIds } }, select: { studentId, totalKobo, paidKobo } })` → fold each invoice into its student's class → per-class `expectedKobo`/`collectedKobo` → `feePaidRate`.

(A student has one enrolment per (class, term); invoices are per (student, term). The fold is unambiguous.)

### Web — role-aware `/dashboard`
`(app)/dashboard/page.tsx` (slice 1 added PARENT→`/parent` + PROPRIETOR→showpiece): for a non-PROPRIETOR
staff user with a `schoolId`, render `<PrincipalDashboardView/>` instead of the static quick-links stub.
- `PrincipalDashboardView` (`"use client"`): term selector (current-term default, same pattern as slice 1)
  → `api.getPrincipalDashboard(termId?)` → a dense table: **Class · Form teacher · Attendance % ·
  Results (`X/Y` + a released/not-released `Badge`) · Fees (paid% + `formatMoney` collected/expected)**.
  Light-mode / pragmatic per the PRD. A row whose attendance `rate < 0.85` OR `subjectsScored <
  subjectsOffered` gets a `warning`-toned marker (the "call them in" cue). Empty state when
  `term === null` or no classes: "No classes this term yet." Loading `Spinner`; inline error.
- **403 fallback:** if `getPrincipalDashboard` returns 403 (a staff member without `reports.view`), the
  component renders the existing quick-links stub instead — lower-privilege staff are not broken.
- api client: `getPrincipalDashboard(termId?)` (+ a `PrincipalDashboard` response type). The 403 must be
  distinguishable (the existing `authedRequest`/`ApiError` carries the status — catch and branch).

## Validation & errors
- Foreign `termId` → **404** (tenant-IDOR; uniform message).
- No current term and no `termId` → `{ term: null, classes: [] }` (friendly empty state).
- A class with no enrolments / no scores / no offered subjects / no invoices → zeros (rate 0, 0/0
  coverage, paidRate 0), no crash; `feePaidRate` and `attendanceRate` guard division by zero.
- Non-proprietor staff WITHOUT `reports.view` → endpoint 403 → web falls back to the stub.
- Parents/students lack `reports.view` → 403 (and they never reach this branch: parents redirect to
  `/parent`).

## Testing
- **API e2e** (extend `test/dashboard.e2e-spec.ts`, service-level, two-school A/B): seed in school A a
  term + **two classes** with differing data — class 1: a form teacher, 2 of 3 offered subjects scored,
  released, attendance 8/10, two students with invoices (one paid, one partial); class 2: no form
  teacher, 0 of 2 scored, not released, no attendance, one fully-paid student. Assert each class's row:
  `subjectsScored`/`subjectsOffered`, `released`, `attendance.rate`, per-class `fees.paidRate`,
  `formTeacher` name (and `null` for class 2), sort order (by level order then name). **No termId →
  current term**; **foreign termId → 404**; **no current term → `classes: []`**; school B sees only its
  own classes.
- **Unit:** `feePaidRate` (normal ratio; `expectedKobo === 0` → 0). (`attendanceRate` already covered.)
- **Web:** light (optional).
- **Browser/HTTP QA:** as a staff member with `reports.view` → `GET /v1/dashboard/principal` returns the
  per-class rows; `/dashboard` renders the dense table with the right flags; a proprietor still sees the
  slice-1 showpiece; a staff member without `reports.view` falls back to the quick-links stub.

## Dependencies
- Slice 1 dashboard module + `attendanceRate` + role-aware `/dashboard`; `SubjectAssignment`/`Score`/
  `Release` (assessment); `Enrollment`/`Invoice` (fees); `Class.formTeacherId`/`Staff`; `Term.isCurrent`
  + `academicYearId`; `ClassLevel.order`; `reports.view`; `formatMoney`. No new npm deps, no model, no
  migration.

## Out-of-scope future
- Slice 3 smart alerts; staff attendance/lateness; Ministry termly returns; command palette; per-class
  drill-in detail pages; student 360° history (a separate principal story).
