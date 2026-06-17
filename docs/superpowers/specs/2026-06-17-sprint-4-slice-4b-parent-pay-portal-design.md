# Sprint 4 · Slice 4b — Parent Pay Portal (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 4b — the LAST Sprint-4 slice. Completes Fees & Payments.
- **Builds on:** slice 4a (parent identity link: `identityType=PARENT`, `identityId=Parent.id`, `fees.pay.own`, `GET /v1/parent/children`, `identityId` on JWT/`RequestUser`), slice 2 (`PaymentsService.initializeOnline`/`verifyPayment` + webhook + public `/receipt/[code]`), slice 3a (`computeInvoiceStatus`), `formatMoney`.

## Goal

A linked parent sees their children's invoices/balances and pays one-tap online (Paystack/mock),
reconciled by the existing webhook, with a public receipt. Completes Sprint 4.

## Scope (locked decisions)
1. **Fees/pay portal only** — defer parent results-view-own to a later slice.
2. **Role-aware nav + dedicated `/parent` portal** — a PARENT sees a minimal parent nav (Fees) not
   the staff items; a PARENT landing on `/dashboard` is redirected to `/parent`.
3. **New parent-scoped endpoints (`fees.pay.own`) with a child-ownership check** delegating to
   slice-2 `initializeOnline`/`verifyPayment`. The bursar endpoints stay `fees.manage`.

### Non-goals
- Parent viewing children's results/report cards (`results.view.own`) — later slice.
- Parent profile/self-edit; multi-school switching; saved cards/auto-pay; refunds; a separate
  parent shell/layout.

## Architecture

API: extend `ParentService`/`parent.controller` (slice 4a) with fees reads + a pay path that
ownership-checks then delegates to `PaymentsService` (inject it; `PaymentsModule` exports it — add
`PaymentsModule` to `ParentModule` imports). Web: role-aware nav in the `(app)` shell + a `/parent`
portal page + a `/dashboard` redirect for parents. No new model, no migration.

### API — parent fees endpoints (`fees.pay.own`, child-ownership enforced)
A shared private `childStudentIds(user)`: if `identityType !== "PARENT"` or no `identityId` → `[]`;
else `schoolId = schoolIdOrThrow()`, validate the `Parent` is this tenant's (`findFirst {id:
identityId, schoolId}`), then `Guardian.findMany({parentId})` → the student ids. Used by every
endpoint below for ownership.

- **`GET /v1/parent/invoices`** (`fees.pay.own`): `ids = childStudentIds(user)`; if empty → `[]`.
  Load `Invoice`s (tenant-scoped) where `studentId ∈ ids`, include student name + term
  (academicYear.name + number) → return `[{ studentId, studentName, invoiceId, termLabel,
  totalKobo, paidKobo, balanceKobo, status (computeInvoiceStatus(.., now)), dueDate }]`, ordered
  (outstanding/overdue first is nice; at least stable). Non-parent → `[]`.
- **`POST /v1/parent/pay`** `{ invoiceId, amountKobo, email }` (`fees.pay.own`): load the invoice
  (`findFirst {id: invoiceId, schoolId}`) → 404 if missing; `ids = childStudentIds(user)`; if
  `invoice.studentId ∉ ids` → **404** ("Invoice not found." — no ownership leak); `amountKobo > 0`;
  then `return this.payments.initializeOnline({ invoiceId, amountKobo, email }, user)` →
  `{ reference, authorizationUrl }`. (A PENDING `Payment` is created; nothing applied.)
- **`POST /v1/parent/pay/verify`** `{ reference }` (`fees.pay.own`): load `Payment` by `{reference,
  schoolId}` → 404; ownership-check its `invoice.studentId ∈ childStudentIds(user)` → else 404;
  then `return this.payments.verifyPayment(reference, user)` (idempotent apply). This is the
  mock/dev completion path; in prod the Paystack **webhook** auto-reconciles with no parent action.

(`initializeOnline`/`verifyPayment` already tenant-scope the invoice by the actor's `schoolId`; the
parent path adds the child-ownership gate on top so a parent cannot pay an arbitrary same-school
invoice.)

### Web — role-aware shell + `/parent` portal
- **`(app)/layout.tsx`** role-aware nav: read `session.user().identityType`; if `=== "PARENT"`,
  render a parent `NAV_ITEMS` = `[{ href: "/parent", label: "Fees", icon: Wallet }]` (+ Sign out);
  else the existing staff list. Active-state + mobile behavior unchanged.
- **`(app)/dashboard/page.tsx`**: if the loaded user is `PARENT`, `router.replace("/parent")`.
- **`(app)/parent/page.tsx`** (the portal): fetch `getParentInvoices()`. Group by child (name
  heading) → their invoices: term · balance (`formatMoney`) · status badge (OVERDUE error / PARTIAL
  warning / PAID success / UNPAID neutral). For an outstanding invoice, a **Pay** button → a small
  inline form (amount defaults to `balanceKobo`/100 in naira) → `parentPay(invoiceId, kobo, email)`
  where `email` = the parent's email from `session.user()` (or a prompt if absent) →
  `window.open(authorizationUrl, "_blank")`; show a **"I've paid — confirm"** button →
  `parentPayVerify(reference)` → on `applied`, a **View receipt** link to `/receipt/[code]` + reload
  invoices. Empty state: "No outstanding fees 🎉". Loading/error states. `formatMoney`.
- api client: `getParentInvoices`, `parentPay`, `parentPayVerify` (+ reuse the receipt code → link).

## Validation & errors
- Non-parent / unlinked caller → `[]` (invoices) or 403 from the permission guard (pay).
- Pay/verify a non-child or foreign invoice → **404** (uniform, no ownership disclosure); no Payment
  created on a rejected pay.
- `amountKobo ≤ 0` → 400 (also enforced by `initializeOnline`). Duplicate/again verify → idempotent
  (slice-2 apply guard).
- A parent with no children / no outstanding invoices → empty portal, no crash.

## Testing
- **API e2e** (`parent-pay.e2e-spec.ts`): seed a parent with 2 children (each an invoice) + a third
  unrelated student+invoice. `getInvoices` returns exactly the 2 children's invoices (status/balance
  correct), never the third. `pay` on a child invoice → PENDING `Payment` + `authorizationUrl`
  (mock); `pay` on the **non-child** invoice → throws (404) + **no Payment row created**;
  `payVerify` (mock success) → applies once, balance drops, receipt exists; **re-verify idempotent**;
  cross-tenant invoice → 404. The `childStudentIds` ownership gate is the security crux — assert a
  parent cannot pay an arbitrary same-school invoice.
- **Web:** light (optional).
- **Browser QA:** OTP-login as the seeded parent → redirected to `/parent` with the parent nav (NO
  staff items) → see child + outstanding invoice → Pay → (mock) confirm → balance drops + public
  receipt renders. Confirm a proprietor login still sees the full staff nav + `/fees`.

## Dependencies
- Slice 4a (parent link + `/parent/children` + `identityId`), slice 2 (`PaymentsService` +
  webhook + public receipt), slice 3a (`computeInvoiceStatus`), `fees.pay.own` (seeded + granted
  on link). `ParentModule` imports `PaymentsModule`. No new npm deps, no model, no migration.

## Out-of-scope future
- `results.view.own` parent results view; parent profile; multi-school switching; saved
  payment methods / scheduled pay.
