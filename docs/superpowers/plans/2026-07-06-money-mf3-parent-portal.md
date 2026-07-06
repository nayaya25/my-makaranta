# Money/Fees MF-3 — Parent Fee Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent self-serve fee portal — invoice detail (lines + discounts + installments + payments), installment-aware pay presets, receipts list, and a downloadable per-child statement PDF — reusing existing data with no schema change.

**Architecture:** Extend the `parent` NestJS module (perm `fees.pay.own`, ownership-scoped) with an invoice-detail read, a receipts list, and a statement PDF (`@react-pdf/renderer@3`, report-card pattern). Extend the parent invoice list with installment-aware status. Build the web parent fee area (list → detail → pay dialog → receipts/statement).

**Tech Stack:** NestJS + Prisma (PostgreSQL), `@react-pdf/renderer@3`, Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- **No new data model, no migration.** Pure read/compose + PDF + web.
- Multi-tenant + ownership: every parent read/pay is scoped by `schoolId` AND to the parent's guardian-linked children via `childStudentIds(user)`; any non-owned invoice/student → `NotFoundException`. (Memories: tenant-idor-rule.)
- **Build invariant:** NO file under `apps/api/src/` imports from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`). The statement PDF `.tsx` imports only `@react-pdf/renderer` + `react`.
- `@react-pdf/renderer` stays at **v3** (v4 is ESM-incompatible with ts-jest).
- Amounts integer **kobo**. Reuse `allocatePayments` (`fees/installment.util.ts`) + `computeInvoiceStatus` (`fees/invoice-status.util.ts`); do not duplicate the split logic.
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `.env`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`; reset DB before full runs.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Parent invoice detail + installment-aware list

**Files:**
- Modify: `apps/api/src/modules/parent/parent.service.ts` (extend `getInvoices`; add `getInvoiceDetail`)
- Modify: `apps/api/src/modules/parent/parent.controller.ts` (add `GET invoices/:invoiceId`)
- Test: `apps/api/src/modules/parent/parent-fees.spec.ts`

**Interfaces:**
- Consumes: `allocatePayments(paidKobo, installments, now)` from `../fees/installment.util`; `childStudentIds(user)` (private, existing).
- Produces: `getInvoiceDetail(invoiceId, user): Promise<ParentInvoiceDetail>` where
  `ParentInvoiceDetail = { invoiceId, student:{name,admissionNo}, termLabel, lines:{name,amountKobo}[], discounts:{name,amountKobo}[], grossKobo, discountKobo, totalKobo, paidKobo, balanceKobo, installments:{order,label,amountKobo,dueDate,paidKobo,status}[], payments:{paidAt,amountKobo,channel,reference,receiptCode}[], status }`;
  extended `getInvoices` rows add `status` (installment-aware), `nextDueDate`, `nextInstallmentKobo`.

