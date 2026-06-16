# Sprint 4 · Slice 3c — Fees Finance Summary (Design)

- **Date:** 2026-06-16
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 3c — the last collections sub-slice. Builds on s1–s3a.
- **Builds on:** `Invoice` (totalKobo/paidKobo/dueDate/classLevel), `Payment` (status/paidAt/amountKobo), `computeInvoiceStatus` (3a), `formatMoney` (web), `reports.view` perm.

## Goal

A term-scoped finance summary on `/fees`: KPI cards (expected, collected, outstanding, overdue,
collected-this-week) + a per-class-level breakdown — the proprietor/bursar "Sunday-morning"
picture. Read-only; no new model.

## Scope (locked decisions)
1. **Lives on `/fees`** as a term-scoped summary section (above the collections table).
2. **Metrics:** Expected (Σ invoice totals), Collected (Σ paid), Outstanding (Σ balance), Overdue
   (Σ balance of past-due outstanding), Collected-this-week (Σ SUCCESS Payment.amountKobo in the
   last 7 days for the term) + a **by-class-level** breakdown (expected/collected/outstanding +
   student count).
3. **Pure aggregator** reusing `computeInvoiceStatus`; read-only service; no mutation.

### Non-goals
- Cross-module proprietor dashboard (attendance + results + fees); charts/trend lines; CSV export;
  arbitrary date ranges; slice 4 (parent self-serve pay).

## Architecture

A pure `finance-summary.util` aggregator + a read-only `finance.service` method (in the fees
module) + a controller route. Web adds a summary section to `/fees`. No model, no migration.

### Pure aggregator — `apps/api/src/modules/fees/finance-summary.util.ts`
```ts
export interface SummaryRow { classLevelId: string; classLevelName: string; totalKobo: number; paidKobo: number; dueDate: Date | null; }
export interface ClassLevelSummary { classLevelId: string; classLevelName: string; expectedKobo: number; collectedKobo: number; outstandingKobo: number; studentCount: number; }
export interface FinanceSummary { expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; byClassLevel: ClassLevelSummary[]; }

summarizeInvoices(rows: SummaryRow[], now: Date): FinanceSummary
```
- `expectedKobo = Σ total`; `collectedKobo = Σ paid`; `outstandingKobo = Σ (total − paid)`;
  `overdueKobo = Σ (total − paid)` over rows where `computeInvoiceStatus({total,paid,dueDate,now})
  === "OVERDUE"`.
- `byClassLevel`: group by `classLevelId`, accumulate expected/collected/outstanding +
  `studentCount` (rows per level, i.e. one invoice per student-term); sort by `classLevelName`.
- Pure, deterministic, reuses `computeInvoiceStatus`. Unit-tested.
- `collectedThisWeekKobo` is NOT in this util (it needs a Payment query) — the service computes
  and returns it alongside.

### Service — `finance.service.ts` (`reports.view`, explicit `schoolId` scoping, IDOR)
`getFinanceSummary(termId)`:
1. `schoolId = TenantContext.schoolIdOrThrow()`; `term.findFirst({ id, schoolId })` → 404.
2. `invoices = invoice.findMany({ where: { schoolId, termId }, include: { classLevel: { select:
   { name: true } } } })` → map to `SummaryRow[]` → `summarizeInvoices(rows, new Date())`.
3. `collectedThisWeekKobo` = sum of `payment.findMany({ where: { schoolId, status: "SUCCESS",
   paidAt: { gte: <now−7d> }, invoice: { termId } } })` `.amountKobo` (or a `prisma.payment.aggregate`
   `_sum`). The `invoice: { termId }` relation filter keeps it tenant+term scoped (Payment carries
   `schoolId` too — include it).
4. Return `{ ...summary, collectedThisWeekKobo }`.
Read-only; no mutation.

### Controller
`GET /v1/fees/finance/summary?termId=` (`reports.view`) → `getFinanceSummary(termId)`.

### Web — `/fees` finance summary section
Above the collections table, a term-scoped section: **KPI cards** — Expected · Collected ·
Outstanding · Overdue (error tone) · Collected this week — each via `formatMoney(kobo, currency)`;
and a **by-class-level table** (Class level · Expected · Collected · Outstanding · Students).
Reuses the page's term selector; reloads with the term. api client: `getFinanceSummary(termId)`.
Loading/empty states. Screen-only (no print concern).

## Validation & errors
- Foreign term → 404 (explicit `schoolId`). No invoices for the term → all-zero summary + empty
  `byClassLevel` (no crash). Overdue requires a `dueDate` in the past + outstanding balance.

## Testing
- **Unit (`summarizeInvoices`, jest):** totals across mixed invoices; overdue counts only past-due
  outstanding (a future-due or no-dueDate outstanding invoice is NOT overdue; a PAID invoice
  contributes to collected, not outstanding/overdue); by-class-level grouping + per-group sums +
  studentCount; empty rows → zeros + empty array.
- **API e2e:** seed a term with invoices across 2 class levels (paid / partial / unpaid-overdue
  via a past dueDate) + a recent SUCCESS Payment + an old one → `getFinanceSummary` returns correct
  expected/collected/outstanding/overdue; `collectedThisWeekKobo` counts only the recent payment;
  `byClassLevel` sums + studentCount match; cross-tenant term → 404.
- **Browser QA:** open `/fees` for the QA term → summary cards + by-class table show figures
  consistent with the collections table (overdue highlighted).

## Dependencies
- s1–s3a (`Invoice`/`Payment`/`computeInvoiceStatus`), `formatMoney`, `reports.view` perm. No new
  npm deps; no migration; no new model.

## Out-of-scope future
- Cross-module proprietor dashboard; trends/charts; CSV/PDF export; per-month windows; slice 4.
