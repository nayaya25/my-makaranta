# Money/Fees MF-1 — Discounts & Scholarships — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reusable discount/scholarship schemes assignable to students, applied automatically during invoice generation to reduce each invoice's net payable, with a transparent per-invoice breakdown.

**Architecture:** Three new tenant models (`DiscountScheme`, `StudentDiscount`, `InvoiceDiscount`) + two `Invoice` fields (`grossKobo`, `discountKobo`; `totalKobo` becomes NET). A pure `computeDiscount` util holds the stacking math; `FeesService.generateInvoices` calls it and persists the breakdown. A new `DiscountsService`/`DiscountsController` (in the existing `fees` module) manages schemes + assignments.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate every request-supplied id (schemeId, studentId, assignment id) through a tenant-scoped model before write/return. Don't rely on `$use` inside `$transaction`/service tests — scope explicitly. (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **`Invoice.totalKobo` = NET payable** (grossKobo − discountKobo). `balanceKobo = totalKobo − paidKobo` stays valid everywhere; payments/finance/reconciliation are NOT changed.
- **Build invariant:** NO file under `apps/api/src/` imports from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Amounts are integer **kobo**. PERCENT value 1–100; FIXED value >0. Stacking: **all PERCENT first, then FIXED**, each `min(remainingGross, nominal)`, floor at ₦0; PERCENT nominal = `floor(gross×pct/100)`.
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `.env`. `prisma migrate dev` needs a TTY — hand-write migration SQL + `prisma migrate deploy` + `prisma generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`; reset DB before full runs.
- Reuse permissions `fees.view` (reads) / `fees.manage` (writes). New tenant tables get NO per-table RLS (assessment precedent).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — discount models + Invoice fields + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum + 3 models + 2 Invoice fields + back-relations on `School`, `Student`, `Invoice`)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (`TENANT_MODELS` += `"DiscountScheme"`, `"StudentDiscount"`, `"InvoiceDiscount"`)
- Create: `apps/api/prisma/migrations/20260705120000_discounts/migration.sql`
- Test: `apps/api/src/modules/fees/discount-model.spec.ts`

**Interfaces:**
- Produces: `prisma.discountScheme`, `prisma.studentDiscount`, `prisma.invoiceDiscount`; `DiscountMethod` enum; `Invoice.grossKobo`/`discountKobo`.

- [ ] **Step 1: Add to `schema.prisma`** the `DiscountMethod` enum + `DiscountScheme`, `StudentDiscount`, `InvoiceDiscount` models exactly as in the spec's Data model section; add `grossKobo Int @default(0)` + `discountKobo Int @default(0)` + `invoiceDiscounts InvoiceDiscount[]` to `Invoice`; back-relations `School { discountSchemes DiscountScheme[]  studentDiscounts StudentDiscount[]  invoiceDiscounts InvoiceDiscount[] }`, `Student { discounts StudentDiscount[] }`.

- [ ] **Step 2: Add the three model names to `TENANT_MODELS`.**

- [ ] **Step 3: Write the migration** `apps/api/prisma/migrations/20260705120000_discounts/migration.sql`:

