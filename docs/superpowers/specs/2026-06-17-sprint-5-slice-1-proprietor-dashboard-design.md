# Sprint 5 · Slice 1 — Proprietor Dashboard (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 5 (Reporting & Dashboards), slice 1 — the first slice of the dashboard module and the PRD's headline "selling room" screen (PRD §4.10, aha moment §line 231).
- **Builds on:** fees finance summary (slice 3c — pure `summarizeInvoices`), attendance (`AttendanceRecord`), assessment release (`Release`/`ResultSheet` — slice 3/4), `formatMoney` (web), role-aware `/dashboard` (slice 4b), `reports.view` permission (seeded + proprietor-auto-granted).

## Goal

A proprietor opens `/dashboard` and sees, at a glance, the health of their school for the current
term: fees collected this week + the term fee position, school-wide attendance rate, results-release
progress, and the top-performing class. One read-only aggregation over data already built (fees,
attendance, results). No new model, no migration.

## Dashboard module decomposition (context)
- **Slice 1 — proprietor dashboard (THIS):** glanceable school-wide KPI hero cards (the showpiece).
- **Slice 2 — principal operational dashboard:** class-by-class "who to call in today" table
  (attendance, results submitted, fees paid per class).
- **Slice 3 — alerts/signals:** trend detection (e.g. "JSS2 has a 3-day attendance dip").
- **Deferred (PRD Phase 2):** Command-K palette, Ministry-format termly returns export, multi-school
  comparative + term-over-term trend views.

## Scope (locked decisions, slice 1)
1. **Proprietor dashboard only** — a complete vertical slice (aggregation endpoint + web showpiece).
   The principal/operational class table is slice 2; smart alerts are slice 3.
2. **Standard KPI set:** fees (collected-this-week hero + term expected/collected/outstanding/
   overdue), school attendance rate, results-release progress (X of Y classes), top-performing class.
   No per-class snapshot table on the proprietor home (avoids overlap with slice 2).
3. **Reuse `reports.view`** (already seeded + proprietor-granted, same as the finance summary) — no new
   permission, no RBAC backfill.

### Non-goals
- Per-class operational table (slice 2); smart anomaly alerts (slice 3); command palette; termly
  returns export; multi-school / trend views; dark-mode-only theming (the route respects the app's
  existing light/dark tokens — craft comes from layout/typography, not a forced theme); a term picker
  beyond a simple current-term-default selector.

## Architecture

New `apps/api/src/modules/dashboard/` module (`DashboardModule`, `DashboardController`,
`DashboardService`) + two pure helpers with unit tests. **No new model, no migration.** The service
reuses the pure `summarizeInvoices` util (slice 3c) and does its own **explicitly tenant-scoped**
queries for fees rows, payments, attendance, and results — avoiding cross-module DI coupling (no
injecting FinanceService/ReleaseService, so no transitive `@Global` provider burden in tests).

