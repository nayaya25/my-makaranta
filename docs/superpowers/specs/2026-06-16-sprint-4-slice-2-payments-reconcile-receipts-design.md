# Sprint 4 · Slice 2 — Payments, Auto-Reconcile & Receipts (Design)

- **Date:** 2026-06-16
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 2 of ~4. Builds on slice 1 (`Invoice` with `paidKobo`).
- **Builds on:** slice-1 fees module + `Invoice`/`paidKobo`; the env-selected provider pattern (`core/email`, `core/storage`); the slice-5 non-tenant `Verification` + public-route pattern; tenancy + permission stack (`fees.view`/`fees.manage` seeded).

## Goal

Record offline payments and accept online (Paystack/mock) payments against invoices; online
payments auto-reconcile via a signed webhook; every successful payment yields a printable,
publicly-verifiable receipt. Bursar-side (parent self-serve initiation is slice 4).

## Scope (locked decisions)
1. **Both offline + online + webhook auto-reconcile + receipts** — the full bursar payments unit.
2. **Partial AND overpayment allowed** — any positive amount; `paidKobo` = sum of successful
   payments; balance = `totalKobo − paidKobo` (may go negative = credit). Never rejected on amount.
3. **Printable + publicly-verifiable receipt** — a non-tenant `Receipt` snapshot + a public
   `/receipt/[code]` page (reuses the slice-5 public-verification machinery).
4. **Provider abstraction** mirrors email/storage: `PAYMENT_SERVICE` token + `PaymentProvider`
   interface + `mock`/`paystack` adapters, env-selected (`PAYMENTS_PROVIDER`, default mock).
5. **Idempotent reconcile** — applying a payment is a guarded state transition; duplicate
   webhooks/verifies are no-ops.

### Non-goals
- Bank-CSV bulk reconciliation, overdue/reminders, finance reports (slice 3).
- Parent self-serve payment initiation + identity link (slice 4).
- Refunds, multi-currency settlement, split payments.

## Architecture

New `apps/api/src/core/payments/` provider module + a `payments` feature service/controller in
the `fees` module (or a sibling `payments` module — implementer's call; keep it cohesive with
fees). A public webhook + public receipt route extend the existing public surface. Web adds
bursar payment actions on the invoice detail + a public printable receipt page.

### Provider abstraction — `core/payments/`
`payments.types.ts`:
```ts
export const PAYMENT_SERVICE = Symbol("PAYMENT_SERVICE");
export interface InitializeArgs { reference: string; amountKobo: number; email: string; metadata?: Record<string, unknown>; }
export interface VerifyResult { status: "success" | "failed" | "pending"; amountKobo: number; }
export interface PaymentProvider {
  initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<VerifyResult>;
  verifySignature(rawBody: Buffer, signature: string): boolean;
}
```
- `mock.adapter.ts` (dev/test): `initialize` → `{ authorizationUrl: "/pay/mock/<reference>" }`;
  `verify` → `{ status: "success", amountKobo: <looked-up or echoed> }` for any reference
  (test-deterministic); `verifySignature` → `signature === (process.env.PAYMENTS_MOCK_WEBHOOK_TOKEN ?? "mock-signature")`.
- `paystack.adapter.ts`: `initialize` → `POST https://api.paystack.co/transaction/initialize`
  (Bearer `PAYSTACK_SECRET_KEY`, amount in kobo, email, reference, metadata) → returns
  `data.authorization_url`; `verify` → `GET /transaction/verify/:reference` → map `data.status`
  (`success`/`failed`/`abandoned`→pending) + `data.amount`; `verifySignature` → timing-safe
  compare of `crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex")`
  to `signature`.
- `@Global` `payments.module.ts`: `{ provide: PAYMENT_SERVICE, useFactory: () =>
  process.env.PAYMENTS_PROVIDER === "paystack" ? new PaystackPaymentAdapter() : new MockPaymentAdapter() }`.