```sql
CREATE TYPE "DiscountMethod" AS ENUM ('PERCENT','FIXED');

CREATE TABLE "DiscountScheme" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "method" "DiscountMethod" NOT NULL,
  "value" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountScheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscountScheme_schoolId_name_key" ON "DiscountScheme"("schoolId","name");

CREATE TABLE "StudentDiscount" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "discountSchemeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentDiscount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentDiscount_studentId_discountSchemeId_key" ON "StudentDiscount"("studentId","discountSchemeId");
CREATE INDEX "StudentDiscount_schoolId_studentId_idx" ON "StudentDiscount"("schoolId","studentId");

CREATE TABLE "InvoiceDiscount" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "schemeId" TEXT,
  "name" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  CONSTRAINT "InvoiceDiscount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceDiscount_schoolId_invoiceId_idx" ON "InvoiceDiscount"("schoolId","invoiceId");

ALTER TABLE "Invoice" ADD COLUMN "grossKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "discountKobo" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DiscountScheme" ADD CONSTRAINT "DiscountScheme_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_discountSchemeId_fkey" FOREIGN KEY ("discountSchemeId") REFERENCES "DiscountScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "DiscountScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Write the failing test** `discount-model.spec.ts`: create School + DiscountScheme (PERCENT 50); `@@unique([schoolId, name])` rejects dup name; create Student + StudentDiscount, `@@unique([studentId, discountSchemeId])` rejects dup; deleting the scheme cascades StudentDiscount but (create an Invoice + InvoiceDiscount with schemeId) sets `InvoiceDiscount.schemeId` to NULL (SET NULL) rather than deleting the row; cross-tenant read isolation.

- [ ] **Step 5: Apply + generate**: `... prisma migrate deploy` then `... prisma generate`.
- [ ] **Step 6: Run — expect PASS** (`... jest discount-model --runInBand`).
- [ ] **Step 7: Build check** → `dist/main.js`.
- [ ] **Step 8: Commit** (`feat(fees): discount schemes/assignments schema + Invoice gross/discount fields`).

---

### Task 2: Pure discount computation util

**Files:**
- Create: `apps/api/src/modules/fees/discount.util.ts`
- Test: `apps/api/src/modules/fees/discount.util.spec.ts`

**Interfaces:**
- Produces:
  - `type DiscountInput = { id: string; name: string; method: "PERCENT" | "FIXED"; value: number }`
  - `type DiscountBreakdownItem = { schemeId: string; name: string; amountKobo: number }`
  - `computeDiscount(grossKobo: number, schemes: DiscountInput[]): { discountKobo: number; breakdown: DiscountBreakdownItem[] }`

- [ ] **Step 1: Write the failing test** `discount.util.spec.ts`:
  - single PERCENT 50 on gross 100000 → discountKobo 50000, one breakdown row 50000.
  - single FIXED 20000 on gross 100000 → 20000.
  - stacked [PERCENT 50, PERCENT 20, FIXED 20000] on gross 100000 → percents first: 50000 + 20000 = 70000, then fixed 20000 → total 90000; breakdown three rows [50000, 20000, 20000] summing to 90000.
  - clamp: [PERCENT 80, FIXED 50000] on gross 100000 → 80000 then min(20000 remaining, 50000)=20000 → discountKobo 100000 (net 0), breakdown [80000, 20000].
  - empty schemes → 0, [].
  - PERCENT floor: gross 999, PERCENT 33 → floor(329.67)=329.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `discount.util.ts`**:

```ts
export type DiscountInput = { id: string; name: string; method: "PERCENT" | "FIXED"; value: number };
export type DiscountBreakdownItem = { schemeId: string; name: string; amountKobo: number };

/** Applies all PERCENT schemes first, then FIXED, each capped at the remaining gross.
 *  Per-scheme amounts sum exactly to discountKobo; net (gross − discountKobo) never goes below 0. */
export function computeDiscount(
  grossKobo: number,
  schemes: DiscountInput[],
): { discountKobo: number; breakdown: DiscountBreakdownItem[] } {
  const ordered = [
    ...schemes.filter((s) => s.method === "PERCENT"),
    ...schemes.filter((s) => s.method === "FIXED"),
  ];
  let remaining = grossKobo;
  const breakdown: DiscountBreakdownItem[] = [];
  for (const s of ordered) {
    if (remaining <= 0) break;
    const nominal = s.method === "PERCENT" ? Math.floor((grossKobo * s.value) / 100) : s.value;
    const applied = Math.max(0, Math.min(remaining, nominal));
    if (applied > 0) {
      breakdown.push({ schemeId: s.id, name: s.name, amountKobo: applied });
      remaining -= applied;
    }
  }
  return { discountKobo: grossKobo - remaining, breakdown };
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(fees): pure discount stacking computation util`).

---

### Task 3: `DiscountsService` — schemes CRUD + assignments

**Files:**
- Create: `apps/api/src/modules/fees/dto/discounts.dto.ts`
- Create: `apps/api/src/modules/fees/discounts.service.ts`
- Test: `apps/api/src/modules/fees/discounts.service.spec.ts`

**Interfaces:**
- Produces: `DiscountsService` methods `listSchemes()`, `createScheme(dto)`, `updateScheme(id, dto)`, `deleteScheme(id)`, `listForStudent(studentId)`, `assign(studentId, schemeId)`, `revoke(assignmentId)`, `schemeRoster(schemeId)`. DTOs `CreateSchemeDto {name, method: "PERCENT"|"FIXED", value, active?}`, `UpdateSchemeDto` (all optional).

- [ ] **Step 1: Write the failing test** `discounts.service.spec.ts`: createScheme validates method+value (PERCENT value 1–100 else BadRequest; FIXED value>0 else BadRequest); `@@unique` name dup surfaces; updateScheme; deleteScheme throws BadRequest when the scheme has assignments (else deletes); assign validates student + scheme belong to school (foreign → NotFound), `@@unique` prevents dup assignment; revoke; listForStudent + schemeRoster return school-scoped rows; IDOR (foreign student/scheme/assignment → NotFound). All scoped by `TenantContext.schoolIdOrThrow()`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** DTOs use class-validator (`@IsIn(["PERCENT","FIXED"])`, `@IsInt`, value range checked in service since it depends on method). Service scopes every query by `schoolId`, uses `findFirst({id, schoolId})` guards, `updateMany`/`deleteMany` for writes. `createScheme`/`updateScheme`: if method PERCENT require 1≤value≤100, if FIXED require value>0 (BadRequest otherwise). `deleteScheme`: `count(studentDiscount where discountSchemeId=id, schoolId)` > 0 → BadRequest "Scheme is assigned to students; deactivate it instead."; else `deleteMany({id, schoolId})`. `assign`: validate student + scheme via findFirst scoped; `create`. `revoke`: `deleteMany({id, schoolId})`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(fees): discounts service — schemes CRUD + student assignments`).

