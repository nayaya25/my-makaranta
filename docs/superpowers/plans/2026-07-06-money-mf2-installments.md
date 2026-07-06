# Money/Fees MF-2 — Installment Plans — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-level/term percentage installment schedule that `generateInvoices` splits each invoice's net total across, with per-installment paid/overdue state derived (waterfall) from `paidKobo` — payments unchanged.

**Architecture:** Two new tenant models (`ScheduleInstallment` per level+term; `Installment` materialized per invoice). Two pure utils — `splitInstallments` (net → amounts, last absorbs rounding) and `allocatePayments` (paidKobo → per-installment status). `generateInvoices` materializes installments; `getInvoice` derives their state. A schedule CRUD service/controller in the existing `fees` module.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate request-supplied ids (classLevelId, termId, invoiceId) through tenant-scoped models before use. Don't rely on `$use` inside `$transaction`/service tests — scope explicitly. (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **Payments are NOT modified.** Per-installment paid state is derived only. `balanceKobo = totalKobo − paidKobo` stays valid.
- **Build invariant:** NO file under `apps/api/src/` imports from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Amounts integer **kobo**. Schedule percents are **basis points** (`percentBps`), each 1–10000, and all rows for a (level,term) sum to exactly **10000**. Split: `floor(net×bps/10000)` for all but the last; last = `net − Σ others`.
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `.env`. `prisma migrate dev` needs a TTY — hand-write SQL + `prisma migrate deploy` + `prisma generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`; reset DB before full runs.
- Reuse permissions `fees.view`/`fees.manage`. New tenant tables get NO per-table RLS. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `ScheduleInstallment` + `Installment` + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (2 models + back-relations on `School`, `ClassLevel`, `Term`, `Invoice`)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (`TENANT_MODELS` += `"ScheduleInstallment"`, `"Installment"`)
- Create: `apps/api/prisma/migrations/20260706120000_installments/migration.sql`
- Test: `apps/api/src/modules/fees/installment-model.spec.ts`

**Interfaces:**
- Produces: `prisma.scheduleInstallment`, `prisma.installment` delegates.