- [ ] **Step 1: Write the failing test** `parent-fees.spec.ts` (seed: school, parent+Guardian→child, a second unrelated parent+child, class level with fee items, a term, generate an invoice for the child; optionally an MF-2 schedule + MF-1 discount + a recorded payment):
  - `getInvoiceDetail(invoiceId, parentUser)` returns lines, discounts, installments (with allocated paid/status), payments (with `receiptCode`), and correct gross/discount/total/paid/balance.
  - A **foreign** invoice id (the other family's) → `NotFoundException`.
  - `getInvoices(parentUser)` rows include installment-aware `status` + `nextInstallmentKobo` (with a schedule = first unpaid installment's outstanding; with no schedule = `balanceKobo`).
  - `getInvoiceDetail` for a non-parent user (identityType != PARENT) → `NotFoundException`/empty guard.

- [ ] **Step 2: Run — expect FAIL** (`... jest parent-fees --runInBand`).

- [ ] **Step 3: Implement.** In `parent.service.ts`:

```ts
// getInvoiceDetail — ownership-checked, composed detail
async getInvoiceDetail(invoiceId: string, user: RequestUser) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const ids = await this.childStudentIds(user);
  const invoice = await this.prisma.invoice.findFirst({
    where: { id: invoiceId, schoolId, studentId: { in: ids.length ? ids : ["__none__"] } },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
      term: { select: { number: true, academicYear: { select: { name: true } } } },
      lines: true,
      invoiceDiscounts: { select: { name: true, amountKobo: true } },
      installments: { orderBy: { order: "asc" } },
      payments: { where: { status: "SUCCESS" }, orderBy: { paidAt: "asc" }, include: { receipt: { select: { code: true } } } },
    },
  });
  if (!invoice) throw new NotFoundException("Invoice not found.");
  const now = new Date();
  const allocated = allocatePayments(invoice.paidKobo, invoice.installments.map((i) => ({ order: i.order, label: i.label, amountKobo: i.amountKobo, dueDate: i.dueDate })), now);
  const status = this.deriveStatus(invoice.totalKobo, invoice.paidKobo, allocated, invoice.dueDate, now);
  return {
    invoiceId: invoice.id,
    student: { name: `${invoice.student.firstName} ${invoice.student.lastName}`, admissionNo: invoice.student.admissionNo },
    termLabel: `${invoice.term.academicYear.name} · Term ${invoice.term.number}`,
    lines: invoice.lines.map((l) => ({ name: l.name, amountKobo: l.amountKobo })),
    discounts: invoice.invoiceDiscounts.map((d) => ({ name: d.name, amountKobo: d.amountKobo })),
    grossKobo: invoice.grossKobo, discountKobo: invoice.discountKobo, totalKobo: invoice.totalKobo,
    paidKobo: invoice.paidKobo, balanceKobo: invoice.totalKobo - invoice.paidKobo,
    installments: allocated,
    payments: invoice.payments.map((p) => ({ paidAt: p.paidAt, amountKobo: p.amountKobo, channel: p.channel, reference: p.reference, receiptCode: p.receipt?.code ?? null })),
    status,
  };
}

// installment-aware invoice status (private helper reused by list + detail)
private deriveStatus(totalKobo: number, paidKobo: number, installments: { status: string }[], dueDate: Date | null, now: Date): "PAID" | "PARTIAL" | "OVERDUE" | "UNPAID" {
  if (paidKobo >= totalKobo) return "PAID";
  if (installments.some((i) => i.status === "OVERDUE")) return "OVERDUE";
  if (installments.length === 0 && dueDate && dueDate.getTime() < now.getTime()) return "OVERDUE";
  if (paidKobo > 0) return "PARTIAL";
  return "UNPAID";
}
```
Extend `getInvoices` to `include: { installments: { orderBy: { order: "asc" } }, ... }`, run `allocatePayments` per invoice, and add to each row: `status: this.deriveStatus(...)`, `nextDueDate` (first installment not `PAID` → its `dueDate`; else `invoice.dueDate`), `nextInstallmentKobo` (first installment not fully paid → `amountKobo − paidKobo`; else `balanceKobo`). Controller: add `@Get("invoices/:invoiceId")` (guards + `@RequirePermissions("fees.pay.own")`, `@CurrentUser()`), delegating to `getInvoiceDetail`.

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(parent): invoice detail + installment-aware invoice list`).

---

### Task 2: Parent receipts list

**Files:**
- Modify: `apps/api/src/modules/parent/parent.service.ts` (add `getReceipts`)
- Modify: `apps/api/src/modules/parent/parent.controller.ts` (add `GET receipts`)
- Test: extend `apps/api/src/modules/parent/parent-fees.spec.ts` (or a new `parent-receipts.spec.ts`)

**Interfaces:**
- Produces: `getReceipts(user): Promise<{ paidAt: Date; amountKobo: number; childName: string; termLabel: string; receiptCode: string | null }[]>` — the parent's children's `SUCCESS` payments, newest first.

- [ ] **Step 1: Write the failing test:** a payment on the parent's child appears (with `receiptCode`, child name, term label); another family's payment does NOT; a `PENDING` payment is excluded; ordered newest-first.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement:**

```ts
async getReceipts(user: RequestUser) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const ids = await this.childStudentIds(user);
  if (ids.length === 0) return [];
  const payments = await this.prisma.payment.findMany({
    where: { schoolId, status: "SUCCESS", invoice: { studentId: { in: ids } } },
    orderBy: { paidAt: "desc" },
    include: {
      receipt: { select: { code: true } },
      invoice: { include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } } },
    },
  });
  return payments.map((p) => ({
    paidAt: p.paidAt ?? p.createdAt,
    amountKobo: p.amountKobo,
    childName: `${p.invoice.student.firstName} ${p.invoice.student.lastName}`,
    termLabel: `${p.invoice.term.academicYear.name} · Term ${p.invoice.term.number}`,
    receiptCode: p.receipt?.code ?? null,
  }));
}
```
Controller: `@Get("receipts")` (guards + `fees.pay.own` + `@CurrentUser()`).

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(parent): receipts list scoped to the parent's children`).

