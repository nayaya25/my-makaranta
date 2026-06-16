# Fees Finance Summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A term-scoped finance summary on `/fees` — KPI cards (expected, collected, outstanding, overdue, collected-this-week) + a per-class-level breakdown. Read-only; no new model.

**Architecture:** A pure `finance-summary.util` aggregator (reusing `computeInvoiceStatus`) + a read-only `finance.service` method + a controller route, in the fees module. Web adds a summary section to `/fees`. No migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest e2e + jest unit + vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-sprint-4-slice-3c-fees-finance-summary-design.md`

**Branch:** `sprint-4-finance-reports` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; IDOR → 404; e2e service-level inside `TenantContext.run` (model on `assessment.e2e-spec.ts`); money kobo Int; `noUncheckedIndexedAccess`. `reports.view` perm (seeded). Reuse `computeInvoiceStatus` from `apps/api/src/modules/fees/invoice-status.util.ts`. `PaymentStatus.SUCCESS` (enum exists). `formatMoney` (web).

---

## File Structure
- Create: `apps/api/src/modules/fees/finance-summary.util.ts` + `.spec.ts`, `finance.service.ts`, `finance.controller.ts`
- Modify: `apps/api/src/modules/fees/fees.module.ts` (register), create `test/finance.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx` (summary section)

---

## Task 1: `summarizeInvoices` pure aggregator + unit test

**Files:** Create `finance-summary.util.ts` + `.spec.ts`

- [ ] **Step 1: Failing test** — `apps/api/src/modules/fees/finance-summary.util.spec.ts`:
```ts
import { summarizeInvoices } from "./finance-summary.util";

const NOW = new Date("2026-06-16T00:00:00Z");
const past = new Date("2026-06-15T00:00:00Z");
const future = new Date("2026-07-01T00:00:00Z");

describe("summarizeInvoices", () => {
  const rows = [
    { classLevelId: "l1", classLevelName: "JSS1", totalKobo: 6000000, paidKobo: 6000000, dueDate: past },   // PAID
    { classLevelId: "l1", classLevelName: "JSS1", totalKobo: 6000000, paidKobo: 2000000, dueDate: past },   // OVERDUE (bal 4,000,000)
    { classLevelId: "l2", classLevelName: "JSS2", totalKobo: 5000000, paidKobo: 0, dueDate: future },        // UNPAID (not overdue)
  ];

  it("totals expected/collected/outstanding", () => {
    const s = summarizeInvoices(rows, NOW);
    expect(s.expectedKobo).toBe(17000000);
    expect(s.collectedKobo).toBe(8000000);
    expect(s.outstandingKobo).toBe(9000000);
  });
  it("overdue counts only past-due outstanding", () => {
    expect(summarizeInvoices(rows, NOW).overdueKobo).toBe(4000000); // only the partial-past-due row
  });
  it("groups by class level with student counts", () => {
    const s = summarizeInvoices(rows, NOW);
    const l1 = s.byClassLevel.find((g) => g.classLevelId === "l1")!;
    const l2 = s.byClassLevel.find((g) => g.classLevelId === "l2")!;
    expect(l1.expectedKobo).toBe(12000000);
    expect(l1.collectedKobo).toBe(8000000);
    expect(l1.outstandingKobo).toBe(4000000);
    expect(l1.studentCount).toBe(2);
    expect(l2.studentCount).toBe(1);
  });
  it("empty rows → zeros + empty breakdown", () => {
    const s = summarizeInvoices([], NOW);
    expect(s).toMatchObject({ expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, overdueKobo: 0, byClassLevel: [] });
  });
});
```

- [ ] **Step 2:** `cd apps/api && pnpm exec jest finance-summary.util` → FAIL.

- [ ] **Step 3: Implement `finance-summary.util.ts`:**
```ts
import { computeInvoiceStatus } from "./invoice-status.util";

export interface SummaryRow { classLevelId: string; classLevelName: string; totalKobo: number; paidKobo: number; dueDate: Date | null; }
export interface ClassLevelSummary { classLevelId: string; classLevelName: string; expectedKobo: number; collectedKobo: number; outstandingKobo: number; studentCount: number; }
export interface FinanceSummary { expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; byClassLevel: ClassLevelSummary[]; }

