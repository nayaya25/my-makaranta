# Money/Fees MF-1 — Discounts & Scholarships — Design Spec

> **Status:** Approved (2026-07-05) · **Workstream 3 (Money/Fees), sub-project 1** (Discounts → Installments → Parent portal; MF-4/5/6 later).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let schools define reusable discount/scholarship schemes (sibling, staff ward, bursary, merit) and assign students to them, so invoice generation automatically reduces each student's payable amount — with a transparent per-invoice breakdown — while leaving payments, finance summary, and reconciliation logic untouched.

## Context (existing code this builds on)

- `FeeItem {schoolId, classLevelId, termId, name, amountKobo, order}` `@@unique([classLevelId, termId, name])`.
- `Invoice {schoolId, studentId, termId, classLevelId, totalKobo, paidKobo, dueDate, issuedAt, lines[], payments[], reminders[]}` `@@unique([studentId, termId])`; `InvoiceLine {schoolId, invoiceId, name, amountKobo}`.
- `FeesService.generateInvoices(termId, dueDate?)` — for each enrollment in the term, sums that level's `FeeItem`s into lines + `totalKobo`, upserts the invoice, replaces lines. **Skips** students whose existing invoice has `paidKobo > 0` (won't recompute a paid invoice); refreshes unpaid ones.
- `getInvoices`/`getInvoice` compute `balanceKobo = totalKobo − paidKobo`. Payments (`payments.service`), finance summary (`finance.service`), and reconciliation all treat `totalKobo` as the amount owed and `paidKobo` as received.
- Permission RBAC: `fees.view` (reads) and `fees.manage` (writes) already exist. New tenant tables follow the assessment precedent (middleware + explicit scoping, **no per-table RLS**). Build invariant: no `apps/api/src` import from top-level `prisma/`; prod build emits `dist/main.js`. Amounts are integer **kobo** throughout.

## Decisions (locked)

