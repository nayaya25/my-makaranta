# Overdue & Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bursar collections list (who owes what, overdue first) from per-invoice due dates + derived status, plus single/bulk reminders to a student's guardians (SMS + email) with an audit log.

**Architecture:** Adds `Invoice.dueDate` + a `FeeReminder` model + a pure `computeInvoiceStatus` helper + a `collections.service` (in the fees module) that fans reminders out via the existing `SmsService` + `EMAIL_SERVICE`. Web extends `/fees`.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e + jest unit + vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-sprint-4-slice-3a-overdue-reminders-design.md`

**Branch:** `sprint-4-collections` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping on every read/delete + create incl. inside `$transaction`; IDOR via tenant-scoped `findFirst`; e2e service-level inside `TenantContext.run` (model on `assessment.e2e-spec.ts`); ids cuids; money kobo Int; `noUncheckedIndexedAccess`. Reuse `InvoiceStatus` enum (`UNPAID|PARTIAL|PAID|OVERDUE`). `fees.view`/`fees.manage` seeded. `SmsService.send(phone, msg)`; `EMAIL_SERVICE` token → `.send({to,subject,html,text?})`.

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (Invoice.dueDate + FeeReminder), `prisma.service.ts` (TENANT_MODELS), new migrations
- Create: `apps/api/src/modules/fees/invoice-status.util.ts` + `.spec.ts`, `collections.service.ts`, `collections.controller.ts`
- Modify: `apps/api/src/modules/fees/fees.module.ts` (register + import SmsService/email), `fees.service.ts` (optional dueDate on generate), `test/` (collections e2e)
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx`

---

## Task 1: `Invoice.dueDate` + `FeeReminder` model + migration

**Files:** Modify `schema.prisma`, `prisma.service.ts`

- [ ] **Step 1:** Add `dueDate DateTime?` to the `Invoice` model (anywhere in its field list, e.g. after `paidKobo`). Add a back-relation `reminders FeeReminder[]` to `Invoice`. Add the new model (after the fee models):
```prisma
model FeeReminder {
  id             String   @id @default(cuid())
  schoolId       String
  school         School   @relation(fields: [schoolId], references: [id])
  invoiceId      String
  invoice        Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  sentBy         String
  sentAt         DateTime @default(now())
  recipientCount Int
  channels       String

  @@index([schoolId, invoiceId])
}
```
Add `feeReminders FeeReminder[]` to `School`.

- [ ] **Step 2:** In `prisma.service.ts` `TENANT_MODELS`, add `"FeeReminder"`.

- [ ] **Step 3: Migrate:** `cd apps/api && pnpm exec prisma migrate dev --name overdue_reminders` → applied. (EPERM engine lock is a known non-blocking issue.)

- [ ] **Step 4:** `pnpm exec prisma validate` + `pnpm --filter @mymakaranta/api typecheck` → clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(fees): Invoice.dueDate + FeeReminder model"
```

---

## Task 2: RLS migration for `FeeReminder`

**Files:** Create `apps/api/prisma/migrations/<ts>_rls_fee_reminder/migration.sql`

- [ ] **Step 1:** `cd apps/api && pnpm exec prisma migrate dev --create-only --name rls_fee_reminder`.
- [ ] **Step 2:** Replace `migration.sql` with (mirror `rls_fees`):
```sql
-- Defense-in-depth tenant isolation for FeeReminder.
ALTER TABLE "FeeReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeReminder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FeeReminder";
CREATE POLICY tenant_isolation ON "FeeReminder"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "FeeReminder" TO mymakaranta_app;
```
- [ ] **Step 3:** `pnpm exec prisma migrate dev` → applied; `migrate status` up to date.
- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/migrations
git commit -m "feat(fees): RLS (FORCE) for FeeReminder"
```

---

## Task 3: `computeInvoiceStatus` pure helper (unit-tested)

**Files:** Create `apps/api/src/modules/fees/invoice-status.util.ts` + `.spec.ts`