### Endpoint
`GET /v1/dashboard/proprietor?termId=` (`JwtAuthGuard` + `PermissionGuard`, `@RequirePermissions("reports.view")`):
- Resolve the term: if `termId` given → `term.findFirst({ id: termId, schoolId })` → **404** if not in
  this school (tenant-IDOR). If omitted → the school's current term (`term.findFirst({ schoolId,
  isCurrent: true })`). If neither resolves → return `term: null` + zeroed KPIs (no crash).
- Otherwise compute and return the response shape below.

### Response shape
```ts
{
  term: { id: string; name: string; number: number } | null,   // name = academicYear.name
  fees: {
    expectedKobo: number; collectedKobo: number; outstandingKobo: number;
    overdueKobo: number; collectedThisWeekKobo: number;
  },
  attendance: {
    rate: number;          // 0..1 fraction; web formats as %
    presentDays: number;   // present + late records
    totalDays: number;     // all records in window
    windowFrom: string;    // ISO
    windowTo: string;      // ISO
  },
  results: {
    classesReleased: number;
    classesTotal: number;  // classes with enrolments this term
    topClass: { classId: string; name: string; average: number } | null,
  }
}
```
With `term: null`, fees/attendance are zeroed and `results` is `{0,0,null}`.

### KPI definitions (computed in `DashboardService`, tenant-scoped by `schoolId`)
- **Fees:** load the term's invoices (`invoice.findMany({ schoolId, termId }, include classLevel name
  + dueDate)`) → `summarizeInvoices(rows, now)` → `{expectedKobo, collectedKobo, outstandingKobo,
  overdueKobo}` (drop `byClassLevel` — not shown here). Plus `collectedThisWeekKobo` =
  `payment.aggregate(_sum amountKobo)` over `{ schoolId, status: SUCCESS, paidAt: { gte: now-7d },
  invoice: { termId } }` (mirrors `FinanceService`).
- **Attendance rate** — pure `attendanceRate(counts)`: over the window
  `[term.startDate, min(now, term.endDate)]`, count `attendanceRecord` by status scoped to
  `{ schoolId, date: { gte, lte } }`; `presentDays = present + late`, `totalDays = all`;
  `rate = totalDays === 0 ? 0 : presentDays / totalDays`. (Late counts as attended; absent/excused do
  not. 0..1 fraction — the web must treat it as a fraction, per the Sprint 2 rate bug.)
- **Results** — `classesTotal` = `class.findMany({ schoolId, enrollments: { some: { termId } } })`
  count; `classesReleased` = `release.findMany({ schoolId, termId })` count. **Top class** — pure
  `pickTopClass(rows)`: from `resultSheet.groupBy({ by: classId, where: { schoolId, termId }, _avg:
  average })`, the released class with the highest mean `average`; resolve its name; `null` if no
  releases. (Ties → first by highest average then stable; document in the helper.)

### Web — role-aware `/dashboard`
`(app)/dashboard/page.tsx` already loads the user + redirects PARENT → `/parent`. Add: if
`identityType === "PROPRIETOR"` → render `<ProprietorDashboard/>`; every other staff identity keeps the
existing quick-links stub (slice 2 builds the principal view).
- `ProprietorDashboard` (`"use client"`): a small term selector (defaults to the current term; lists
  the school's terms via the existing terms endpoint) → `api.getProprietorDashboard(termId?)` →
  KPI hero cards reusing the `/fees` finance-summary card vocabulary + `formatMoney(kobo, "NGN")`:
  - Hero: **Collected this week** (`collectedThisWeekKobo`).
  - Fees row: Expected / Collected / Outstanding / **Overdue** (overdue in `text-error`).
  - **Attendance rate** card (`Math.round(rate * 100)%`) with the window dates.
  - **Results** card: "`classesReleased` of `classesTotal` classes released" + **Top class** (name +
    `average`) or "—" when none released.
  - Empty state when `term === null`: "No active term yet."
- api client: `getProprietorDashboard(termId?)` (+ a `ProprietorDashboard` response type).

## Validation & errors
- `termId` not in the caller's school → **404** (tenant-IDOR; uniform message).
- No current term and no `termId` → `term: null` + zeroed KPIs (friendly empty state, no crash).
- A term with no invoices / no attendance / no releases → zeros + `topClass: null` (no crash).
- Non-proprietor staff with `reports.view` may call the endpoint (it's school-wide, not sensitive
  per-student data); the **web** only surfaces it for PROPRIETOR. Parents/students lack `reports.view`
  → 403 from the guard.

## Testing
- **API e2e** (`dashboard.e2e-spec.ts`, service-level inside `TenantContext.run`, two-school A/B): seed
  school A with a term (`isCurrent`), invoices (some paid → collected/outstanding), a few attendance
  records (present/late/absent across the window), and one released class with `ResultSheet` averages.
  Assert: fees KPIs match `summarizeInvoices`; `collectedThisWeekKobo` counts only recent SUCCESS
  payments; attendance `rate` = (present+late)/total; `classesReleased`/`classesTotal` correct;
  `topClass` = the released class with the highest mean average. **No `termId` → current term**
  resolved. **`termId` from school B → 404** (cross-tenant). **No current term** → `term: null` +
  zeros. School B sees only its own aggregates.
- **Unit:** `attendanceRate` (zero-division → 0; late counted) and `pickTopClass` (empty → null; tie →
  deterministic) pure helpers.
- **Web:** light (optional).
- **Browser/HTTP QA:** as a proprietor (`reports.view`) → `GET /v1/dashboard/proprietor` returns the
  KPIs; `/dashboard` renders the proprietor hero cards (fees this week, attendance %, release progress,
  top class); a non-proprietor staff login still sees the quick-links stub; a parent still redirects to
  `/parent`.

## Dependencies
- Pure `summarizeInvoices` (slice 3c), `AttendanceRecord` (Sprint 2), `Release`/`ResultSheet`
  (assessment slices 3–4), `Term.isCurrent`, `formatMoney` (web), role-aware `/dashboard` (4b),
  `reports.view` (seeded + proprietor-granted). No new npm deps, no model, no migration.

## Out-of-scope future
- Slice 2 principal operational dashboard; slice 3 smart alerts; command palette; termly returns
  export; multi-school + trend dashboards; per-user dashboard customization.