1. **Model:** reusable **`DiscountScheme`** definitions + **`StudentDiscount`** assignments (not per-student ad-hoc or per-invoice adjustments).
2. **Scope:** a scheme reduces the **whole invoice total** (not per-fee-item targeting).
3. **Method:** each scheme is **PERCENT** (1–100) **or FIXED** (kobo).
4. **Stacking:** a student may hold **multiple** schemes; they combine additively — **all PERCENT first, then FIXED** — clamped so the invoice never drops below ₦0.
5. **Cadence:** assignments are **standing** (apply to every term's generation until revoked); revoke = delete the assignment.

## Data model (additive)

```prisma
enum DiscountMethod { PERCENT FIXED }

model DiscountScheme {
  id          String            @id @default(cuid())
  schoolId    String
  school      School            @relation(fields: [schoolId], references: [id])
  name        String
  method      DiscountMethod
  value       Int                                   // PERCENT: 1–100 ; FIXED: kobo (>0)
  active      Boolean           @default(true)
  assignments StudentDiscount[]
  invoiceDiscounts InvoiceDiscount[]
  createdAt   DateTime          @default(now())

  @@unique([schoolId, name])
}

model StudentDiscount {
  id               String         @id @default(cuid())
  schoolId         String
  school           School         @relation(fields: [schoolId], references: [id])
  studentId        String
  student          Student        @relation(fields: [studentId], references: [id])
  discountSchemeId String
  discountScheme   DiscountScheme @relation(fields: [discountSchemeId], references: [id], onDelete: Cascade)
  createdAt        DateTime       @default(now())

  @@unique([studentId, discountSchemeId])
  @@index([schoolId, studentId])
}

model InvoiceDiscount {
  id         String          @id @default(cuid())
  schoolId   String
  school     School          @relation(fields: [schoolId], references: [id])
  invoiceId  String
  invoice    Invoice         @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  schemeId   String?                                // nullable → deleting a scheme keeps history
  scheme     DiscountScheme? @relation(fields: [schemeId], references: [id], onDelete: SetNull)
  name       String                                 // snapshot of the scheme name at apply time
  amountKobo Int

  @@index([schoolId, invoiceId])
}

// Invoice gains two fields; totalKobo becomes NET payable.
model Invoice {
  grossKobo    Int @default(0)   // Σ fee-item lines (pre-discount)
  discountKobo Int @default(0)   // total discount applied
  invoiceDiscounts InvoiceDiscount[]
  // totalKobo = grossKobo − discountKobo (net) ; balanceKobo = totalKobo − paidKobo (unchanged)
}
```

- Back-relations: `School { discountSchemes, studentDiscounts, invoiceDiscounts }`, `Student { discounts StudentDiscount[] }`, `Invoice { invoiceDiscounts InvoiceDiscount[] }`.
- Add `"DiscountScheme"`, `"StudentDiscount"`, `"InvoiceDiscount"` to `TENANT_MODELS`. Migration name: `discounts`. `grossKobo`/`discountKobo` default 0 (existing invoices read as gross=0/discount=0 until next regeneration — display falls back to `totalKobo`).
- **`totalKobo` semantics change to NET payable.** This is deliberate and keeps every downstream consumer (payments applying to `paidKobo` vs `totalKobo`, finance summary, reconciliation, `balanceKobo`) correct with no change.

## Computation (extend `generateInvoices`)

For each non-skipped enrollment:
1. `gross = Σ line.amountKobo`.
2. Load the student's assignments whose scheme `active = true`, split into `percents[]` and `fixeds[]`.
3. Apply in order — **percents first, then fixeds** — each scheme contributing `applied = min(remainingGross, nominal)` where `nominal = floor(gross × pct / 100)` for PERCENT or `value` for FIXED; subtract `applied` from `remainingGross`; record `{schemeId, name, amountKobo: applied}` when `applied > 0`.
4. `discountKobo = Σ applied` (≤ gross by construction); `net = gross − discountKobo`.
5. Upsert invoice with `grossKobo = gross`, `discountKobo`, `totalKobo = net`; replace `InvoiceLine`s (unchanged) and replace `InvoiceDiscount`s with the recorded rows.

The existing paid-invoice skip (`paidKobo > 0`) is preserved — a student who has paid is never silently recomputed. To apply a newly assigned scheme to an existing **unpaid** invoice, staff re-run generation for the term (the established refresh path). Rounding: PERCENT uses `floor`; per-scheme amounts sum exactly to `discountKobo`.

## API (extend the `fees` module)

Writes require `fees.manage`, reads `fees.view`. All tenant-scoped by `schoolId`; request-supplied ids validated before use.

- **Schemes:** `GET /v1/fees/discount-schemes`, `POST /v1/fees/discount-schemes {name, method, value, active?}` (validate PERCENT 1–100, FIXED >0), `PATCH /v1/fees/discount-schemes/:id`, `DELETE /v1/fees/discount-schemes/:id` (blocked with a clear message if it has assignments — prefer `active=false` to retire).
- **Assignments:** `GET /v1/fees/students/:studentId/discounts` (student's schemes), `POST /v1/fees/students/:studentId/discounts {schemeId}` (validate both belong to the school; `@@unique` prevents dupes), `DELETE /v1/fees/student-discounts/:id`, `GET /v1/fees/discount-schemes/:id/students` (roster).
- **Invoice reads:** `getInvoice`/`getInvoices` return `grossKobo`, `discountKobo`, `totalKobo` (net), `balanceKobo`, and `discounts: [{name, amountKobo}]` breakdown.

## Web

- **Fees settings → Discount schemes:** an editor listing schemes (name, method toggle %/fixed, value, active switch) with add/edit/retire; validates value ranges client-side.
- **Student discounts:** on the student's fee view (or a dedicated panel), assign/revoke schemes for a student; a scheme detail shows its student roster.
- **Invoice / receipt / statement:** show gross → discount breakdown → **net payable** → paid → balance. `@mymakaranta/ui`, teal/lime, consistent with existing fee screens.

## Testing

- **Scheme CRUD:** create/list/update/retire; `@@unique([schoolId, name])`; PERCENT/FIXED value validation; delete blocked when assigned.
- **Assignment:** assign/revoke; `@@unique([studentId, discountSchemeId])`; foreign student/scheme rejected (tenant).
- **Computation:** single PERCENT; single FIXED; stacked (percent+percent+fixed) applied in the right order with exact per-scheme split; discount clamped to gross (never negative net); inactive schemes ignored; `InvoiceDiscount` rows sum to `discountKobo`.
- **Regression:** `balanceKobo = totalKobo − paidKobo` still holds; paid-invoice skip preserved (a paid invoice keeps its total when regenerated); payments/finance-summary/reconciliation specs stay green; scheme delete leaves `InvoiceDiscount` snapshots with `schemeId = null`.
- **Tenant/IDOR:** a second school can't read/assign/apply another school's schemes or student assignments.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Per-fee-item targeting (e.g. 50% off tuition only).
- Per-term overrides or assignment start/end dates.
- Discount approval workflow / reasons / attachments.
- Discount analytics (total waived, by scheme).
- Applying a discount directly to a partially-paid invoice (kept: regenerate refreshes only unpaid invoices).