### Data model
- **`Payment`** (tenant-scoped: TENANT_MODELS + RLS FORCE):
  `id, schoolId, invoiceId, amountKobo Int, method (enum PaymentMethod), reference String @unique,
  status (enum PaymentStatus), paidAt DateTime?, recordedBy String, createdAt @default(now())`;
  relation to `Invoice` + `School`; `@@index([schoolId, invoiceId])`.
  - `enum PaymentMethod { PAYSTACK CASH TRANSFER POS OTHER }`
  - `enum PaymentStatus { PENDING SUCCESS FAILED }`
- **`Receipt`** (NON-tenant, NOT in TENANT_MODELS, NO RLS — mirrors slice-5 `Verification`):
  `id, code String @unique, paymentId String @unique, payment Payment @relation(onDelete Cascade),
  schoolId, receiptNo String, studentName, schoolName, termLabel, amountKobo Int, method String,
  paidAt DateTime, balanceAfterKobo Int, createdAt @default(now())`. Holds only public-by-design
  receipt fields. Back-relation `receipt Receipt?` on `Payment`.
- Add `"Payment"` to `TENANT_MODELS` + an RLS FORCE migration for `Payment` only (NOT `Receipt`).

### Reconcile core (idempotent) — `payments.service.ts` (explicit `schoolId` scoping, IDOR)
A private `applyPayment(tx, payment, invoice)` is the only place `paidKobo` changes. Applying is
guarded by a conditional transition so it runs **at most once** per payment:
```
const claimed = await tx.payment.updateMany({ where: { id, schoolId, status: "PENDING" }, data: { status: "SUCCESS", paidAt: now } });
if (claimed.count === 0) return; // already applied (duplicate webhook/verify) → no-op
await tx.invoice.update({ where: { id: invoiceId, schoolId }, data: { paidKobo: { increment: amountKobo } } });
// recompute balanceAfter from the updated invoice; create the Receipt snapshot (+ receiptNo + code)
```
(Offline payments are created already-`SUCCESS` and applied in the same transaction — they skip
the PENDING guard by applying inside their own create transaction; idempotency there is the
unique `reference`.)

**Operations:**
- `recordOfflinePayment({ invoiceId, amountKobo, method, reference? }, actor)` (`fees.manage`):
  validate invoice tenant-scoped → 404; `amountKobo > 0` → 400; `method` ∈ {CASH,TRANSFER,POS,OTHER}.
  In one `$transaction`: create `Payment` (SUCCESS, `reference` = given or generated, `paidAt = now`),
  `Invoice.paidKobo += amountKobo`, create `Receipt`. Returns `{ paymentId, receiptCode }`.
- `initializeOnline({ invoiceId, amountKobo, email }, actor)` (`fees.manage`): validate invoice →
  404; create `Payment` PENDING (method PAYSTACK, fresh `reference`); `provider.initialize(...)` →
  return `{ reference, authorizationUrl }`. **Not applied.**
- `verifyPayment(reference, actor)` (`fees.manage`): tenant-scoped find Payment by reference →
  `provider.verify` → if `success`, apply (idempotent guard) → return the payment + receiptCode.
- `handleWebhook(rawBody, signature)` (called by the public controller; NO tenant context):
  `provider.verifySignature(rawBody, signature)` → false → throw Unauthorized. Parse event; on
  `charge.success`, find Payment by `reference` (global unique; no tenant needed) → apply inside a
  `$transaction` that sets `schoolId`-scoped writes using the payment's own `schoolId`. Idempotent.
- `getReceipt(code)` (public, no tenant): read `Receipt` by `code` → minimal snapshot or null.
- Reads (`fees.view`): `getPayments(invoiceId)` → the invoice's payments.

**receiptNo + code:** `receiptNo` = a human-friendly sequential-ish/random string (e.g.
`RCT-<base32>`); `code` = an unguessable 16-char token (reuse the slice-5
`generateVerificationCode` util — extract/share it, or duplicate the tiny helper into a
`payments`/shared util). Collisions retried via the unique constraint.