- [ ] **Step 1: Failing test** — `invoice-status.util.spec.ts`:
```ts
import { InvoiceStatus } from "@prisma/client";
import { computeInvoiceStatus } from "./invoice-status.util";

const D = (s: string) => new Date(s);
const NOW = D("2026-06-16T00:00:00Z");

describe("computeInvoiceStatus", () => {
  it("PAID when paid >= total", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 1000, dueDate: D("2020-01-01"), now: NOW })).toBe(InvoiceStatus.PAID);
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 1200, dueDate: null, now: NOW })).toBe(InvoiceStatus.PAID);
  });
  it("OVERDUE when outstanding and past due date", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: D("2026-06-15T00:00:00Z"), now: NOW })).toBe(InvoiceStatus.OVERDUE);
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: D("2026-06-15T00:00:00Z"), now: NOW })).toBe(InvoiceStatus.OVERDUE);
  });
  it("PARTIAL when some paid, not past due", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: D("2026-07-01T00:00:00Z"), now: NOW })).toBe(InvoiceStatus.PARTIAL);
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: null, now: NOW })).toBe(InvoiceStatus.PARTIAL);
  });
  it("UNPAID when nothing paid, not past due", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: null, now: NOW })).toBe(InvoiceStatus.UNPAID);
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: D("2026-07-01T00:00:00Z"), now: NOW })).toBe(InvoiceStatus.UNPAID);
  });
  it("dueDate exactly == now is NOT overdue", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: NOW, now: NOW })).toBe(InvoiceStatus.UNPAID);
  });
});
```

- [ ] **Step 2:** `cd apps/api && pnpm exec jest invoice-status.util` → FAIL.

- [ ] **Step 3: Implement `invoice-status.util.ts`:**
```ts
import { InvoiceStatus } from "@prisma/client";

export function computeInvoiceStatus(args: { totalKobo: number; paidKobo: number; dueDate: Date | null; now: Date }): InvoiceStatus {
  if (args.paidKobo >= args.totalKobo) return InvoiceStatus.PAID;
  if (args.dueDate && args.dueDate.getTime() < args.now.getTime()) return InvoiceStatus.OVERDUE;
  if (args.paidKobo > 0) return InvoiceStatus.PARTIAL;
  return InvoiceStatus.UNPAID;
}
```

