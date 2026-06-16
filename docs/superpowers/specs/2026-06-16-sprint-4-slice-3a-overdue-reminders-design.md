# Sprint 4 · Slice 3a — Overdue & Reminders (Design)

- **Date:** 2026-06-16
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 3a (the collections core of slice 3). Builds on slices 1–2.
- **Builds on:** `Invoice`/`paidKobo` (s1), `Payment` (s2), `Guardian`→`Parent` (SIS), `SmsService` + `EMAIL_SERVICE` providers, `InvoiceStatus` enum (`UNPAID|PARTIAL|PAID|OVERDUE`, pre-existing), `formatMoney` (web).

## Goal

Give the bursar a collections list — who owes what, overdue first — driven by per-invoice due
dates + derived status, and let them remind a student's guardians (SMS + email), single or
bulk, with an audit log.

## Sprint 4 slice 3 decomposition (context)
- **3a — overdue & reminders (THIS).** dueDate + status + collections list + reminders.
- **3b — bank-CSV reconciliation** (upload → fuzzy match → confirm → record payments).
- **3c — finance reports/dashboard** (collected/outstanding/overdue/by-class; consumes 3a status).

## Scope (locked decisions, 3a)
1. **Per-invoice `dueDate`**, bulk-set per term (and stampable at generation). Nullable → no
   due date means never OVERDUE.
2. **Status derived on read** (no stored column, no cron): `computeInvoiceStatus`.
3. **Reminders → SMS to all the student's guardians' parent phones + email to any with an
   email**, via the existing providers (mock in dev). Single + bulk.
4. **Log each reminder** (`FeeReminder`) for audit + a "last reminded" indicator.

### Non-goals
- Bank-CSV reconciliation (3b); finance reports (3c).
- Scheduled/automated reminders (manual trigger only this slice).
- Parent-facing views; reminder templates/i18n beyond a single message.

## Architecture

Extends the `fees` module (a `collections.service` + controller, or methods on the existing
fees service — implementer's call; keep `fees.service` from growing unwieldy by adding a
`collections.service`). One pure status helper. `FeeReminder` model + `Invoice.dueDate`.
Reminders fan out via `SmsService` (injectable, exported by AuthModule) + `EMAIL_SERVICE`
(`@Global`). Web extends `/fees`.

### Data model (migrations)
- `Invoice.dueDate DateTime?` — added to the existing model. `@@index` not required.
- **`FeeReminder`** (tenant-scoped: TENANT_MODELS + RLS FORCE):
  `id, schoolId, invoiceId, invoice Invoice @relation, sentBy String, sentAt DateTime
  @default(now()), recipientCount Int, channels String`; `@@index([schoolId, invoiceId])`.
  Back-relation `reminders FeeReminder[]` on `Invoice` + `payments`/etc. already there.
  Add `"FeeReminder"` to TENANT_MODELS; RLS FORCE migration (mirror `rls_fees`).

### Pure helper — `invoice-status.util.ts`
```
computeInvoiceStatus(args: { totalKobo: number; paidKobo: number; dueDate: Date | null; now: Date }): InvoiceStatus
  paidKobo >= totalKobo            → PAID
  else dueDate && dueDate < now    → OVERDUE   (balance > 0 implied since not PAID)
  else paidKobo > 0                → PARTIAL
  else                             → UNPAID
```
Returns the `InvoiceStatus` enum value (import from `@prisma/client`). Pure, unit-tested.

### Service — `collections.service.ts` (explicit `schoolId` scoping, IDOR)
- `setDueDate(termId, dueDate)` (`fees.manage`): tenant-validate term → 404; `updateMany({
  where: { schoolId, termId }, data: { dueDate } })`. Returns `{ updated }`. (`generateInvoices`
  in `fees.service` gains an optional `dueDate` param to stamp newly-created invoices; existing
  behavior unchanged when omitted.)