- [ ] **Step 1: Add models to `schema.prisma`** exactly as in the spec's Data model section; back-relations `School { scheduleInstallments ScheduleInstallment[]  installments Installment[] }`, `ClassLevel { scheduleInstallments ScheduleInstallment[] }`, `Term { scheduleInstallments ScheduleInstallment[] }`, `Invoice { installments Installment[] }`.
- [ ] **Step 2: Add both model names to `TENANT_MODELS`.**
- [ ] **Step 3: Write the migration** `apps/api/prisma/migrations/20260706120000_installments/migration.sql` (note `"order"` is quoted — it's a SQL keyword):

```sql
CREATE TABLE "ScheduleInstallment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classLevelId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "label" TEXT,
  "percentBps" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleInstallment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduleInstallment_classLevelId_termId_order_key" ON "ScheduleInstallment"("classLevelId","termId","order");
CREATE INDEX "ScheduleInstallment_schoolId_classLevelId_termId_idx" ON "ScheduleInstallment"("schoolId","classLevelId","termId");

CREATE TABLE "Installment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "label" TEXT,
  "amountKobo" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Installment_invoiceId_order_key" ON "Installment"("invoiceId","order");
CREATE INDEX "Installment_schoolId_invoiceId_idx" ON "Installment"("schoolId","invoiceId");

ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Write the failing test** `installment-model.spec.ts`: create School+ClassLevel+Term, a `ScheduleInstallment`; `@@unique([classLevelId,termId,order])` rejects a dup order; create an Invoice + `Installment`, `@@unique([invoiceId,order])` rejects dup; deleting the invoice cascades its installments; cross-tenant read isolation.
- [ ] **Step 5: Apply + generate**: `... prisma migrate deploy` then `... prisma generate`.
- [ ] **Step 6: Run — expect PASS** + **Step 7: build check** → `dist/main.js`.
- [ ] **Step 8: Commit** (`feat(fees): installment schedule + per-invoice installment schema`).

---

### Task 2: Pure utils — `splitInstallments` + `allocatePayments` + status

**Files:**
- Create: `apps/api/src/modules/fees/installment.util.ts`
- Test: `apps/api/src/modules/fees/installment.util.spec.ts`

**Interfaces:**
- Produces:
  - `type ScheduleRow = { order: number; label: string | null; percentBps: number; dueDate: Date }`
  - `type SplitInstallment = { order: number; label: string | null; amountKobo: number; dueDate: Date }`
  - `splitInstallments(netKobo: number, rows: ScheduleRow[]): SplitInstallment[]`
  - `type InstallmentRow = { order: number; label: string | null; amountKobo: number; dueDate: Date }`
  - `type AllocatedInstallment = InstallmentRow & { paidKobo: number; status: "PAID" | "PARTIAL" | "DUE" | "OVERDUE" }`
  - `allocatePayments(paidKobo: number, installments: InstallmentRow[], now: Date): AllocatedInstallment[]`

- [ ] **Step 1: Write the failing test** `installment.util.spec.ts`:
  - `splitInstallments(100000, [5000,2500,2500 bps])` → amounts [50000,25000,25000], dueDates preserved.
  - rounding: `splitInstallments(99999, [3334,3333,3333 bps])` → [33339,33329,33331]? — assert `sum === 99999` and `length === 3` and the last = `99999 − first − second` (don't hardcode the floors; assert the invariant sum==net and first two are `floor`).
  - single [10000 bps] → [net].
  - `allocatePayments(0, [{50000, dueDate: future}], now)` → status DUE, paidKobo 0; with dueDate past → OVERDUE.
  - `allocatePayments(60000, [{50000},{25000},{25000}], now)` (all future) → [PAID 50000, PARTIAL 10000, DUE 0].
  - full `allocatePayments(100000, …)` → all PAID.
  - overdue: first installment unpaid + past due → OVERDUE.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `installment.util.ts`**:

```ts
export type ScheduleRow = { order: number; label: string | null; percentBps: number; dueDate: Date };
export type SplitInstallment = { order: number; label: string | null; amountKobo: number; dueDate: Date };

/** Split netKobo across rows by basis points; the last row absorbs rounding so the
 *  amounts sum exactly to netKobo. Assumes Σ percentBps === 10000 and rows are ordered. */
export function splitInstallments(netKobo: number, rows: ScheduleRow[]): SplitInstallment[] {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const out: SplitInstallment[] = [];
  let allocated = 0;
  sorted.forEach((r, i) => {
    const amountKobo = i === sorted.length - 1 ? netKobo - allocated : Math.floor((netKobo * r.percentBps) / 10000);
    allocated += amountKobo;
    out.push({ order: r.order, label: r.label, amountKobo, dueDate: r.dueDate });
  });
  return out;
}

export type InstallmentRow = { order: number; label: string | null; amountKobo: number; dueDate: Date };
export type InstallmentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";
export type AllocatedInstallment = InstallmentRow & { paidKobo: number; status: InstallmentStatus };

/** Waterfall-allocate paidKobo across ordered installments; derive each one's status. */
export function allocatePayments(paidKobo: number, installments: InstallmentRow[], now: Date): AllocatedInstallment[] {
  const sorted = [...installments].sort((a, b) => a.order - b.order);
  let remaining = paidKobo;
  return sorted.map((inst) => {
    const paid = Math.max(0, Math.min(remaining, inst.amountKobo));
    remaining -= paid;
    let status: InstallmentStatus;
    if (paid >= inst.amountKobo) status = "PAID";
    else if (inst.dueDate.getTime() < now.getTime()) status = "OVERDUE";
    else if (paid > 0) status = "PARTIAL";
    else status = "DUE";
    return { ...inst, paidKobo: paid, status };
  });
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(fees): pure installment split + payment allocation utils`).

---

### Task 3: `InstallmentScheduleService` — schedule get/set

**Files:**
- Create: `apps/api/src/modules/fees/dto/installments.dto.ts`
- Create: `apps/api/src/modules/fees/installment-schedule.service.ts`
- Test: `apps/api/src/modules/fees/installment-schedule.service.spec.ts`

**Interfaces:**
- Produces: `InstallmentScheduleService` methods `getSchedule(classLevelId, termId)` → ordered rows, `setSchedule(classLevelId, termId, rows: SetInstallmentDto[])` → the saved rows. DTO `SetInstallmentDto {order, label?, percentBps, dueDate}`, request body `SetScheduleDto {classLevelId, termId, installments: SetInstallmentDto[]}`.

- [ ] **Step 1: Write the failing test** `installment-schedule.service.spec.ts`: `setSchedule` validates the level+term belong to the school (foreign → NotFound); each `percentBps` 1–10000; **Σ == 10000** (reject 9000 and 11000 → BadRequest); each dueDate valid; replaces existing rows (delete-all + recreate, no dupes); empty array clears; `getSchedule` returns ordered rows scoped to school; IDOR (foreign level/term → NotFound). Scope by `TenantContext.schoolIdOrThrow()`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Mirror `FeesService.setFeeItems`: validate level+term via `findFirst({id, schoolId})`; validate each row (`percentBps` in 1..10000) and `installments.length ? Σbps===10000 : true`; in a `$transaction` `scheduleInstallment.deleteMany({schoolId, classLevelId, termId})` then `createMany` the rows (coerce `dueDate` via `new Date(...)`). `getSchedule` → `findMany({where:{schoolId, classLevelId, termId}, orderBy:{order:"asc"}})`. DTOs use class-validator (`@IsInt`, `@Min(1)`, `@Max(10000)` on percentBps; `@IsDateString` on dueDate).

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(fees): installment schedule service (get/set + sum validation)`).

---

### Task 4: Materialize in `generateInvoices` + derive in invoice reads

**Files:**
- Modify: `apps/api/src/modules/fees/fees.service.ts` (`generateInvoices`, `getInvoice`, `getInvoices`)
- Test: `apps/api/src/modules/fees/fees-installments.spec.ts`

**Interfaces:**
- Consumes: `splitInstallments`, `allocatePayments` (Task 2). Produces: invoices with `Installment` rows; `getInvoice` returns `installments: AllocatedInstallment[]` + installment-aware `status`; `getInvoices` rows gain `nextDueDate` + `status`.

- [ ] **Step 1: Write the failing test** `fees-installments.spec.ts`:
  - Seed a level with fee items (net known), a schedule (50/25/25 with dates), enroll a student, `generateInvoices` → invoice has 3 `Installment` rows summing to `totalKobo`, `Invoice.dueDate` = last installment's date.
  - With an MF-1 discount assigned → installments scale to the **discounted net** and still sum to `totalKobo` (last absorbs rounding).
  - `getInvoice` returns `installments` with derived `paidKobo`/`status` (record a payment via existing service or set `paidKobo` in seed → first installment PAID, etc.).
  - No schedule → no `Installment` rows, `getInvoice.installments` is `[]`, single-`dueDate` behavior intact.
  - Regenerating an unpaid invoice replaces (not duplicates) installments.
  - Regression: `balanceKobo = totalKobo − paidKobo`; paid-invoice (`paidKobo>0`) skip preserved.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** In `generateInvoices` (inside the tx, after lines + discounts + net + upsert): load `const sched = await tx.scheduleInstallment.findMany({ where: { schoolId, classLevelId: e.class.classLevelId, termId }, orderBy: { order: "asc" } })`. `await tx.installment.deleteMany({ where: { schoolId, invoiceId: invoice.id } })`; if `sched.length`, `const split = splitInstallments(net, sched.map(s => ({order:s.order,label:s.label,percentBps:s.percentBps,dueDate:s.dueDate})))`, `createMany` the split rows (`{schoolId, invoiceId, order, label, amountKobo, dueDate}`), and set the invoice's `dueDate` to `split[split.length-1].dueDate` (do this on the upsert `create`/`update` data, or a follow-up `tx.invoice.update`). Preserve the paid-skip guard. In `getInvoice`: fetch the invoice's `installments` ordered; `const allocated = allocatePayments(invoice.paidKobo, installments, new Date())`; return `installments: allocated` + `status` from an installment-aware helper (`PAID` if paid≥total; else `OVERDUE` if any allocated is OVERDUE; else `PARTIAL`/`UNPAID`). In `getInvoices`, add `nextDueDate` = earliest unpaid installment's dueDate (or invoice.dueDate) + `status`.

- [ ] **Step 4: Run — expect PASS**, plus `... jest fees payments --runInBand` (no regression). **Step 5: Commit** (`feat(fees): materialize installments in generateInvoices + derive state in reads`).

---

### Task 5: Schedule controller routes + module wiring

**Files:**
- Create: `apps/api/src/modules/fees/installment-schedule.controller.ts`
- Modify: `apps/api/src/modules/fees/fees.module.ts` (add controller + service)
- Test: `apps/api/src/modules/fees/installment-schedule.controller.spec.ts`

**Interfaces:**
- Consumes: `InstallmentScheduleService`. Guards mirror `fees.controller.ts`.

- [ ] **Step 1: `installment-schedule.controller.ts`** `@Controller("v1/fees")`: `GET installment-schedule?classLevelId=&termId=` (`fees.view`), `PUT installment-schedule` body `SetScheduleDto` (`fees.manage`). `@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermissions(...)` matching `fees.controller.ts`.
- [ ] **Step 2: Register** in `fees.module.ts` (controllers + providers).
- [ ] **Step 3: Test** routes delegate to the service (repo's controller-spec style), or integration: setSchedule + getSchedule round-trip.
- [ ] **Step 4: Run — expect PASS** + build emits `dist/main.js`. **Step 5: Commit** (`feat(fees): installment schedule controller + module wiring`).

---

### Task 6: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `interface ScheduleInstallment {order;label;percentBps;dueDate}`; `type InstallmentStatus = "PAID"|"PARTIAL"|"DUE"|"OVERDUE"`; `interface InvoiceInstallment {order;label;amountKobo;dueDate;paidKobo;status}`; extend the invoice-detail type (`getInvoiceDetail`) with `installments: InvoiceInstallment[]` + `status`; extend `getInvoices` rows with `nextDueDate` + `status`. Methods: `getInstallmentSchedule(classLevelId, termId)`, `setInstallmentSchedule({classLevelId, termId, installments})`. All authed.

- [ ] **Step 1: Add types + methods**; cross-check shapes against the controller/service (Tasks 3–5). **Step 2: `pnpm --filter @mymakaranta/web exec tsc --noEmit`** → 0. **Step 3: Commit** (`feat(web): installment schedule API client types + methods`).

---

### Task 7: Web — schedule editor + invoice installment display

**Files:**
- Create: `apps/web/src/app/(app)/settings/installments/page.tsx` (schedule editor; card on settings index)
- Modify: the invoice detail view under `apps/web/src/app/(app)/fees/` (render the installment schedule)

**Interfaces:**
- Consumes: Task 6 methods + existing `listClassLevels`/`listAcademicYears`(terms) + `getInvoiceDetail`.

- [ ] **Step 1: Schedule editor** — pick class level + term → ordered rows (label, percent, due date) with add/remove and a **live sum indicator** that must equal 100% to save; save calls `setInstallmentSchedule` (convert percent→bps: `Math.round(pct*100)`); clear = save empty. Loading/empty states.
- [ ] **Step 2: Invoice detail** — render `installments` (order, label, amount ₦, due date, paid ₦, status badge Paid/Partial/Due/Overdue), highlighting overdue. Kobo→₦ formatting consistent with existing fee screens.
- [ ] **Step 3: tsc + lint** (0 / no new errors). **Step 4: Commit** (`feat(web): installment schedule editor + invoice installment breakdown`).

---

### Task 8: Regression gate

- [ ] **Step 1: Reset DB + full API suite**: `... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand` (green; the known unrelated `migrate-identity` pollution only appears in a non-reset full run and passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`**. **Step 3: Web gate** (`tsc --noEmit` 0 + lint no new errors). **Step 4: Commit** empty gate marker: `test: MF-2 installments regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** per level+term schedule (T1/T3) ✓; percentBps + Σ=10000 validation (T3) ✓; split last-absorbs-rounding (T2) ✓; materialize at generation scaled to discounted net (T4) ✓; derived waterfall allocation + statuses (T2/T4) ✓; installment-aware invoice OVERDUE (T4) ✓; no-schedule backward compat + payments untouched + paid-skip + balance invariant (T4 regression) ✓; schedule API `fees.view`/`fees.manage` (T5) ✓; editor + invoice display (T7) ✓; tenant/IDOR + gate (each + T8) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for schema, migration SQL, both utils; service/controller/web give exact signatures, routes, files.

**Type consistency:** `splitInstallments`/`allocatePayments` signatures identical T2↔T4. `SetInstallmentDto {order,label?,percentBps,dueDate}` consistent T3↔T5↔T6. `InstallmentStatus` union identical across util/web. Invoice-read additions (`installments`, `status`, `nextDueDate`) consistent T4↔T6↔T7. `percentBps` (bps, 1–10000) used consistently; web converts percent→bps in T7.
