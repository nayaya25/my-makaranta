# Parent Pay Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A linked parent sees their children's invoices/balances and pays one-tap online (Paystack/mock), reconciled by the existing webhook, with a public receipt.

**Architecture:** Extend slice-4a `ParentService`/`parent.controller` with child-ownership-gated fees endpoints (`getInvoices`, `pay`, `payVerify`) that delegate to slice-2 `PaymentsService`. Web: role-aware nav in the `(app)` shell + a `/parent` portal page + a `/dashboard` parent redirect. No new model, no migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest e2e + vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-4-slice-4b-parent-pay-portal-design.md`

**Branch:** `sprint-4-parent-portal` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; uniform 404 on ownership failure (no leak); e2e service-level inside `TenantContext.run` (model on `assessment.e2e-spec.ts`); money kobo Int; `noUncheckedIndexedAccess`. Reuse `PaymentsService.initializeOnline`/`verifyPayment` (slice 2), `computeInvoiceStatus` (3a), `RequestUser.identityId` (4a). `PaymentsModule` exports `PaymentsService`. Perm `fees.pay.own` (seeded + granted at parent link).

---

## File Structure
- Modify: `apps/api/src/modules/parent/parent.service.ts` (add `childStudentIds`, `getInvoices`, `pay`, `payVerify`), `parent.controller.ts` (3 routes), `parent.module.ts` (import PaymentsModule); create `test/parent-pay.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx` (role-aware nav), `apps/web/src/app/(app)/dashboard/page.tsx` (parent redirect); create `apps/web/src/app/(app)/parent/page.tsx`

---

## Task 1: Parent fees endpoints (ownership-gated) + e2e

**Files:** Modify `parent.service.ts`, `parent.controller.ts`, `parent.module.ts`; create `test/parent-pay.e2e-spec.ts`

- [ ] **Step 1: `parent.module.ts`** — add `PaymentsModule` to `imports` (it exports `PaymentsService`):
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { PaymentsModule } from "../payments/payments.module";
import { ParentController } from "./parent.controller";
import { ParentService } from "./parent.service";

@Module({ imports: [AuthModule, PaymentsModule], controllers: [ParentController], providers: [ParentService] })
export class ParentModule {}
```
(No circular import: PaymentsModule doesn't import ParentModule.)

- [ ] **Step 2: Failing e2e** — `test/parent-pay.e2e-spec.ts` (service-level; two-school bootstrap). Seed in school A: a Parent with 2 children (each an invoice, outstanding) + a THIRD unrelated student+invoice. Get `ParentService` via `moduleRef.get`. The service methods take a `RequestUser` (`{id, phone, schoolId, identityType: "PARENT", identityId: parentId}`). Tests:
```ts
  describe("parent pay", () => {
    let parentId: string; let invChild1: string; let invChild2: string; let invOther: string;
    const actor = () => ({ id: "pu", phone: "+2348094000001", schoolId, identityType: "PARENT", identityId: parentId });

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "PPYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `PPL-${suffix}`, order: 1 } });
      const par = await prisma.parent.create({ data: { schoolId, phone: `+234840${String(Date.now()).slice(-7)}`, firstName: "Pay", lastName: "Parent", email: `pp-${suffix}@e.test` } });
      parentId = par.id;
      const mkChild = async (label: string) => {
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "Kid", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
        await prisma.guardian.create({ data: { studentId: stu.id, parentId: par.id, relationship: "FATHER" } });
        return (await prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId: term.id, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 0 } })).id;
      };
      invChild1 = await mkChild("C1");
      invChild2 = await mkChild("C2");
      const other = await prisma.student.create({ data: { schoolId, admissionNo: `OT-${suffix}`, firstName: "Other", lastName: "Kid", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
      invOther = (await prisma.invoice.create({ data: { schoolId, studentId: other.id, termId: term.id, classLevelId: lvl.id, totalKobo: 5000000, paidKobo: 0 } })).id;
    });

    it("lists only the parent's children's invoices", async () => {
      const rows = await asA(() => parent.getInvoices(actor()));
      const ids = rows.map((r) => r.invoiceId);
      expect(ids).toEqual(expect.arrayContaining([invChild1, invChild2]));
      expect(ids).not.toContain(invOther);
      expect(rows.find((r) => r.invoiceId === invChild1)!.balanceKobo).toBe(6000000);
    });

    it("initializes a payment on a child's invoice (PENDING)", async () => {
      const r = await asA(() => parent.pay({ invoiceId: invChild1, amountKobo: 6000000, email: "pp@e.test" }, actor()));
      expect(r.authorizationUrl).toContain(r.reference);
      expect((await prisma.payment.findFirstOrThrow({ where: { schoolId, reference: r.reference } })).status).toBe("PENDING");
    });

    it("refuses to pay a non-child invoice (404, no payment created)", async () => {
      const before = await prisma.payment.count({ where: { schoolId } });
      await expect(asA(() => parent.pay({ invoiceId: invOther, amountKobo: 1000, email: "pp@e.test" }, actor()))).rejects.toThrow(NotFoundException);
      expect(await prisma.payment.count({ where: { schoolId } })).toBe(before); // none created
    });

    it("verifies a child payment idempotently (mock success applies once)", async () => {
      const init = await asA(() => parent.pay({ invoiceId: invChild2, amountKobo: 1000000, email: "pp@e.test" }, actor()));
      await asA(() => parent.payVerify(init.reference, actor()));
      await asA(() => parent.payVerify(init.reference, actor()));
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invChild2 } })).paidKobo).toBe(1000000);
    });

    it("rejects cross-tenant invoice access", async () => {
      await expect(asB(() => parent.getInvoices({ ...actor(), schoolId: schoolBId }))).resolves.toEqual([]); // parent belongs to A; under B → no children → []
      await expect(asB(() => parent.pay({ invoiceId: invChild1, amountKobo: 1000, email: "x@e.test" }, { ...actor(), schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
    });
  });
```
Adapt `schoolId`/`asA`/`asB`/`suffix`/`prisma`/`parent`/`schoolBId`; import `NotFoundException`. Mock provider active (no env) → `initializeOnline` returns `/pay/mock/<ref>`, `verify` → success.

- [ ] **Step 3:** Run e2e → FAIL (methods missing).

- [ ] **Step 4: Implement** in `parent.service.ts` (it already has `getChildren`; inject `PaymentsService`). Add:
```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common"; // (merge with existing imports)
import { PaymentsService } from "../payments/payments.service";
import { computeInvoiceStatus } from "../fees/invoice-status.util";
// constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  private async childStudentIds(user: RequestUser): Promise<string[]> {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: user.identityId, schoolId } });
    if (!parent) return [];
    const guardians = await this.prisma.guardian.findMany({ where: { parentId: parent.id }, select: { studentId: true } });
    return guardians.map((g) => g.studentId);
  }

  async getInvoices(user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ids = await this.childStudentIds(user);
    if (ids.length === 0) return [];
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, studentId: { in: ids } },
      include: {
        student: { select: { firstName: true, lastName: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
      },
    });
    const now = new Date();
    return invoices.map((i) => ({
      studentId: i.studentId,
      studentName: `${i.student.firstName} ${i.student.lastName}`,
      invoiceId: i.id,
      termLabel: `${i.term.academicYear.name} · Term ${i.term.number}`,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
      status: computeInvoiceStatus({ totalKobo: i.totalKobo, paidKobo: i.paidKobo, dueDate: i.dueDate, now }),
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    }));
  }

  async pay(dto: { invoiceId: string; amountKobo: number; email: string }, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, schoolId }, select: { studentId: true } });
    const ids = await this.childStudentIds(user);
    if (!invoice || !ids.includes(invoice.studentId)) throw new NotFoundException("Invoice not found.");
    return this.payments.initializeOnline({ invoiceId: dto.invoiceId, amountKobo: dto.amountKobo, email: dto.email }, user);
  }

  async payVerify(reference: string, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const payment = await this.prisma.payment.findFirst({ where: { reference, schoolId }, select: { invoiceId: true } });
    if (!payment) throw new NotFoundException("Payment not found.");
    const invoice = await this.prisma.invoice.findFirst({ where: { id: payment.invoiceId, schoolId }, select: { studentId: true } });
    const ids = await this.childStudentIds(user);
    if (!invoice || !ids.includes(invoice.studentId)) throw new NotFoundException("Payment not found.");
    return this.payments.verifyPayment(reference, user);
  }
```
Verify the `RequestUser` import + `TenantContext` are already in the file (from 4a's `getChildren`). Merge imports; keep `getChildren`.

- [ ] **Step 5: Controller** — add to `parent.controller.ts` (the file has `GET children` on `JwtAuthGuard` only; add `PermissionGuard` + `RequirePermissions("fees.pay.own")` to the NEW routes; import the DTOs or inline):
```ts
// merge imports: Body, Post, HttpCode, PermissionGuard, RequirePermissions, IsString/IsInt/IsEmail/Min from class-validator
class ParentPayDto { @IsString() @IsNotEmpty() invoiceId!: string; @IsInt() @Min(1) amountKobo!: number; @IsEmail() email!: string; }
class ParentPayVerifyDto { @IsString() @IsNotEmpty() reference!: string; }

  @Get("invoices")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  invoices(@CurrentUser() user: RequestUser) { return this.service.getInvoices(user); }

  @Post("pay") @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  pay(@Body() dto: ParentPayDto, @CurrentUser() user: RequestUser) { return this.service.pay(dto, user); }

  @Post("pay/verify") @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  payVerify(@Body() dto: ParentPayVerifyDto, @CurrentUser() user: RequestUser) { return this.service.payVerify(dto.reference, user); }
```
(Keep the existing `GET children` route. Put the DTO classes at the top of the controller file or in a `dto/` file.)

- [ ] **Step 6:** Run e2e → all `parent pay` tests + full suite green. `pnpm --filter @mymakaranta/api build` + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/parent apps/api/test/parent-pay.e2e-spec.ts
git commit -m "feat(parent): child-ownership-gated invoices + pay + verify (delegates to PaymentsService)"
```

---

## Task 2: Web — role-aware nav + `/parent` portal + dashboard redirect

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/dashboard/page.tsx`; create `apps/web/src/app/(app)/parent/page.tsx`

- [ ] **Step 1: api client** — types + methods:
```ts
export interface ParentInvoice { studentId: string; studentName: string; invoiceId: string; termLabel: string; totalKobo: number; paidKobo: number; balanceKobo: number; status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE"; dueDate: string | null; }
```
```ts
  getParentInvoices: () => authedRequest<ParentInvoice[]>("/v1/parent/invoices"),
  parentPay: (invoiceId: string, amountKobo: number, email: string) =>
    authedRequest<{ reference: string; authorizationUrl: string }>("/v1/parent/pay", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, email }) }),
  parentPayVerify: (reference: string) =>
    authedRequest<{ applied: boolean; status: string; receiptCode?: string }>("/v1/parent/pay/verify", { method: "POST", body: JSON.stringify({ reference }) }),
```

- [ ] **Step 2: Role-aware nav** in `(app)/layout.tsx`. Read the current user's `identityType` (via `session.user()` — confirm it exposes `identityType`; the `AuthUser` type should include it, else read it). Compute the nav list:
```ts
const PARENT_NAV = [{ href: "/parent", label: "Fees", icon: Wallet }];
// in the component: const isParent = user?.identityType === "PARENT"; const navItems = isParent ? PARENT_NAV : NAV_ITEMS;
```
Render `navItems` instead of the hardcoded `NAV_ITEMS`. (The layout currently maps `NAV_ITEMS` — swap to `navItems`. Ensure the layout has the user; if it doesn't already read `session.user()`, add it. `Wallet` is already imported.)

- [ ] **Step 3: Dashboard redirect** in `(app)/dashboard/page.tsx`: after loading the user, if `user.identityType === "PARENT"` → `router.replace("/parent")` (before rendering the staff quick-links). (The page already has `router` + the user effect — add the branch.)

- [ ] **Step 4: `/parent` portal** — `apps/web/src/app/(app)/parent/page.tsx` (`"use client"`). On mount, `getParentInvoices()`. Render:
  - A heading ("Fees" / school name). Group invoices by `studentName` (a sub-heading per child) → each invoice row: term · balance (`formatMoney`) · status `Badge` (OVERDUE error / PARTIAL warning / PAID success / UNPAID neutral).
  - For an invoice with `balanceKobo > 0`: a **Pay** button → reveal an inline amount input (naira, default `balanceKobo/100`) + **Pay now** → `api.parentPay(invoiceId, Math.round(amt*100), email)` where `email` = `session.user()?.email ?? ""` (if empty, a small email input). On success → `window.open(authorizationUrl, "_blank")` + show an **"I've paid — confirm"** button → `api.parentPayVerify(reference)` → on `applied`, a **View receipt** link (`/receipt/<receiptCode>`, open new tab) + reload invoices.
  - Empty state: "No outstanding fees 🎉". Loading `Spinner`; error inline. `formatMoney`. Mobile-friendly (parents are phone-first) — single-column cards.

- [ ] **Step 5: Verify (no dev server):** `pnpm --filter @mymakaranta/web typecheck` + `lint` + `build`. `/parent` builds; the layout + dashboard compile. Reconcile `session.user()`/`AuthUser.identityType`+`email` (confirm those fields exist on `AuthUser`; if `email` isn't on it, prompt for it in the pay form), `Badge` tones, tokens.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/dashboard/page.tsx" "apps/web/src/app/(app)/parent"
git commit -m "feat(parent): role-aware nav + /parent pay portal + dashboard redirect"
```

---

## Task 3: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject). Start API + web. Ensure a loginable Parent exists in the QA school "S3 Gradebook QA" linked to a student with an OUTSTANDING invoice — seed via a one-off Prisma script if needed (a Parent with a fresh phone + Guardian→a student; if the QA students are all PAID, create a fresh invoice or use a student with a balance). OTP-login as that parent phone → confirm redirect to **`/parent`** with the **parent nav** (only Fees, NO Students/Staff/Classes) → see the child + outstanding invoice + balance → **Pay** → (mock) opens the stub URL → **confirm** → `payVerify` applies → balance drops + **View receipt** opens `/receipt/[code]`. Cross-check: a **proprietor** login still shows the full staff nav + `/fees` (role-aware nav doesn't break staff). API cross-check `GET /v1/parent/invoices`. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 4b (parent pay portal) built + QA'd; **Sprint 4 (Fees & Payments) COMPLETE** (slices 1, 2, 3a/3b/3c, 4a/4b). Note the parent portal + role-aware nav. Remaining deferred: `results.view.own` parent results view. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-parent-portal` → main per the user's choice).

---

## Notes for the implementer
- **Ownership is the security crux:** every parent fees endpoint resolves `childStudentIds(user)` and rejects (uniform **404**) any invoice/payment whose student isn't the parent's child — a parent must NOT pay/see an arbitrary same-school invoice. The e2e asserts the non-child pay creates NO payment.
- **Delegate, don't duplicate:** `pay`/`payVerify` call slice-2 `PaymentsService.initializeOnline`/`verifyPayment` after the ownership gate. The bursar endpoints stay `fees.manage`; parents use `fees.pay.own`.
- **Webhook reconcile already works** — `payVerify` is the mock/dev completion path; prod Paystack webhooks auto-reconcile.
- **Role-aware nav** must not regress staff — `identityType !== "PARENT"` → the existing `NAV_ITEMS`. A PARENT only ever sees the parent nav + their portal.
- **`noUncheckedIndexedAccess`** — `rows.find(...)!` in tests, `invoices[0]?.` etc.
- **No model/migration.** Don't `next build` while `next dev` runs; stop dev servers before API `prisma`/builds.
- **Tokens/ui** — reconcile against prior pages (`Badge` tones, `formatMoney`, `bg-paper`/`text-brand-500`/`text-caption` real; `bg-canvas`/`text-brand-600` not). Mobile-first for the parent portal.