---

### Task 4: Apply discounts in `generateInvoices` + expose in invoice reads

**Files:**
- Modify: `apps/api/src/modules/fees/fees.service.ts` (`generateInvoices`, `getInvoice`, `getInvoices`)
- Test: `apps/api/src/modules/fees/fees-discounts.spec.ts`

**Interfaces:**
- Consumes: `computeDiscount` (Task 2). Produces: invoices with `grossKobo`/`discountKobo`/net `totalKobo` + `InvoiceDiscount` rows; `getInvoice` returns `grossKobo`, `discountKobo`, `discounts: [{name, amountKobo}]`; `getInvoices` rows include `grossKobo`, `discountKobo`.

- [ ] **Step 1: Write the failing test** `fees-discounts.spec.ts`:
  - Seed a level with fee items (gross known), enroll a student, assign a PERCENT 50 scheme, `generateInvoices(term)` → invoice `grossKobo = gross`, `discountKobo = gross/2`, `totalKobo = gross − discount` (net), one `InvoiceDiscount` row; `getInvoice` returns the breakdown; `balanceKobo = totalKobo − paidKobo`.
  - Stacked schemes applied correctly (reuse a percent+fixed combo); inactive scheme ignored.
  - **Regression:** a student with no schemes → `grossKobo = totalKobo`, `discountKobo = 0`, no `InvoiceDiscount` rows. A student who already paid (`paidKobo>0`) is **skipped** (invoice unchanged even after assigning a scheme). Re-running generation on an unpaid invoice refreshes discount (assign scheme → regenerate → discount now present; `InvoiceDiscount` rows replaced, not duplicated).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** In `generateInvoices`, inside the transaction, after computing `lines`/`gross` for a student: load `const schemes = await tx.studentDiscount.findMany({ where: { schoolId, studentId: e.studentId, discountScheme: { active: true } }, include: { discountScheme: true } })` → map to `DiscountInput` (`{id: sd.discountScheme.id, name: sd.discountScheme.name, method: sd.discountScheme.method, value: sd.discountScheme.value}`); `const { discountKobo, breakdown } = computeDiscount(gross, inputs)`; `net = gross - discountKobo`. Upsert invoice with `grossKobo: gross, discountKobo, totalKobo: net`. After replacing `InvoiceLine`s, `await tx.invoiceDiscount.deleteMany({ where: { schoolId, invoiceId: invoice.id } })` then `createMany` the `breakdown` rows (`{schoolId, invoiceId, schemeId, name, amountKobo}`). Preserve the existing skip-if-paid guard exactly. In `getInvoice`, include `invoiceDiscounts` and return `grossKobo`, `discountKobo`, `discounts: invoice.invoiceDiscounts.map(d => ({name: d.name, amountKobo: d.amountKobo}))`. In `getInvoices` rows, add `grossKobo`, `discountKobo` (keep `totalKobo` = net, `balanceKobo = totalKobo − paidKobo`).

- [ ] **Step 4: Run — expect PASS**, and run the existing fees/payments suites (`... jest fees payments --runInBand`) to confirm no regression.
- [ ] **Step 5: Commit** (`feat(fees): apply student discounts during invoice generation + expose breakdown`).

---

### Task 5: `DiscountsController` + module registration

**Files:**
- Create: `apps/api/src/modules/fees/discounts.controller.ts`
- Modify: `apps/api/src/modules/fees/fees.module.ts` (add `DiscountsController` + `DiscountsService`)
- Test: `apps/api/src/modules/fees/discounts.controller.spec.ts`

**Interfaces:**
- Consumes: `DiscountsService`. Guards mirror `fees.controller.ts` (`JwtAuthGuard`, `PermissionGuard`, `@RequirePermissions`).
- Produces: routes under `v1/fees` (see spec §API).