- [ ] **Step 4:** `pnpm exec jest invoice-status.util` → PASS (5). typecheck clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees/invoice-status.util.ts apps/api/src/modules/fees/invoice-status.util.spec.ts
git commit -m "feat(fees): computeInvoiceStatus (derived overdue/partial/paid)"
```

---

## Task 4: collections service + controller + e2e

**Files:** Create `collections.service.ts`, `collections.controller.ts`; modify `fees.module.ts`, `fees.service.ts`, create `test/collections.e2e-spec.ts`

- [ ] **Step 1: Optional dueDate on generation.** In `fees.service.ts` `generateInvoices`, add an optional `dueDate?: Date` param; include `dueDate` in the invoice `create` data and the `update` data (so re-generation can re-stamp). Default `undefined` keeps current behavior. (Small, additive.)

- [ ] **Step 2: Failing e2e** — `test/collections.e2e-spec.ts` (service-level; replicate the two-school bootstrap). Build a school-A fixture: academic year + term, a class level, an invoice for a student with `totalKobo` and 2 guardians→parents (one parent with email). Get `CollectionsService` via `moduleRef.get`. Tests:
```ts
  describe("collections", () => {
    let termId: string; let invoiceId: string; let studentId: string;
    const actor = { id: "bursar-1", phone: "+2348092000001", schoolId, identityType: "PROPRIETOR" };

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "ColYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `CJSS1-${suffix}`, order: 1 } });
      const stu = await prisma.student.create({ data: { schoolId, admissionNo: `C-${suffix}`, firstName: "Coll", lastName: "Ect", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      studentId = stu.id;
      const inv = await prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId: term.id, classLevelId: lvl.id, totalKobo: 5000000, paidKobo: 1000000 } });
      invoiceId = inv.id;
      const p1 = await prisma.parent.create({ data: { schoolId, phone: "+2348092000010", email: "g1@e.test", firstName: "Gua", lastName: "One" } });
      const p2 = await prisma.parent.create({ data: { schoolId, phone: "+2348092000011", firstName: "Gua", lastName: "Two" } });
      await prisma.guardian.create({ data: { studentId: stu.id, parentId: p1.id, relationship: "FATHER", isPrimary: true } });
      await prisma.guardian.create({ data: { studentId: stu.id, parentId: p2.id, relationship: "MOTHER" } });
    });

    it("bulk-sets the due date for the term's invoices", async () => {
      const r = await asA(() => collections.setDueDate(termId, new Date("2025-10-01T00:00:00Z")));
      expect(r.updated).toBe(1);
    });

    it("reports OVERDUE for an outstanding invoice past its due date, sorted overdue-first", async () => {
      const rows = await asA(() => collections.getCollections(termId));
      const row = rows.find((x) => x.studentId === studentId)!;
      expect(row.status).toBe("OVERDUE"); // due 2025-10-01 < now, balance 4,000,000
      expect(row.balanceKobo).toBe(4000000);
      expect(rows[0]!.status).toBe("OVERDUE"); // overdue sorted first
    });

    it("sends a reminder to all guardians' parents and logs it", async () => {
      const r = await asA(() => collections.sendReminder(invoiceId, actor));
      expect(r.recipientCount).toBe(2); // both parents have phones
      const rows = await asA(() => collections.getCollections(termId));
      expect(rows.find((x) => x.studentId === studentId)!.lastRemindedAt).toBeTruthy();
      const log = await prisma.feeReminder.findFirst({ where: { schoolId, invoiceId } });
      expect(log!.recipientCount).toBe(2);
      expect(log!.channels).toContain("sms");
    });

    it("rejects a reminder on a settled invoice", async () => {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { paidKobo: 5000000 } });
      await expect(asA(() => collections.sendReminder(invoiceId, actor))).rejects.toThrow(BadRequestException);
      await prisma.invoice.update({ where: { id: invoiceId }, data: { paidKobo: 1000000 } }); // restore
    });

    it("bulk-reminds all outstanding invoices for the term", async () => {
      const r = await asA(() => collections.sendBulkReminders(termId, actor));
      expect(r.remindersSent).toBeGreaterThanOrEqual(1);
      expect(r.totalRecipients).toBeGreaterThanOrEqual(2);
    });

    it("rejects cross-tenant collections + reminder", async () => {
      await expect(asB(() => collections.getCollections(termId))).rejects.toThrow(NotFoundException);
      await expect(asB(() => collections.sendReminder(invoiceId, { ...actor, schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
    });
  });
```
Add `collections` handle; import `CollectionsService`, `BadRequestException`/`NotFoundException`; use the real school-B id var. (Confirm `GuardianRelation` enum values `FATHER`/`MOTHER` exist — check the schema; adjust if different.)

- [ ] **Step 3:** Run e2e → FAIL (service missing).

- [ ] **Step 4: Implement `collections.service.ts`:**
```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { EMAIL_SERVICE, type EmailService } from "../../core/email/email.types";
import { computeInvoiceStatus } from "./invoice-status.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

function naira(kobo: number): string {
  return `₦${new Intl.NumberFormat("en-NG").format(Math.round(kobo / 100))}`;
}

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    @Inject(EMAIL_SERVICE) private email: EmailService,
  ) {}

  private async termOr404(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: { select: { name: true } } } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    return term;
  }

  async setDueDate(termId: string, dueDate: Date) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const r = await this.prisma.invoice.updateMany({ where: { schoolId, termId }, data: { dueDate } });
    return { updated: r.count };
  }

  async getCollections(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        reminders: { orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } },
      },
    });
    const rows = invoices.map((i) => ({
      studentId: i.studentId,
      name: `${i.student.firstName} ${i.student.lastName}`,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      status: computeInvoiceStatus({ totalKobo: i.totalKobo, paidKobo: i.paidKobo, dueDate: i.dueDate, now }),
      lastRemindedAt: i.reminders[0]?.sentAt.toISOString() ?? null,
    }));
    const rank = (s: string) => (s === "OVERDUE" ? 0 : 1);
    rows.sort((a, b) => rank(a.status) - rank(b.status) || b.balanceKobo - a.balanceKobo);
    return rows;
  }

  async sendReminder(invoiceId: string, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found in this school.");
    const balance = invoice.totalKobo - invoice.paidKobo;
    if (balance <= 0) throw new BadRequestException("Nothing outstanding on this invoice.");

    const guardians = await this.prisma.guardian.findMany({
      where: { studentId: invoice.student.id },
      include: { parent: { select: { phone: true, email: true } } },
    });
    const termLabel = `${invoice.term.academicYear.name} · Term ${invoice.term.number}`;
    const msg = `Dear Parent, ${invoice.student.firstName} ${invoice.student.lastName}'s ${termLabel} fees balance is ${naira(balance)}. Kindly settle it. Thank you.`;
    const channels = new Set<string>();
    let recipientCount = 0;
    for (const g of guardians) {
      try {
        await this.sms.send(g.parent.phone, msg);
        channels.add("sms");
        recipientCount++;
      } catch { /* per-recipient failure is non-fatal */ }
      if (g.parent.email) {
        try {
          await this.email.send({ to: g.parent.email, subject: `Fees reminder — ${termLabel}`, html: `<p>${msg}</p>`, text: msg });
          channels.add("email");
        } catch { /* non-fatal */ }
      }
    }
    await this.prisma.feeReminder.create({ data: { schoolId, invoiceId, sentBy: actor.id, recipientCount, channels: [...channels].join(",") } });
    return { recipientCount };
  }

  async sendBulkReminders(termId: string, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const invoices = await this.prisma.invoice.findMany({ where: { schoolId, termId }, select: { id: true, totalKobo: true, paidKobo: true } });
    let remindersSent = 0, totalRecipients = 0;
    for (const i of invoices) {
      if (i.totalKobo - i.paidKobo <= 0) continue;
      const r = await this.sendReminder(i.id, actor);
      remindersSent++;
      totalRecipients += r.recipientCount;
    }
    return { remindersSent, totalRecipients };
  }
}
```
Verify `EMAIL_SERVICE`/`EmailService` import path (`../../core/email/email.types`), `SmsService` path, `Guardian.parent` relation, and `GuardianRelation` values. Fix if different.

- [ ] **Step 5: `collections.controller.ts`** (mirror release.controller guard imports):
```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsNotEmpty, IsString } from "class-validator";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { CollectionsService } from "./collections.service";