### Webhook raw body
Enable raw body so the HMAC is computed over exact bytes: `NestFactory.create(AppModule, { rawBody: true })` (NestJS ≥ 9 exposes `req.rawBody`), OR a route-scoped `express.raw({ type: "*/*" })` on the webhook path. The webhook controller reads `req.rawBody` + the `x-paystack-signature` header. Confirm `main.ts` bootstrap supports it; add `rawBody: true` if missing (verify it doesn't break existing JSON parsing — it doesn't; `rawBody` is additive).

### Public surface (no JWT, no tenant)
- `POST /v1/public/payments/webhook` → `handleWebhook(req.rawBody, header)`. **401 on bad
  signature.** Reads `Receipt`/`Payment` only via the service (which scopes by the payment's own
  schoolId for the apply). `Payment` IS RLS-protected — the webhook apply runs in a transaction;
  since the app connects as superuser in dev (RLS inert) and the prod GUC wiring is a separate
  concern, the webhook applies by the payment's `schoolId` explicitly. (Same RLS-on-public note
  as slice 5: the public READ path uses the non-RLS `Receipt`; the webhook WRITE path touches
  `Payment`/`Invoice` scoped by the resolved `schoolId`.)
- `GET /v1/public/receipt/:code` → `getReceipt(code)` (reads non-RLS `Receipt` only).

### Web
- **Invoice detail (on `/fees`):** **Record payment** (method select + amount in naira →
  `recordOfflinePayment`) and **Pay online** (`initializeOnline` → open `authorizationUrl`; in
  mock, the stub URL leads to a dev success → call `verifyPayment`). After success, balance
  refreshes + a **View receipt** link to `/receipt/[code]`.
- **`/receipt/[code]`** (public, OUTSIDE `(app)`): printable receipt (receiptNo, school, student,
  term, amount, method, paidAt, balance-after) + Print/Save-as-PDF; on-brand, standalone.
- api client: `recordOfflinePayment`, `initializeOnline`, `verifyPayment`, `getPayments`,
  public `getReceipt`. Reuse `formatMoney`.

## Validation & errors
- Foreign invoice (record/init/verify) → 404 (explicit `schoolId`). `amountKobo <= 0` → 400.
- Bad webhook signature → 401. Unknown reference (webhook/verify) → ignore/no-op (webhook returns
  200 after signature passes even if reference unknown, to avoid Paystack retries; verify → 404).
- Duplicate webhook/verify for an applied payment → no-op (the PENDING→SUCCESS guard).
- Unknown receipt code (public) → `{ found: false }` / 404-clean page.

## Testing
- **Unit:** mock adapter behavior; HMAC `verifySignature` valid vs tampered (paystack adapter with
  a known secret + body).
- **API e2e** (`payments.e2e-spec.ts`, service-level; reuse slice-1 fees fixtures or build a
  released-fees fixture): record offline → Payment SUCCESS + `paidKobo` += amount + Receipt + correct
  balanceAfter; **partial** reduces balance; **overpay** → negative balance; `initializeOnline` →
  PENDING + not applied; `verifyPayment` success → applies; **idempotent** (verify twice → balance
  changes once); `handleWebhook` valid signature `charge.success` → applies; **bad signature** →
  throws; **cross-tenant** (B records/verifies against A's invoice) → 404; public `getReceipt`(code)
  → snapshot, unknown → null/false.
- **Browser QA:** on `/fees` invoice detail, record a cash payment → balance drops → receipt page
  renders + public `/receipt/[code]` shows it; mock online pay → verify → reconciled + receipt.

## Dependencies
- Slice 1 (`Invoice`/`paidKobo`), provider pattern, slice-5 public-route + code-gen util, tenancy +
  `fees.*` perms. New env: `PAYMENTS_PROVIDER` (default `mock`), `PAYSTACK_SECRET_KEY` (paystack
  only), optional `PAYMENTS_MOCK_WEBHOOK_TOKEN`. No new npm deps (crypto built-in; `fetch` native).

## Out-of-scope future
- Slice 3 (CSV reconciliation, overdue, reminders, reports); slice 4 (parent self-serve pay).
- Refunds, partial-refund receipts, settlement reporting.