export function summarizeInvoices(rows: SummaryRow[], now: Date): FinanceSummary {
  let expectedKobo = 0, collectedKobo = 0, outstandingKobo = 0, overdueKobo = 0;
  const groups = new Map<string, ClassLevelSummary>();
  for (const r of rows) {
    const balance = r.totalKobo - r.paidKobo;
    expectedKobo += r.totalKobo;
    collectedKobo += r.paidKobo;
    outstandingKobo += balance;
    if (computeInvoiceStatus({ totalKobo: r.totalKobo, paidKobo: r.paidKobo, dueDate: r.dueDate, now }) === "OVERDUE") {
      overdueKobo += balance;
    }
    const g = groups.get(r.classLevelId) ?? { classLevelId: r.classLevelId, classLevelName: r.classLevelName, expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, studentCount: 0 };
    g.expectedKobo += r.totalKobo;
    g.collectedKobo += r.paidKobo;
    g.outstandingKobo += balance;
    g.studentCount += 1;
    groups.set(r.classLevelId, g);
  }
  const byClassLevel = [...groups.values()].sort((a, b) => a.classLevelName.localeCompare(b.classLevelName));
  return { expectedKobo, collectedKobo, outstandingKobo, overdueKobo, byClassLevel };
}
```

- [ ] **Step 4:** `pnpm exec jest finance-summary.util` → PASS (4). typecheck clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees/finance-summary.util.ts apps/api/src/modules/fees/finance-summary.util.spec.ts
git commit -m "feat(fees): summarizeInvoices aggregator (expected/collected/outstanding/overdue + by-class)"
```

---

## Task 2: finance service + controller + e2e

**Files:** Create `finance.service.ts`, `finance.controller.ts`; modify `fees.module.ts`, create `test/finance.e2e-spec.ts`

- [ ] **Step 1: Failing e2e** — `test/finance.e2e-spec.ts` (service-level; two-school bootstrap). Seed a term with invoices across 2 class levels + a recent SUCCESS Payment + an old one. Get `FinanceService` via `moduleRef.get`. Tests:
```ts
  describe("finance", () => {
    let termId: string;
    const NOWISH = new Date();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "FinYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const l1 = await prisma.classLevel.create({ data: { schoolId, name: `FinJSS1-${suffix}`, order: 1 } });
      const l2 = await prisma.classLevel.create({ data: { schoolId, name: `FinJSS2-${suffix}`, order: 2 } });
      const mk = async (lvlId: string, total: number, paid: number, due: Date | null, label: string) => {
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
        return prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId, classLevelId: lvlId, totalKobo: total, paidKobo: paid, dueDate: due } });
      };
      const past = new Date(Date.now() - 24 * 3600 * 1000);
      const inv1 = await mk(l1.id, 6000000, 6000000, past, "F1"); // PAID, JSS1
      const inv2 = await mk(l1.id, 6000000, 2000000, past, "F2"); // OVERDUE bal 4,000,000, JSS1
      await mk(l2.id, 5000000, 0, new Date(Date.now() + 7 * 24 * 3600 * 1000), "F3"); // UNPAID not overdue, JSS2
      // Payments: one recent SUCCESS (counts this week), one old SUCCESS (does not)
      await prisma.payment.create({ data: { schoolId, invoiceId: inv1.id, amountKobo: 6000000, channel: "CASH", reference: `FINR-${suffix}`, status: "SUCCESS", paidAt: NOWISH, recordedBy: "x" } });
      await prisma.payment.create({ data: { schoolId, invoiceId: inv2.id, amountKobo: 2000000, channel: "CASH", reference: `FINO-${suffix}`, status: "SUCCESS", paidAt: eightDaysAgo, recordedBy: "x" } });
    });

    it("summarizes the term's finances", async () => {
      const s = await asA(() => finance.getFinanceSummary(termId));
      expect(s.expectedKobo).toBe(17000000);
      expect(s.collectedKobo).toBe(8000000);
      expect(s.outstandingKobo).toBe(9000000);
      expect(s.overdueKobo).toBe(4000000);
      expect(s.collectedThisWeekKobo).toBe(6000000); // only the recent payment
      expect(s.byClassLevel.length).toBe(2);
      const jss1 = s.byClassLevel.find((g) => g.classLevelName.startsWith("FinJSS1"))!;
      expect(jss1.studentCount).toBe(2);
      expect(jss1.outstandingKobo).toBe(4000000);
    });

    it("rejects a foreign term", async () => {
      await expect(asB(() => finance.getFinanceSummary(termId))).rejects.toThrow(NotFoundException);
    });
  });
```
Add `finance` (FinanceService) handle; import it + `NotFoundException`; use the real school-B id var. Mock provider active (irrelevant — no provider calls here). NOTE: the test creates Payments directly (channel CASH, status SUCCESS) with controlled `paidAt`.

- [ ] **Step 2:** Run e2e → FAIL (service missing).

