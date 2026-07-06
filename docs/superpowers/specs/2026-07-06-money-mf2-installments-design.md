# Money/Fees MF-2 — Installment Plans — Design Spec

> **Status:** Approved (2026-07-06) · **Workstream 3 (Money/Fees), sub-project 2** (Discounts ✓ → Installments → Parent portal; MF-4/5/6 later).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let schools define a per-level/term installment schedule (percentages + due dates) so each generated invoice is automatically split into installments scaled to the student's net total, with per-installment paid/overdue state derived from payments already received — no change to how payments are recorded.

## Context (existing code this builds on)

- `FeeItem {schoolId, classLevelId, termId, name, amountKobo, order}` — set per (level, term) via `FeesService.setFeeItems` (delete-all + recreate). The installment schedule mirrors this shape.
- `Invoice {schoolId, studentId, termId, classLevelId, grossKobo, discountKobo, totalKobo(=NET), paidKobo, dueDate, lines[], invoiceDiscounts[]}` `@@unique([studentId, termId])`. `generateInvoices(termId, dueDate?)` sums fee items → net (after MF-1 discounts) → upserts invoice, replaces `InvoiceLine`/`InvoiceDiscount`; **skips** invoices with `paidKobo > 0`.
- Payments increment `Invoice.paidKobo` (`recordOfflinePayment`, `applyByReference`); they are NOT allocated to any installment. `balanceKobo = totalKobo − paidKobo`.
- `computeInvoiceStatus({totalKobo, paidKobo, dueDate, now})` → `UNPAID|PARTIAL|PAID|OVERDUE` (derived, no stored status). Collections/reminders operate at invoice level.
- Amounts are integer **kobo**. New tenant tables follow the assessment precedent (middleware + explicit scoping, **no per-table RLS**). Build invariant: no `apps/api/src` import from top-level `prisma/`; prod build emits `dist/main.js`. Permissions `fees.view`/`fees.manage`.

## Decisions (locked)

1. **Schedule model:** per **(classLevel, term)** schedule (mirrors `FeeItem`); `generateInvoices` splits each invoice's net across it automatically.
2. **Amounts:** **percentage** (basis points) of the student's net total; the last installment absorbs rounding so installments sum exactly to `totalKobo`.
3. **Materialization:** `Installment` rows are materialized per invoice at generation (like `InvoiceLine`/`InvoiceDiscount`). **Payments are unchanged** — per-installment paid state is *derived* by allocating `paidKobo` across installments in order (waterfall).
4. **Overdue:** installment-aware — the next unpaid installment past its due date makes the invoice read `OVERDUE`, and the schedule shows which installment is late. **Reminders stay invoice-level** (existing pipeline unchanged).

## Data model (additive — no existing model changes except back-relations)

```prisma
model ScheduleInstallment {
  id           String     @id @default(cuid())
  schoolId     String
  school       School     @relation(fields: [schoolId], references: [id])
  classLevelId String
  classLevel   ClassLevel @relation(fields: [classLevelId], references: [id])
  termId       String
  term         Term       @relation(fields: [termId], references: [id])
  order        Int
  label        String?
  percentBps   Int                                   // basis points 1–10000; rows for a (level,term) sum to 10000
  dueDate      DateTime

  @@unique([classLevelId, termId, order])
  @@index([schoolId, classLevelId, termId])
}

model Installment {
  id         String   @id @default(cuid())
  schoolId   String
  school     School   @relation(fields: [schoolId], references: [id])
  invoiceId  String
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  order      Int
  label      String?
  amountKobo Int
  dueDate    DateTime

  @@unique([invoiceId, order])
  @@index([schoolId, invoiceId])
}
```

- Back-relations: `School { scheduleInstallments ScheduleInstallment[]  installments Installment[] }`, `ClassLevel { scheduleInstallments ScheduleInstallment[] }`, `Term { scheduleInstallments ScheduleInstallment[] }`, `Invoice { installments Installment[] }`.
- Add `"ScheduleInstallment"`, `"Installment"` to `TENANT_MODELS`. Migration name: `installments`.

## Computation & derivation

**Split (pure util `splitInstallments`)** — inputs `netKobo` + ordered schedule rows `[{order, label, percentBps, dueDate}]`:
- For each row except the last: `amount = floor(netKobo × percentBps / 10000)`.
- Last row: `amount = netKobo − Σ(previous amounts)` (absorbs rounding; installments sum exactly to `netKobo`, and the last is ≥ 0 because `Σ percentBps = 10000`).
- Returns `[{order, label, amountKobo, dueDate}]`.