- `getCollections(termId)` (`fees.view`): the term's invoices (tenant-scoped) incl. student
  name + the latest `FeeReminder.sentAt`. Map each to `{ studentId, name, totalKobo, paidKobo,
  balanceKobo, dueDate, status: computeInvoiceStatus(...), lastRemindedAt }`. **Sort: OVERDUE
  first, then by balanceKobo desc.**
- `sendReminder(invoiceId, actor)` (`fees.manage`): tenant-validate invoice (incl. student +
  term) → 404; if `balanceKobo <= 0` → 400 ("Nothing outstanding."); resolve the student's
  `Guardian`s → `Parent`s; build the message (student name, term label, balance via a
  kobo→display format); for each parent: `SmsService.send(parent.phone, msg)`; for each parent
  with `email`: `EMAIL_SERVICE.send({ to, subject, html, text })`. Provider failures are
  caught per-recipient (one bad number doesn't abort the batch). Create a `FeeReminder`
  (`recipientCount` = parents reached, `channels` = e.g. `"sms"`/`"sms,email"`, `sentBy =
  actor.id`). Returns `{ recipientCount }`. Zero guardians → count 0, still logged.
- `sendBulkReminders(termId, actor)` (`fees.manage`): for each of the term's invoices with
  `balanceKobo > 0`, call `sendReminder`. Returns `{ remindersSent, totalRecipients }`.

**Money in the message:** format kobo→major at send (a small server-side `formatNaira(kobo)`
or reuse the school currency symbol; keep it simple — `₦` + thousands, since reminders are
NGN-context). The amount stored/sent is derived from `balanceKobo`.

### Web — `/fees` collections
The `/fees` page gains: a **Set due date** control (date input → `setDueDate(termId, date)`,
confirm), **status badges** per row (UNPAID grey / PARTIAL / PAID success / **OVERDUE error**),
a **Due date** column, a **Last reminded** column, a per-row **Remind** button (→
`sendReminder`, toast the recipient count), and a **Remind all overdue** button (→
`sendBulkReminders`). Rows sorted OVERDUE-first. api client: `setDueDate`, `getCollections`,
`sendReminder`, `sendBulkReminders`. Amounts via `formatMoney`.

## Validation & errors
- Foreign term/invoice → 404 (explicit `schoolId`). Reminder on a settled invoice (balance ≤ 0)
  → 400. No `dueDate` → status never OVERDUE. Student with no guardians → reminder logged with
  `recipientCount: 0` (no crash). A failing SMS/email send is caught per-recipient (logged,
  not fatal) so a bulk run completes.

## Testing
- **Unit (api jest):** `computeInvoiceStatus` — PAID (paid==total, paid>total), OVERDUE
  (balance>0 + past dueDate), PARTIAL (0<paid<total, not past due / no due date), UNPAID
  (paid 0, not past due), no-dueDate-never-overdue, dueDate exactly == now (not overdue).
- **API e2e** (extend the fees e2e or a new `collections.e2e-spec.ts`): `setDueDate` stamps the
  term's invoices; `getCollections` returns correct statuses incl. OVERDUE for a past due date +
  outstanding balance, sorted overdue-first; `sendReminder` fans out to a student's guardians'
  parents (seed 2 guardians, one with email → recipientCount 2, channels includes both), writes
  a `FeeReminder`, `lastRemindedAt` reflected on the next `getCollections`; reminder on a
  fully-paid invoice → 400; `sendBulkReminders` reminds all outstanding; **cross-tenant**
  (school B → A's term/invoice) → 404; explicit scoping.
- **Browser QA:** set a past due date on the term → OVERDUE badges → Remind a student (mock SMS
  logged in api log + Last-reminded updates) → Remind all overdue.

## Dependencies
- Slices 1–2 (`Invoice`/`paidKobo`), `Guardian`→`Parent` (SIS), `SmsService` (AuthModule export)
  + `EMAIL_SERVICE` (`@Global`), `InvoiceStatus` enum, `fees.*` perms. No new npm deps.

## Out-of-scope future
- 3b bank-CSV reconciliation; 3c finance reports.
- Scheduled reminders (a future cron/worker); reminder rate-limiting/quiet-hours; SMS cost
  accounting.