- [ ] **Step 1: `discounts.controller.ts`** `@Controller("v1/fees")`. Routes (static before param): `GET discount-schemes` (`fees.view`), `POST discount-schemes` (`fees.manage`), `PATCH discount-schemes/:id` (`fees.manage`), `DELETE discount-schemes/:id` (`fees.manage`), `GET discount-schemes/:id/students` (`fees.view`), `GET students/:studentId/discounts` (`fees.view`), `POST students/:studentId/discounts` (`fees.manage`), `DELETE student-discounts/:id` (`fees.manage`). Match the guard decorators used in `fees.controller.ts`.
- [ ] **Step 2: Register** `DiscountsController` in `controllers` and `DiscountsService` in `providers` of `fees.module.ts`.
- [ ] **Step 3: Test** routes delegate to the service (mirror the existing controller spec style in the repo), or integration: create scheme + assign via service, `schemeRoster` reflects it.
- [ ] **Step 4: Run — expect PASS** (`... jest discounts --runInBand`) + build emits `dist/main.js`.
- [ ] **Step 5: Commit** (`feat(fees): discounts controller + module wiring`).

---

### Task 6: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `type DiscountMethod`, `interface DiscountScheme {id;name;method;value;active}`, `interface StudentDiscount {id;schemeId;name;method;value}`; extend the invoice-detail type with `grossKobo`, `discountKobo`, `discounts: {name;amountKobo}[]`. Methods: `listDiscountSchemes()`, `createDiscountScheme(dto)`, `updateDiscountScheme(id,dto)`, `deleteDiscountScheme(id)`, `schemeRoster(id)`, `listStudentDiscounts(studentId)`, `assignDiscount(studentId, schemeId)`, `revokeStudentDiscount(id)`. All authed, matching existing `fees` client methods (`getFeeItems`, `getInvoiceDetail` at `api.ts:1115+`).

- [ ] **Step 1: Add types + methods**; extend `getInvoiceDetail`'s return type with the new fields.
- [ ] **Step 2: `pnpm --filter @mymakaranta/web exec tsc --noEmit`** → 0 errors.
- [ ] **Step 3: Commit** (`feat(web): discounts API client types + methods`).

---

### Task 7: Web — schemes editor + student assignment + invoice breakdown

**Files:**
- Create: `apps/web/src/app/(app)/settings/discounts/page.tsx` (schemes editor; link from settings index like the bell-schedule entry)
- Modify: the student fee view + invoice display (find the fee/invoice screens under `apps/web/src/app/(app)/fees/` and the student detail; add an assignment panel + a discount breakdown to the invoice view)

**Interfaces:**
- Consumes: Task 6 methods; existing `getInvoiceDetail`, student/fee screens.

- [ ] **Step 1: Discount schemes editor** — list schemes (name, method toggle %/fixed, value, active switch), add/edit/retire; validate value ranges client-side (PERCENT 1–100, FIXED >0). Loading/empty states.
- [ ] **Step 2: Student assignment** — on the student's fee/detail view, a panel to assign a scheme (dropdown of active schemes) + list current assignments with revoke; note that discounts apply on next invoice generation for unpaid invoices.
- [ ] **Step 3: Invoice display** — show gross → discount breakdown (each `{name, amountKobo}`) → net (`totalKobo`) → paid → balance, on the invoice detail view + receipt/statement if present.
- [ ] **Step 4: tsc + lint** (0 / no new errors).
- [ ] **Step 5: Commit** (`feat(web): discount schemes editor + student assignment + invoice breakdown`).

---

### Task 8: Regression gate

- [ ] **Step 1: Reset DB + full API suite**: `... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand` (all green; the known unrelated `migrate-identity` pollution only surfaces in a non-reset full run and passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`**: `cd apps/api && rm -rf dist && npx tsc -p tsconfig.build.json && find dist -name main.js`.
- [ ] **Step 3: Web gate**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web lint` (no new errors).
- [ ] **Step 4: Commit** empty gate marker: `test: MF-1 discounts regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** reusable schemes + assignments (T1/T3) ✓; whole-invoice scope + PERCENT/FIXED + stacking percent-then-fixed clamp (T2 util) ✓; standing cadence applied at generation (T4) ✓; `totalKobo`=net + gross/discount fields (T1/T4) ✓; InvoiceDiscount breakdown + snapshot/SetNull (T1/T4) ✓; paid-skip preserved + balance invariant + payments/finance/reconciliation untouched (T4 regression) ✓; schemes/assignment API + `fees.view`/`fees.manage` (T5) ✓; editor + assignment + breakdown UI (T7) ✓; tenant/IDOR + gate (each task + T8) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for schema, migration SQL, `computeDiscount`; service/controller/web tasks give exact signatures, routes, and the concrete files to modify.

**Type consistency:** `DiscountInput`/`computeDiscount` signature identical across T2 (defined) and T4 (consumed). `CreateSchemeDto {name, method, value, active?}` consistent T3↔T5↔T6. `method: "PERCENT"|"FIXED"` union matches the `DiscountMethod` enum. Invoice-read additions (`grossKobo`, `discountKobo`, `discounts[]`) consistent T4↔T6↔T7. Route paths under `v1/fees` consistent T5↔T6.