---

### Task 3: Statement PDF

**Files:**
- Create: `apps/api/src/modules/parent/statement-pdf.tsx`
- Modify: `apps/api/src/modules/parent/parent.service.ts` (add `buildStatement(studentId, user)` → data), `parent.controller.ts` (add `GET children/:studentId/statement.pdf`)
- Create: `apps/api/src/modules/parent/statement-pdf.spec.ts`

**Interfaces:**
- Consumes: `allocatePayments`. Produces:
  - `buildStatement(studentId, user): Promise<StatementData>` where `StatementData = { school:{name}, student:{name,admissionNo}, invoices: { termLabel, lines, discounts, installments, payments, grossKobo, discountKobo, totalKobo, paidKobo, balanceKobo }[], overall:{totalKobo,paidKobo,balanceKobo} }`.
  - `renderStatementPdf(data: StatementData): Promise<Buffer>` in `statement-pdf.tsx` (mirror `report-card-pdf.tsx` `renderToBuffer` usage).

- [ ] **Step 1: Write the failing test** `statement-pdf.spec.ts`: `buildStatement(ownChildId, parentUser)` returns the child's invoices with composed detail + `overall` sums = Σ invoices; a foreign child id → `NotFoundException`; `renderStatementPdf(data)` returns a Buffer starting with `%PDF` and length > 1000.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement.** `buildStatement`: validate `studentId ∈ childStudentIds(user)` (else NotFound); load the child's invoices (schoolId-scoped) with the same includes as Task 1; compose each via the shared logic (reuse the Task-1 composition — extract a private `composeInvoice(invoice, now)` in `parent.service.ts` that both `getInvoiceDetail` and `buildStatement` call, to avoid duplication); sum `overall`. `statement-pdf.tsx`: a single `Document` with a school header, student identity, and a section per term-invoice (lines, discount rows, installment table with due/paid/status, payment rows, invoice balance), then an overall balance; `renderStatementPdf` = `renderToBuffer(<StatementDoc data={data}/>)`. Controller: `@Get("children/:studentId/statement.pdf")` (guards + `fees.pay.own` + `@CurrentUser()` + `@Res()`), sets `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="statement-<admissionNo>.pdf"` (sanitize), `res.end(buffer)` — mirror `report-card-pdf.controller.ts`.

- [ ] **Step 4: Run — expect PASS** + build emits `dist/main.js` (the `.tsx` must not break the build — confirm `dist/main.js`). **Step 5: Commit** (`feat(parent): per-child fee statement PDF`).

---

### Task 4: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: extend `ParentInvoice` with `status`, `nextDueDate`, `nextInstallmentKobo`; `interface ParentInvoiceDetail {...}` (Task 1 shape); `interface ParentReceipt {paidAt;amountKobo;childName;termLabel;receiptCode}`. Methods: `getParentInvoiceDetail(invoiceId)`, `getParentReceipts()`, `parentStatementUrl(studentId)` (returns the `GET .../statement.pdf` URL for a download link/anchor, with auth handled per the existing file-download convention — check how report-card PDF download is done in web), plus existing `getParentInvoices`, `parentPay`, `parentPayVerify` (verify names; add if missing).

