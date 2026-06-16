# Sprint 4 · Slice 3b — Bank-CSV Reconciliation (Design)

- **Date:** 2026-06-16
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 3b. Builds on slices 1–2 (Invoice/balance, `PaymentsService.recordOfflinePayment`).
- **Builds on:** `Invoice`/`paidKobo` (s1), slice-2 `recordOfflinePayment` (channel `BANK_TRANSFER`, dup-`reference`→409), client-side CSV parse (papaparse, as in student import), `Student.admissionNo`/names.

## Goal

A bursar uploads a bank-statement CSV of deposits; the system proposes ranked outstanding-invoice
matches per row (fuzzy name + amount); the bursar reviews/overrides and confirms; confirmed rows
record `BANK_TRANSFER` payments. Stateless — no new model; the Payment ledger is the audit.

## Scope (locked decisions)
1. **Synchronous match-preview → confirm** (no BullMQ). Web parses CSV client-side, POSTs rows,
   gets proposals, bursar confirms a subset.
2. **Stateless** — no `ReconciliationBatch` model; recorded `Payment`s (+ `Receipt`s) are the record.
3. **Fuzzy name (primary) + amount (secondary), ranked proposals, bursar always confirms** —
   nothing auto-records. A pure, unit-tested matcher.
4. **Confirm reuses slice-2 `recordOfflinePayment`** (`BANK_TRANSFER`); duplicate `reference` →
   409 caught per-row → `skipped` (re-confirming the same statement is safe/idempotent).

### Non-goals
- Persisted/resumable reconciliation batches; a column-mapping UI beyond header auto-detect;
  any auto-recording; multi-currency; 3c finance reports; CSV of non-credit/debit rows.

## Architecture

A `reconciliation.service` (in the fees module) + controller; a pure `reconcile.util` matcher.
No new model, no migration. The web adds an upload+review flow on `/fees`. The service injects
slice-2 `PaymentsService` (exported by `PaymentsModule`).

### Pure matcher — `apps/api/src/modules/fees/reconcile.util.ts`
```ts
export interface MatchCandidate { invoiceId: string; studentName: string; admissionNo: string; balanceKobo: number; }
export type Confidence = "high" | "low" | "none";
export interface ScoredCandidate extends MatchCandidate { score: number; confidence: Confidence; }

normalizeTokens(s: string): string[]   // lowercase, strip non-alphanumerics, split, drop empties
scoreCandidate(narration: string, amountKobo: number, c: MatchCandidate): { score: number; confidence: Confidence }
matchRow(row: { narration: string; amountKobo: number }, candidates: MatchCandidate[]): { candidates: ScoredCandidate[]; suggestedInvoiceId: string | null }
```
- **Name signal (primary):** overlap of narration tokens with the student's name tokens; a
  substring hit of `admissionNo` in the narration is a strong boost.
- **Amount signal (secondary):** `amountKobo === balanceKobo` → boost; within a band (e.g. any
  positive ≤ balance, i.e. a plausible partial) → mild; else neutral. Amount alone never makes a
  match (avoids the "everyone owes the same fee" ambiguity).
- **Confidence:** `high` = clear name hit (admissionNo or ≥2 name tokens) — optionally amount
  close; `low` = a single weak token or amount-only proximity with a faint name hit; `none` = no
  name overlap at all. `matchRow` ranks candidates by score desc; `suggestedInvoiceId` = the top
  candidate iff its confidence ≥ `low`, else `null`. Pure, deterministic, no I/O.

### Service — `reconciliation.service.ts` (`fees.manage`, explicit `schoolId` scoping, IDOR)
- `proposeMatches(termId, rows: { reference: string; amountKobo: number; narration: string; date?: string }[])`:
  tenant-validate term → 404. Load the term's invoices with `paidKobo < totalKobo` (outstanding),
  including student `firstName`/`lastName`/`admissionNo`; build `MatchCandidate[]` (balanceKobo =
  total − paid). For each row → `matchRow` → return
  `[{ row, candidates: ScoredCandidate[] (top N, e.g. 5), suggestedInvoiceId }]`. **Read-only.**
- `confirmMatches(confirmations: { reference: string; amountKobo: number; invoiceId: string }[], actor)`:
  for each, `try { await this.payments.recordOfflinePayment({ invoiceId, amountKobo, channel:
  "BANK_TRANSFER", reference }, actor); recorded++ } catch (e) { if ConflictException → skipped++
  else errors.push({ reference, message }) }`. Returns `{ recorded, skipped, errors }`.
  `recordOfflinePayment` already does the tenant-scoped invoice validation + apply + receipt +
  dup-reference 409, so cross-tenant/foreign invoices are rejected there.

No persistence. The matcher + propose are read-only; only confirm mutates (via the proven
slice-2 path).

### Web — reconcile flow (a `/fees` section or `/fees/reconcile`)
- **Upload CSV** → parse with papaparse (as student import) → **auto-detect headers**
  (amount|credit|deposit, narration|description|details|particulars, reference|ref|teller, date),
  convert the amount (naira string → kobo `Math.round(x*100)`), drop non-credit/zero rows →
  POST normalized rows to `proposeMatches(termId, rows)`.
- **Review table:** per row — narration, amount (`formatMoney`), reference, a **suggested
  student** with a confidence chip (high/low/none), a **dropdown** to pick another candidate or
  **Skip**, and an editable amount (defaults to the row amount). Pre-select `suggestedInvoiceId`.
- **Confirm** → POST the selected (non-skipped) rows to `confirmMatches` → show
  `{ recorded, skipped, errors }`; reload `/fees` balances. Empty/loading/error states; a no-match
  row stays skippable (no false confirm).
- Term selector reuses the page's. api client: `proposeMatches`, `confirmMatches`.

## Validation & errors
- Foreign term → 404; foreign/!owned invoice on confirm → 404 (via `recordOfflinePayment`).
- Duplicate `reference` (already reconciled) → counted `skipped`, not an error (idempotent re-run).
- Zero/negative amount row → filtered client-side; server `recordOfflinePayment` also rejects ≤ 0.
- A row with no confident match → `suggestedInvoiceId: null`; the bursar must pick or skip.

## Testing
- **Unit (matcher, jest):** narration containing a student's full name → that candidate top,
  `high`; admissionNo substring → `high`; single-token weak overlap → `low`; no name overlap →
  `none` + `suggestedInvoiceId` null; exact-amount boost orders ties; empty candidates → no
  suggestion.
- **API e2e:** seed a term with 2 outstanding invoices (students "Ada Eze", "Bola Ade");
  `proposeMatches` with rows narrating each name → correct top suggestions + confidence; a
  gibberish narration → no suggestion; `confirmMatches` records BANK_TRANSFER payments + balances
  drop + receipts created; **duplicate reference across two confirm calls → second is `skipped`**;
  cross-tenant term/invoice → rejected (404 surfaced as an `errors` entry or thrown — assert the
  cross-tenant invoice is NOT applied); explicit scoping.
- **Browser QA:** upload a 2–3 row CSV naming seeded students → review (suggestions + confidence)
  → confirm → balances drop + receipts exist; re-upload the same file → all rows `skipped`.

## Dependencies
- Slices 1–2 (`Invoice`, `recordOfflinePayment`), papaparse (already a web dep), `fees.manage`.
  No new npm deps; no migration; no new model.

## Out-of-scope future
- 3c finance reports/dashboard; persisted reconciliation batches; debit/charge handling;
  column-mapping UI; auto-matching thresholds/auto-apply.
