# Sprint 5 · Slice 3 — Dashboard Smart Alerts (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 5 (Reporting & Dashboards), slice 3 — the "quiet alert" trend signals on the dashboards (PRD aha §line 231: "a quiet alert that JSS2 has a 3-day attendance dip"). The LAST Sprint-5 slice.
- **Builds on:** slice 1 (proprietor dashboard, pure `attendanceRate`), slice 2 (principal per-class gathering — attendance `groupBy`, per-class fee fold, results coverage `offered ∩ scored`, `Class`→`Staff`), attendance/assessment/fees data, `reports.view`, role-aware `/dashboard`.

## Goal

Surface deterministic, explainable trend alerts on both dashboards so a proprietor (Sunday-morning
glance) and a principal ("who to call in today") immediately see what needs attention: a class whose
attendance dipped this week, a class with overdue fees, or a class whose results are unsubmitted late in
the term. One read-only computation over data already built. No new model, no migration.

## Scope (locked decisions, slice 3)
1. **Three signals:** `ATTENDANCE_DIP`, `LOW_COLLECTION`, `RESULTS_OVERDUE` — all **per class**.
2. **Extensible `Alert` shape** (`type`/`severity`/`classId`/`className`/`message`) so future signals slot
   in without rework; detection lives in a pure `buildAlerts` helper.
3. **Shown on both dashboards** (proprietor showpiece + principal table) via a shared `<AlertsPanel/>`.
4. **Reuse `reports.view`** (no new permission).

### Non-goals
- AI-generated narrative summaries / correlation ("the dip correlates with the security alert in week 6")
  — PRD Phase 3. Push notifications / emailing alerts. Per-student alerts (these are per-class). Alert
  dismissal/acknowledgement state (no model). Configurable thresholds in the UI (thresholds are sane
  constants this slice). Command palette; Ministry returns; multi-school/trend dashboards.

## Architecture

Extend `DashboardService` with `getAlerts(termId?)` + a `GET /v1/dashboard/alerts?termId=` route on the
existing `DashboardController`. A new pure module `alerts.util.ts` holds the `Alert` types + thresholds +
`buildAlerts(inputs, opts)` (all three heuristics). The service does **batched, explicitly tenant-scoped**
reads to assemble one `ClassAlertInput` per class, then calls `buildAlerts`. No new model, no migration.

### Endpoint
`GET /v1/dashboard/alerts?termId=` (`JwtAuthGuard` + `PermissionGuard`, `@RequirePermissions("reports.view")`):
- Term resolution identical to slices 1/2: `termId` given → `term.findFirst({ id, schoolId })` → **404** if
  not in this school; omitted → current term (`isCurrent`); neither → `{ term: null, alerts: [] }`.

### Types (in `alerts.util.ts`)
```ts
export type AlertType = "ATTENDANCE_DIP" | "LOW_COLLECTION" | "RESULTS_OVERDUE";
export type AlertSeverity = "high" | "medium";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  classId: string;
  className: string;
  message: string;
}

export interface ClassAlertInput {
  classId: string;
  className: string;
  attendance: { baselineRate: number; recentRate: number; recentMarks: number };
  fees: { expectedKobo: number; overdueKobo: number };
  results: { subjectsScored: number; subjectsOffered: number; released: boolean };
  termElapsedFraction: number; // 0..1; 1 when the term has ended
}

export const ALERT_THRESHOLDS = {
  dipDrop: 0.1,            // baseline − recent >= 0.10 → dip
  dipHighDrop: 0.2,        // drop >= 0.20 → high severity
  dipMinRecentMarks: 10,   // recent window needs >= 10 marks (noise guard)
  overdueHighFraction: 0.3,// overdueKobo / expectedKobo >= 0.30 → high
  resultsElapsed: 0.8,     // term >= 80% elapsed (or ended) → results expected
} as const;
```

### `buildAlerts(inputs: ClassAlertInput[], opts = ALERT_THRESHOLDS): Alert[]`
For each class, emit zero or more alerts (a class can trip several):
- **ATTENDANCE_DIP** — if `recentMarks >= dipMinRecentMarks` AND `baselineRate − recentRate >= dipDrop`:
  severity `high` when the drop `>= dipHighDrop` else `medium`. Message e.g.
  `"{className} attendance down {drop}% this week ({recent}% vs {baseline}% term average)."`
  (percentages rounded; `drop = round((baseline−recent)*100)`).
- **LOW_COLLECTION** — if `fees.overdueKobo > 0`: severity `high` when `overdueKobo / expectedKobo >=
  overdueHighFraction` (guard `expectedKobo > 0`) else `medium`. The full human-readable `message` is
  built server-side (the `<AlertsPanel/>` is a dumb renderer of `message`); `alerts.util.ts` includes a
  tiny local `formatNairaFromKobo(kobo)` → `"₦12,000"` (integer naira, thousands-separated) for the
  money portion. Message e.g. `"{className}: ₦120,000 in overdue fees (35% of expected)."`