class SetDueDateDto { @IsString() @IsNotEmpty() termId!: string; @IsDateString() dueDate!: string; }
class RemindDto { @IsString() @IsNotEmpty() invoiceId!: string; }
class BulkRemindDto { @IsString() @IsNotEmpty() termId!: string; }

@Controller("v1/fees/collections")
export class CollectionsController {
  constructor(private service: CollectionsService) {}

  @Get() @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.view")
  list(@Query("termId") termId: string) { return this.service.getCollections(termId); }

  @Post("due-date") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  setDueDate(@Body() dto: SetDueDateDto) { return this.service.setDueDate(dto.termId, new Date(dto.dueDate)); }

  @Post("remind") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  remind(@Body() dto: RemindDto, @CurrentUser() user: RequestUser) { return this.service.sendReminder(dto.invoiceId, user); }

  @Post("remind-all") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  remindAll(@Body() dto: BulkRemindDto, @CurrentUser() user: RequestUser) { return this.service.sendBulkReminders(dto.termId, user); }
}
```

- [ ] **Step 6: Register** in `fees.module.ts`: add `CollectionsService` to providers + `CollectionsController` to controllers. `fees.module` already imports `AuthModule` (which exports `SmsService`); `EMAIL_SERVICE` is `@Global`. Confirm `SmsService` is exported by `AuthModule` (it is — used by auth); if not exported, export it.

- [ ] **Step 7:** Run e2e → all `collections` tests + full suite green. Build + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees apps/api/test/collections.e2e-spec.ts
git commit -m "feat(fees): collections list (derived status) + single/bulk reminders"
```

---