- [ ] **Step 1: Add types + methods**; cross-check shapes against Tasks 1–3. For the statement download, follow however the web currently fetches the report-card PDF (authed blob fetch → object URL, or an authed link). **Step 2: `pnpm --filter @mymakaranta/web exec tsc --noEmit`** → 0. **Step 3: Commit** (`feat(web): parent fee portal API client types + methods`).

---

### Task 5: Web — parent fee portal UI

**Files:**
- Create: `apps/web/src/app/(app)/parent/fees/page.tsx`
- Modify: parent portal nav/dashboard (`apps/web/src/app/(app)/parent/page.tsx` or the parent layout) to link to Fees

**Interfaces:**
- Consumes: `getParentInvoices`, `getParentInvoiceDetail`, `getParentReceipts`, `parentPay`, `parentPayVerify`, `parentStatementUrl`.

- [ ] **Step 1: Build the fee area.** Child selector (from `getChildren`/invoice grouping) → invoice list (term · total · paid · balance · status badge, overdue highlighted). Click → invoice detail (lines, discount breakdown, installment schedule with due/paid/status, payment history). **Pay** button → dialog with presets **"Next installment (₦{nextInstallmentKobo})"** + **"Full balance (₦{balanceKobo})"** + custom amount → `parentPay({invoiceId, amountKobo, email})` → redirect to Paystack `authorizationUrl`; on return (query param `reference`), call `parentPayVerify(reference)` then refresh. A **Receipts** list (each links to `/receipt/:code`) and a **Download statement** button per child (`parentStatementUrl`). Loading/empty/paid states; naira formatting consistent with staff fee screens.
- [ ] **Step 2: Nav** — add a Fees entry to the parent portal.
- [ ] **Step 3: tsc + lint** (0 / no new errors). Reason through states (no children / no invoices / fully paid / overdue / mid-payment redirect).
- [ ] **Step 4: Commit** (`feat(web): parent fee portal — invoices, detail, pay, receipts, statement`).

---

### Task 6: Regression gate

- [ ] **Step 1: Reset DB + full API suite**: `... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand` (green; the known unrelated `migrate-identity` pollution only appears in a non-reset full run and passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`**: `cd apps/api && rm -rf dist && npx tsc -p tsconfig.build.json && find dist -name main.js`.
- [ ] **Step 3: Web gate**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web lint` (no new errors).
- [ ] **Step 4: Commit** empty gate marker: `test: MF-3 parent portal regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** invoice detail (lines/discounts/installments/payments) (T1) ✓; installment-aware list status + nextInstallmentKobo (T1) ✓; receipts list linking to public page (T2) ✓; statement PDF (T3) ✓; pay presets computed from detail, pay/verify unchanged (T5 UI; T1 exposes the figures) ✓; web portal (T5) ✓; ownership + tenant/IDOR (each API task + T1/T2/T3 foreign-id tests) ✓; no schema change ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for `getInvoiceDetail`, `deriveStatus`, `getReceipts`; `buildStatement`/`renderStatementPdf` + controller streaming described against the concrete `report-card-pdf.controller.ts` pattern; web tasks give exact types/methods/states + point to the existing report-card PDF download + parent screens to copy.

**Type consistency:** `ParentInvoiceDetail` shape identical T1↔T4; `allocatePayments` reused (not re-implemented); `deriveStatus` shared by list + detail (T1) and its statuses match the web badges (T5); `StatementData`/`renderStatementPdf` consistent T3↔(no web type needed, it's a binary download); receipts shape consistent T2↔T4. `composeInvoice(invoice, now)` private helper reused by `getInvoiceDetail` + `buildStatement` (T1 defines, T3 reuses).