**At `generateInvoices`** (inside the transaction, per non-skipped invoice, after net total + lines + discounts): load `ScheduleInstallment` for `(schoolId, classLevelId, termId)` ordered by `order`. If present → `splitInstallments(net, rows)` → `installment.deleteMany({schoolId, invoiceId})` then `createMany`; set `Invoice.dueDate` = the **last** installment's `dueDate`. If absent → no `Installment` rows; keep the existing single-`dueDate` behavior (the `dueDate?` param). The paid-invoice skip (`paidKobo > 0`) is preserved unchanged.

**Allocation (pure util `allocatePayments`)** — inputs `paidKobo` + ordered installments + `now`:
- Walk installments in `order`: `paid_i = min(remaining, amountKobo)`, `remaining -= paid_i`.
- `status_i` = `PAID` if `paid_i == amountKobo`; else `OVERDUE` if `dueDate < now`; else `PARTIAL` if `paid_i > 0`; else `DUE`.
- Returns per-installment `{order, label, amountKobo, dueDate, paidKobo, status}`.

**Invoice status** (extend `computeInvoiceStatus` or add `computeInvoiceStatusWithInstallments`): `PAID` if `paidKobo ≥ totalKobo`; else `OVERDUE` if any installment is `OVERDUE` (or, with no schedule, the invoice `dueDate` is past); else `PARTIAL` if `paidKobo > 0`; else `UNPAID`.

## API (extend the `fees` module)

Writes require `fees.manage`, reads `fees.view`; all tenant-scoped by `schoolId`; request ids validated first.

- `GET /v1/fees/installment-schedule?classLevelId=&termId=` → the ordered schedule rows.
- `PUT /v1/fees/installment-schedule` `{classLevelId, termId, installments: [{order, label?, percentBps, dueDate}]}` — validate the level+term belong to the school, each `percentBps` in 1–10000, `Σ percentBps == 10000`, each `dueDate` a valid date; replace the schedule (delete-all + recreate, like `setFeeItems`). An empty `installments` array clears the schedule.
- `getInvoice` extended to return `installments: [{order, label, amountKobo, dueDate, paidKobo, status}]` (via `allocatePayments`) + the installment-aware `status`.
- `getInvoices` rows gain `nextDueDate` (earliest unpaid installment's due date, or the invoice `dueDate`) + `status`.

## Web

- **Fees settings → Installment schedule** (per class-level + term selector): an ordered editor — rows of `label`, `percent`, `due date`, add/remove; a live **sum indicator** that must equal 100% before save; clear = save empty.
- **Invoice detail**: render the installment schedule — each row's amount, due date, amount paid, and a status badge (Paid / Partial / Due / Overdue); highlight the overdue one. `@mymakaranta/ui`, teal/lime, consistent with existing fee screens.

## Testing

- **`splitInstallments` (pure):** [50/25/25 bps 5000/2500/2500] on net 100000 → [50000,25000,25000]; rounding case net 99999 with 3 equal (3334/3333/3333 bps... use 3334+3333+3333=10000) → last absorbs remainder, sum == 99999; single 100% → [net]; two-scheme percentages.
- **`allocatePayments` (pure):** paidKobo 0 → all DUE (or OVERDUE if past); partial covering first installment + part of second → PAID, PARTIAL, DUE; full → all PAID; overdue derivation with `now`.
- **Schedule CRUD:** `Σbps=10000` enforced (reject 9000/11000); `@@unique([classLevelId,termId,order])`; empty clears; foreign level/term rejected (tenant).
- **generateInvoices:** with a schedule, installments materialized scaled to **discounted net** (assign an MF-1 discount → installments scale to net, sum == totalKobo, last absorbs rounding); regenerating an unpaid invoice replaces (not duplicates) installments; `Invoice.dueDate` = last installment date. No schedule → no installments, single-dueDate behavior intact.
- **Regression:** payments still increment `paidKobo`; `balanceKobo = totalKobo − paidKobo`; paid-invoice skip preserved; payments/finance/reconciliation specs green.
- **Tenant/IDOR:** a second school can't read/write another's schedule or see its installments.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Per-student custom installment plans (v1 is per level+term).
- Per-installment reminders / messaging (reminders stay invoice-level).
- Reusable named plan templates.
- Late fees / penalties on missed installments.
- Recomputing installments for an invoice that already has payments (kept: only unpaid invoices regenerate).
- Allocating a specific payment to a chosen installment (allocation is derived waterfall).