## Task 5: Web — `/fees` collections (status, due date, reminders)

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx`

- [ ] **Step 1: api client** — types + methods:
```ts
export interface CollectionRow {
  studentId: string; name: string; totalKobo: number; paidKobo: number; balanceKobo: number;
  dueDate: string | null; status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE"; lastRemindedAt: string | null;
}
```
```ts
  getCollections: (termId: string) => authedRequest<CollectionRow[]>(`/v1/fees/collections?termId=${termId}`),
  setDueDate: (termId: string, dueDate: string) =>
    authedRequest<{ updated: number }>("/v1/fees/collections/due-date", { method: "POST", body: JSON.stringify({ termId, dueDate }) }),
  remindInvoice: (invoiceId: string) =>
    authedRequest<{ recipientCount: number }>("/v1/fees/collections/remind", { method: "POST", body: JSON.stringify({ invoiceId }) }),
  remindAllOverdue: (termId: string) =>
    authedRequest<{ remindersSent: number; totalRecipients: number }>("/v1/fees/collections/remind-all", { method: "POST", body: JSON.stringify({ termId }) }),
```
NOTE: `remindInvoice` needs the invoice `id`. `CollectionRow` is keyed by `studentId`, not invoice id. Options: (a) add `invoiceId` to the `CollectionRow` payload (1 line in the service map: `invoiceId: i.id`) + the type — DO THIS; reminders need it. Add `id`/`invoiceId` to the service's `getCollections` row + `CollectionRow`.

- [ ] **Step 2: `/fees` collections UI.** In `apps/web/src/app/(app)/fees/page.tsx`, switch the invoices table to `getCollections` data (or add a collections section). Show columns: Student · Status badge (UNPAID grey, PARTIAL, PAID success, **OVERDUE error**) · Due date · Balance (`formatMoney`) · Last reminded · a **Remind** button per outstanding row. Add a **Set due date** control (a date input + button → `setDueDate(termId, isoDate)` → reload) and a **Remind all overdue** button (→ `remindAllOverdue(termId)` → toast `{remindersSent,totalRecipients}` → reload). Sort comes from the API (overdue-first). Keep the existing invoice detail/payment actions (slice 2) working — `getInvoiceDetail`/payment still keyed by studentId+termId; the collections row now carries `invoiceId` for the Remind call. Loading/empty states.

- [ ] **Step 3: Verify (no dev server):** `pnpm --filter @mymakaranta/web typecheck` + `lint` + `build`. `/fees` builds. Reconcile `Badge` tones (`success`/`warning`/`error`/neutral — confirm real tone names) + tokens.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/fees/page.tsx"
git commit -m "feat(fees): collections view — status badges, due date, reminders"
```

---

## Task 6: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject; one bash call per sequence). Start API + web. Log in as the QA proprietor (`+2348033344455`, school "S3 Gradebook QA", JSS1 invoices). On `/fees`: **Set due date** to a PAST date for the current term → the rows flip to **OVERDUE** badges (Ada/Bola, who still owe). Click **Remind** on a student → toast shows recipient count (mock SMS lines appear in the api log; if the seeded students have no guardians, the count may be 0 — seed a guardian+parent via the API or note it). **Remind all overdue** → summary. Confirm **Last reminded** updates. Cross-check `GET /v1/fees/collections?termId=` shows statuses + lastRemindedAt. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored). (If the QA students lack guardians, recipientCount=0 is correct behavior — verify the FeeReminder still logs + lastReminded shows; optionally seed a parent+guardian to see a non-zero count.)

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 3a (overdue + reminders) built + QA'd; remaining 3b (bank-CSV reconciliation) + 3c (finance reports) + slice 4 (parent pay). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-collections` → main per the user's choice).

---

## Notes for the implementer
- **Status is derived on read** — never store it; `computeInvoiceStatus` is the single source.
- **Explicit `schoolId`** on every read/create incl. the `FeeReminder` create + the `updateMany` in `setDueDate`. `Guardian` has no `schoolId` (gate via the tenant-scoped invoice → student → guardians; the student is already this tenant's).
- **Per-recipient failure isolation** — a failing SMS/email send must not abort the reminder or a bulk run; catch per recipient.
- **`recipientCount`** counts parents successfully SMS'd; `channels` records which channels fired (`sms`, `email`). Zero guardians → 0, still logs.
- **Add `invoiceId` (`id`) to the `getCollections` row** so the web Remind button can target it.
- **Reuse `InvoiceStatus`** enum; don't invent a status type.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **Tokens/ui** — reconcile against existing pages (`bg-paper`/`text-brand-500`/`text-caption` real; `bg-canvas`/`text-brand-600` not). Confirm `Badge` tone names.