- [ ] **Step 3: Implement `finance.service.ts`:**
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { summarizeInvoices, type SummaryRow } from "./finance-summary.util";

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async getFinanceSummary(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");

    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: { classLevel: { select: { name: true } } },
    });
    const rows: SummaryRow[] = invoices.map((i) => ({
      classLevelId: i.classLevelId,
      classLevelName: i.classLevel.name,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      dueDate: i.dueDate,
    }));
    const summary = summarizeInvoices(rows, new Date());

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const agg = await this.prisma.payment.aggregate({
      where: { schoolId, status: "SUCCESS", paidAt: { gte: weekAgo }, invoice: { termId } },
      _sum: { amountKobo: true },
    });
    return { ...summary, collectedThisWeekKobo: agg._sum.amountKobo ?? 0 };
  }
}
```
Verify `payment.aggregate` with a relation filter `invoice: { termId }` typechecks (Prisma supports relation filters in `where`); if not, fetch matching payments + sum in JS.

- [ ] **Step 4: `finance.controller.ts`** (mirror release.controller guard imports):
```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { FinanceService } from "./finance.service";

@Controller("v1/fees/finance")
export class FinanceController {
  constructor(private service: FinanceService) {}

  @Get("summary")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  summary(@Query("termId") termId: string) {
    return this.service.getFinanceSummary(termId);
  }
}
```

- [ ] **Step 5: Register** `FinanceService` (providers) + `FinanceController` (controllers) in `fees.module.ts`.

- [ ] **Step 6:** Run e2e → finance tests + full suite green. Build + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees/finance.service.ts apps/api/src/modules/fees/finance.controller.ts apps/api/src/modules/fees/fees.module.ts apps/api/test/finance.e2e-spec.ts
git commit -m "feat(fees): finance summary endpoint (term KPIs + collected-this-week + by-class)"
```

---

## Task 3: Web — `/fees` finance summary section

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx`

- [ ] **Step 1: api client** — type + method:
```ts
export interface FinanceSummary {
  expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; collectedThisWeekKobo: number;
  byClassLevel: Array<{ classLevelId: string; classLevelName: string; expectedKobo: number; collectedKobo: number; outstandingKobo: number; studentCount: number }>;
}
```
```ts
  getFinanceSummary: (termId: string) => authedRequest<FinanceSummary>(`/v1/fees/finance/summary?termId=${termId}`),
```

- [ ] **Step 2: Summary section** at the top of `apps/web/src/app/(app)/fees/page.tsx` (above the collections table). On term change, `getFinanceSummary(termId)` → render:
  - **KPI cards** (a responsive row of small cards): Expected, Collected, Outstanding, **Overdue** (error tone/red), Collected this week — each value via `formatMoney(kobo, currency)` (the page's currency, default "NGN"), with a caption label. Use the design-system `Card`/`CardBody` if present (the dashboard page uses `Card`), else simple token-styled divs.
  - **By-class-level table:** Class level · Expected · Collected · Outstanding · Students (amounts via `formatMoney`). 
  - Loading skeleton/Spinner + empty state (all zeros → show the cards with ₦0.00; empty byClassLevel → a muted "No invoices for this term yet.").
  Keep the existing collections table + reconcile + payment actions below, intact.

- [ ] **Step 3: Verify (no dev server):** `pnpm --filter @mymakaranta/web typecheck` + `lint` + `build`. `/fees` builds. Reconcile `Card`/tokens against the dashboard + fees pages.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/fees/page.tsx"
git commit -m "feat(fees): /fees finance summary cards + by-class breakdown"
```

---

## Task 4: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject). Start API + web. Log in as the QA proprietor (`+2348033344455`, "S3 Gradebook QA"). On `/fees` for the current term, confirm the **finance summary** shows figures consistent with the collections data (Ada/Bola invoices — both PAID after slice-3b QA, so Collected should equal Expected, Outstanding/Overdue ₦0; if you want non-zero overdue, set a fresh invoice's due date in the past / leave one unpaid). Confirm the **by-class-level** row (JSS1) sums correctly + studentCount. Cross-check `GET /v1/fees/finance/summary?termId=`. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 3c (finance summary) built + QA'd; **Sprint 4 slice 3 (collections) complete (3a+3b+3c)**; remaining slice 4 (parent self-serve pay). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-finance-reports` → main per the user's choice).

---

## Notes for the implementer
- **Read-only** — no mutation, no model, no migration. The aggregator is pure (reuses `computeInvoiceStatus`); the service adds one Payment `_sum` for the week window.
- **Explicit `schoolId`** on the term + invoice reads; the Payment aggregate scopes by `{ schoolId, ..., invoice: { termId } }`.
- **collected-this-week** = SUCCESS payments with `paidAt >= now − 7d` for invoices in the term; the old payment in the e2e must NOT be counted.
- **`noUncheckedIndexedAccess`** — `byClassLevel.find(...)!` in tests; `agg._sum.amountKobo ?? 0`.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **Tokens/ui** — reuse `Card`/`CardBody` (dashboard) + `formatMoney`; reconcile per prior slices.