- **RESULTS_OVERDUE** — if `termElapsedFraction >= resultsElapsed` AND NOT `results.released` AND
  `results.subjectsOffered > 0` AND `results.subjectsScored < results.subjectsOffered`: severity `high`
  when `termElapsedFraction >= 1` (term ended) else `medium`. Message e.g.
  `"{className}: results not released — {scored}/{offered} subjects scored."`
- Sort the returned alerts: `high` before `medium`, then by `type` (stable), then `className`.

(YAGNI: a class fully released with all subjects scored, no overdue, no dip → no alert. A healthy school
returns `[]`.)

### Service — `getAlerts(termId?)` (batched, tenant-scoped)
1. Resolve term (as above). Classes for the term = `class.findMany({ schoolId, enrollments: { some: { termId } } }, select: { id, name } )` → `classIds`. Empty → `{ term: header, alerts: [] }`.
2. **Baseline attendance** — `attendanceRecord.groupBy([classId,status])` over `{ schoolId, classId in ids, date: [term.startDate, windowTo=min(now,endDate)] }` → per-class `attendanceRate` → `baselineRate`.
3. **Recent attendance** — same `groupBy` over `{ date: [max(term.startDate, windowTo − 7d), windowTo] }` → per-class `recentRate` + `recentMarks` (totalDays).
4. **Fees** — `enrollment.findMany({ classId in ids, termId })` → student→class map; `invoice.findMany({ schoolId, termId, studentId in students }, select: totalKobo, paidKobo, dueDate)` → per class fold `expectedKobo` and `overdueKobo` (overdue = balance>0 where `computeInvoiceStatus({..,now}) === "OVERDUE"`, reusing the fees util).
5. **Results** — offered (`subjectAssignment` by `academicYearId`) ∩ scored (`Score` distinct `[classId,subjectId]` by `termId`) → `subjectsScored`/`subjectsOffered`; `release` set → `released`. (Same logic as slice 2.)
6. **Term elapsed fraction** — `clamp01((now − startDate) / (endDate − startDate))`; `1` when `now >= endDate`.
7. Assemble `ClassAlertInput[]` and `return { term: header, alerts: buildAlerts(inputs) }`.

### Web — `<AlertsPanel/>` on both dashboards
- `apps/web/src/app/(app)/dashboard/alerts-panel.tsx` (`"use client"`, prop `termId?: string`): fetches
  `api.getDashboardAlerts(termId)`; renders nothing while loading or when `alerts.length === 0` (calm — no
  empty "0 alerts" box). Each alert → a toned banner/card: `high` → error tone, `medium` → warning tone,
  with the `message`. A small heading "Needs attention" above the list when non-empty.
- Mounted in `ProprietorDashboardView` (above the KPI hero) and `PrincipalDashboardView` (above the table),
  passed the currently-selected `termId`.
- api client: `getDashboardAlerts(termId?)` + a `DashboardAlert`/`DashboardAlertsResponse` type. A 403 (a
  staff member without `reports.view`) → the panel renders nothing (it's a secondary surface; the
  principal view's own 403 fallback already handles the page-level case).

## Validation & errors
- Foreign `termId` → **404** (tenant-IDOR).
- No current term / no classes → `{ term: null|header, alerts: [] }`.
- A class with no attendance/fees/results data → no alerts (thresholds guard: `recentMarks` gate,
  `overdueKobo > 0`, `subjectsOffered > 0`); no division by zero (`attendanceRate`/fraction guards).
- Parents/students lack `reports.view` → 403 (and never reach a dashboard that mounts the panel).

## Testing
- **API e2e** (extend `test/dashboard.e2e-spec.ts`, service-level, fresh school): seed four classes —
  (a) attendance dip (baseline high over the term, recent-7d low, ≥10 recent marks), (b) overdue fees
  (an invoice past due with balance), (c) results overdue (term ended/≥80% elapsed, not released, partial
  coverage), (d) healthy (good attendance, paid, released-complete). Assert: exactly the expected alert
  `type`+`severity` per class fire; the healthy class produces none; total alert count matches. Plus
  foreign termId → 404; no current term → `alerts: []`.
- **Unit** (`alerts.util.spec.ts`): `buildAlerts` across fixtures — each type fires at/above its threshold
  and NOT just below (dip 0.10 boundary, `recentMarks` gate, overdue high-fraction 0.30 boundary, results
  elapsed 0.80 boundary + term-ended high severity); multiple alerts from one class; sort order
  (high before medium); empty input → `[]`.
- **Web:** light (optional).
- **Browser/HTTP QA:** as a proprietor → `GET /v1/dashboard/alerts` returns the seeded alerts; `/dashboard`
  shows the panel atop the showpiece; a staff (principal) view shows it atop the table; a healthy term
  shows no panel.

## Dependencies
- Slices 1–2 dashboard module + `attendanceRate`; `computeInvoiceStatus` (fees util, for overdue); attendance/
  assessment/fees data; `Term.isCurrent`+`academicYearId`+`startDate`/`endDate`; `reports.view`. No new npm
  deps, no model, no migration.

## Out-of-scope future
- AI narrative/correlation (Phase 3); push/email delivery; alert acknowledgement state; per-student alerts;
  UI-configurable thresholds; enrollment-trend / term-over-term alerts.
