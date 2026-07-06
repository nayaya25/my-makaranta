# Money/Fees MF-3 — Parent Fee Portal — Design Spec

> **Status:** Approved (2026-07-06) · **Workstream 3 (Money/Fees), sub-project 3** (Discounts ✓ → Installments ✓ → Parent portal; MF-4/5/6 later).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Give parents a self-serve fee experience: see each child's invoice detail (line items, discounts, installment schedule, payment history), pay online with installment-aware presets, view receipts, and download a per-child statement — reusing everything already built (discounts, installments, Paystack, receipts) with **no new data model**.

## Context (existing code this builds on)

- Parent module `v1/parent` (perm `fees.pay.own`): `getChildren`, `getInvoices` (summary list w/ `computeInvoiceStatus`), `pay` (→ `payments.initializeOnline`, ownership-checked), `payVerify` (→ `payments.verifyPayment`, ownership-checked). Ownership = the invoice's `studentId` is in the parent's guardian-linked children (`childStudentIds`).
- `FeesService.getInvoice` (staff, `fees.view`) already composes lines + MF-1 discount breakdown + MF-2 installments (`allocatePayments`) + gross/discount/net/balance. `allocatePayments(paidKobo, installments, now)` (MF-2) derives per-installment `{paidKobo, status}`; `splitInstallments` is generation-only.
- Payments increment `Invoice.paidKobo`; `Receipt {code, receiptNo, studentName, schoolName, termLabel, amountKobo, channel, paidAt, balanceAfterKobo}` written per successful payment; public page `/receipt/:code` (`GET /v1/public/receipt/:code`) already renders a receipt by code.
- Report card renders server-side PDFs with `@react-pdf/renderer@3` (v4 is ESM-incompatible with ts-jest — do NOT upgrade); the same pattern is reused for the statement.
- Web parent portal exists minimally: `apps/web/src/app/(app)/parent/page.tsx` (dashboard) + `parent/announcements`; `api.getParentInvoices()`, `api.getParentAnnouncements()`. Amounts are integer **kobo**. Build invariant: no `apps/api/src` import from top-level `prisma/`; prod build emits `dist/main.js`.

## Decisions (locked)

1. **Pay UX:** presets — **"Next installment (₦X)"** + **"Full balance (₦Y)"** — plus a custom amount. Payment stays a free amount that increments `paidKobo`; allocation to installments remains derived (waterfall). Presets are computed client-side from the invoice detail; **no new payment coupling**.
2. **Statement:** a server-rendered **PDF** per child (`@react-pdf/renderer@3`), consistent with the report-card PDF.
3. **Receipts:** a **list** of the parent's payments, each linking to the **existing** public `/receipt/:code` page. No per-payment PDF.
4. **No new data model.** Pure read/compose + PDF + web.

## API (extend the `parent` module — all `@RequirePermissions("fees.pay.own")`, ownership-scoped)

Ownership everywhere via `childStudentIds(user)` (the parent's guardian-linked children in this school); any invoice/student not owned → `NotFoundException`.

- **`GET /v1/parent/invoices`** — extend each row with an **installment-aware `status`**, `nextDueDate` (earliest unpaid installment's due date, else invoice `dueDate`), `nextInstallmentKobo` (outstanding on the earliest not-fully-paid installment, else `balanceKobo`), plus existing `totalKobo`/`paidKobo`/`balanceKobo`. Status: `PAID` if paid ≥ total; else `OVERDUE` if any installment overdue (or, no schedule, invoice `dueDate` past); else `PARTIAL`/`UNPAID`.
- **`GET /v1/parent/invoices/:invoiceId`** *(new)* — ownership-checked composed detail: `{ student, termLabel, lines:[{name,amountKobo}], discounts:[{name,amountKobo}], grossKobo, discountKobo, totalKobo, paidKobo, balanceKobo, installments:[{order,label,amountKobo,dueDate,paidKobo,status}], payments:[{paidAt,amountKobo,channel,reference,receiptCode}], status }`. Composed from the invoice + `allocatePayments` + payments (with their receipt code). Reuses the same composition as `FeesService.getInvoice` but scoped to the parent's child.
- **`POST /v1/parent/pay`** — unchanged (`{invoiceId, amountKobo, email}` → Paystack init; ownership-checked). **`POST /v1/parent/pay/verify`** — unchanged.
- **`GET /v1/parent/receipts`** *(new)* — the parent's `SUCCESS` payments across their children, newest first: `[{paidAt, amountKobo, childName, termLabel, receiptCode}]`. `receiptCode` links to `/receipt/:code`.
- **`GET /v1/parent/children/:studentId/statement.pdf`** *(new)* — ownership-checked; streams a PDF (`application/pdf`) for that child: school header + name/admissionNo, then per-term invoice blocks (lines, discount breakdown, installment schedule with due/paid/status, payment history, and per-invoice + overall balances). Rendered by a new `statement-pdf.tsx` (`@react-pdf/renderer@3`). Foreign child → `NotFound`.

## Web (parent portal, `apps/web/src/app/(app)/parent`)

- **Fees area** (new route/section, e.g. `parent/fees`): child selector → invoice list (term · total · paid · balance · status badge; overdue highlighted).
- **Invoice detail** (drawer/page): line items, discount breakdown, installment schedule (amount · due · paid · status, overdue highlighted), payment history, and a **Pay** button.
- **Pay dialog:** preset buttons **"Next installment (₦X)"** (from `nextInstallmentKobo`) and **"Full balance (₦Y)"** (from `balanceKobo`) + a custom amount → `api.parentPay` → redirect to Paystack `authorizationUrl`; on return, `api.parentPayVerify(reference)` then refresh.
- **Receipts** list (link each to `/receipt/:code`) + **Download statement** button per child (opens the statement PDF).
- `@mymakaranta/ui`, teal/lime, consistent with the existing parent dashboard/announcements; loading/empty states; naira formatting consistent with staff fee screens.

## Testing

- **`getInvoiceDetail`:** own child's invoice → full detail (lines/discounts/installments/payments + correct gross/discount/net/paid/balance); a foreign child's invoice id → `NotFound`.
- **Invoice list:** installment-aware `status` + `nextInstallmentKobo` (with a schedule: equals the first unpaid installment's outstanding; no schedule: equals `balanceKobo`).
- **Receipts:** returns only the parent's children's `SUCCESS` payments with receipt codes; excludes other families and non-success payments.
- **Statement PDF:** renders (`%PDF`, non-empty) for an own child across multiple terms; foreign child → `NotFound`.
- **Regression:** `pay`/`payVerify` ownership still enforced; payments still increment `paidKobo`; `balanceKobo = totalKobo − paidKobo`.
- **Tenant / cross-parent IDOR:** a parent in one school/family cannot read another's invoice detail, receipts, or statement.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Saved cards / autopay / scheduled auto-debit.
- Flutterwave gateway (→ MF-6).
- Refunds / reversals from the portal.
- Emailing the statement (download only).
- Per-payment PDF receipts (list links to the existing public page).
- Student-portal fee view (parent portal only).
