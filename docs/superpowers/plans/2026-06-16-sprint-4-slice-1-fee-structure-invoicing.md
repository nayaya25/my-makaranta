# Fee Structure & Invoicing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bursar defines per-(class-level, term) fee items and bulk-generates a frozen, idempotent invoice per enrolled student, each with a balance.

**Architecture:** New `apps/api/src/modules/fees/` module with three tenant-scoped models (`FeeItem`, `Invoice`, `InvoiceLine`), a fees service/controller (replace-as-unit structure config + idempotent snapshot generation + reads), and web (Settings → Fees config + `/fees` bursar page). Money = kobo integers; display via a `formatMoney` web helper using `School.currency`.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e (service-level) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-sprint-4-slice-1-fee-structure-invoicing-design.md`

**Branch:** `sprint-4-fees-invoicing` (already created).

**KEY CONVENTIONS (slices so far):** explicitly scope every read/delete by `schoolId` via `TenantContext.schoolIdOrThrow()` + `where:{schoolId}` — middleware does NOT inject inside `$transaction` or service-level e2e; set `schoolId` on every create incl. inside `$transaction`; validate request ids via tenant-scoped `findFirst` (IDOR); `Enrollment` has no `schoolId` (gate via the class's `schoolId`); e2e is service-level inside `TenantContext.run` (model on `apps/api/test/assessment.e2e-spec.ts`); ids are cuids; `noUncheckedIndexedAccess` (`?.`/`!`). Permissions `fees.view` + `fees.manage` are already seeded. Replace-as-unit + snapshot patterns mirror the assessment module.

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (3 models + back-relations), `apps/api/src/core/prisma/prisma.service.ts` (TENANT_MODELS), new migrations
- Create: `apps/api/src/modules/fees/fees.service.ts`, `fees.controller.ts`, `fees.module.ts`, `dto/fees.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `FeesModule`), `apps/api/test/` (new `fees.e2e-spec.ts`)
- Create: `apps/web/src/lib/money.ts` + `money.test.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx` (nav)
- Create: `apps/web/src/app/(app)/fees/page.tsx`, `apps/web/src/app/(app)/settings/fees/page.tsx`

---

## Task 1: Models + TENANT_MODELS + migration

**Files:** Modify `schema.prisma`, `prisma.service.ts`

- [ ] **Step 1: Add models** to `schema.prisma` (after the last model):
```prisma
model FeeItem {
  id           String     @id @default(cuid())
  schoolId     String
  school       School     @relation(fields: [schoolId], references: [id])
  classLevelId String
  classLevel   ClassLevel @relation(fields: [classLevelId], references: [id])
  termId       String
  term         Term       @relation(fields: [termId], references: [id])
  name         String
  amountKobo   Int
  order        Int        @default(0)

  @@unique([classLevelId, termId, name])
  @@index([schoolId, classLevelId, termId])
}

model Invoice {
  id           String        @id @default(cuid())
  schoolId     String
  school       School        @relation(fields: [schoolId], references: [id])
  studentId    String
  student      Student       @relation(fields: [studentId], references: [id])
  termId       String
  term         Term          @relation(fields: [termId], references: [id])
  classLevelId String
  classLevel   ClassLevel    @relation(fields: [classLevelId], references: [id])
  totalKobo    Int
  paidKobo     Int           @default(0)
  issuedAt     DateTime      @default(now())
  lines        InvoiceLine[]

  @@unique([studentId, termId])
  @@index([schoolId, termId])
}

model InvoiceLine {
  id         String  @id @default(cuid())
  schoolId   String
  school     School  @relation(fields: [schoolId], references: [id])
  invoiceId  String
  invoice    Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  name       String
  amountKobo Int

  @@index([schoolId, invoiceId])
}
```

- [ ] **Step 2: Back-relations** — `School`: `feeItems FeeItem[]`, `invoices Invoice[]`, `invoiceLines InvoiceLine[]`; `ClassLevel`: `feeItems FeeItem[]`, `invoices Invoice[]`; `Term`: `feeItems FeeItem[]`, `invoices Invoice[]`; `Student`: `invoices Invoice[]`.

- [ ] **Step 3:** In `prisma.service.ts`, add `"FeeItem"`, `"Invoice"`, `"InvoiceLine"` to `TENANT_MODELS`.

- [ ] **Step 4: Migrate** (from `apps/api`; stop any dev server first):
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta/apps/api" && pnpm exec prisma migrate dev --name fees_models
```
Expected: applied + "in sync". (A post-migrate `prisma generate` EPERM lock is a known non-blocking issue if it appears.)

- [ ] **Step 5:** `pnpm exec prisma validate` + `pnpm --filter @mymakaranta/api typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(fees): FeeItem/Invoice/InvoiceLine models + tenant scoping"
```

---

## Task 2: RLS migration for fees tables

**Files:** Create `apps/api/prisma/migrations/<ts>_rls_fees/migration.sql`

- [ ] **Step 1:** `cd apps/api && pnpm exec prisma migrate dev --create-only --name rls_fees`.

- [ ] **Step 2:** Replace the generated `migration.sql` with (mirror `rls_release`, one block per table — `FeeItem`, `Invoice`, `InvoiceLine`):
```sql
-- Defense-in-depth tenant isolation for fees tables.
ALTER TABLE "FeeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FeeItem";
CREATE POLICY tenant_isolation ON "FeeItem"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "FeeItem" TO mymakaranta_app;

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invoice";
CREATE POLICY tenant_isolation ON "Invoice"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Invoice" TO mymakaranta_app;

ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "InvoiceLine";
CREATE POLICY tenant_isolation ON "InvoiceLine"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "InvoiceLine" TO mymakaranta_app;
```
(Sanity-check against the most recent `*_rls_release`/`*_rls_correction` migration — same GUC/role/convention.)

- [ ] **Step 3:** `pnpm exec prisma migrate dev` → applied; `pnpm exec prisma migrate status` → up to date.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/migrations
git commit -m "feat(fees): RLS (FORCE) for fee tables"
```

---

## Task 3: fees service + controller + module + e2e

**Files:** Create `fees.service.ts`, `fees.controller.ts`, `fees.module.ts`, `dto/fees.dto.ts`; modify `app.module.ts`, create `test/fees.e2e-spec.ts`

- [ ] **Step 1: DTOs** — `apps/api/src/modules/fees/dto/fees.dto.ts`:
```ts
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from "class-validator";

export class FeeItemInput {
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(0) amountKobo!: number;
  @IsInt() @Min(0) order!: number;
}

export class SetFeeItemsDto {
  @IsString() @IsNotEmpty() classLevelId!: string;
  @IsString() @IsNotEmpty() termId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FeeItemInput) items!: FeeItemInput[];
}

export class GenerateInvoicesDto {
  @IsString() @IsNotEmpty() termId!: string;
}
```
(Confirm `class-transformer` is available — it is used elsewhere for nested DTOs; if the codebase validates nested arrays differently, match that pattern. If `@Type` isn't used anywhere, a simpler manual validation in the service is acceptable — but keep `SetFeeItemsDto` typed.)

- [ ] **Step 2: Failing e2e** — `apps/api/test/fees.e2e-spec.ts` (service-level; model the bootstrap + tenant helpers on `assessment.e2e-spec.ts`: two schools A/B, `asA`/`asB` running inside `TenantContext.run`, a `prisma` handle, and a `FeesService` handle via `moduleRef.get`). Build fixtures: school A with an academic year + term, two class levels (JSS1 order 1, JSS2 order 2), a class per level, and 2 students enrolled (one per level). Then:
```ts
  describe("fees", () => {
    let termId: string; let jss1: string; let jss2: string;
    let clsJss1: string; let clsJss2: string; let stuA: string; let stuB: string;

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "FeeYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const l1 = await prisma.classLevel.create({ data: { schoolId, name: `FJSS1-${suffix}`, order: 1 } });
      const l2 = await prisma.classLevel.create({ data: { schoolId, name: `FJSS2-${suffix}`, order: 2 } });
      jss1 = l1.id; jss2 = l2.id;
      const c1 = await prisma.class.create({ data: { schoolId, classLevelId: l1.id, name: `FJSS1A-${suffix}` } });
      const c2 = await prisma.class.create({ data: { schoolId, classLevelId: l2.id, name: `FJSS2A-${suffix}` } });
      clsJss1 = c1.id; clsJss2 = c2.id;
      const s1 = await prisma.student.create({ data: { schoolId, admissionNo: `FA-${suffix}`, firstName: "Fee", lastName: "One", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      const s2 = await prisma.student.create({ data: { schoolId, admissionNo: `FB-${suffix}`, firstName: "Fee", lastName: "Two", gender: "FEMALE", dateOfBirth: new Date("2010-01-01") } });
      stuA = s1.id; stuB = s2.id;
      await prisma.enrollment.create({ data: { studentId: s1.id, classId: c1.id, termId: term.id } });
      await prisma.enrollment.create({ data: { studentId: s2.id, classId: c2.id, termId: term.id } });
    });

    it("sets fee items per class level + term (replace-as-unit)", async () => {
      await asA(() => fees.setFeeItems(jss1, termId, [
        { name: "Tuition", amountKobo: 5000000, order: 0 },
        { name: "Levy", amountKobo: 1000000, order: 1 },
      ]));
      await asA(() => fees.setFeeItems(jss2, termId, [{ name: "Tuition", amountKobo: 7000000, order: 0 }]));
      const items = await asA(() => fees.getFeeItems(jss1, termId));
      expect(items.map((i) => i.name)).toEqual(["Tuition", "Levy"]);
      // replace-as-unit: re-setting overwrites
      await asA(() => fees.setFeeItems(jss1, termId, [{ name: "Tuition", amountKobo: 5500000, order: 0 }]));
      const after = await asA(() => fees.getFeeItems(jss1, termId));
      expect(after).toHaveLength(1);
      expect(after[0]!.amountKobo).toBe(5500000);
      // restore two items for the generation tests
      await asA(() => fees.setFeeItems(jss1, termId, [
        { name: "Tuition", amountKobo: 5000000, order: 0 },
        { name: "Levy", amountKobo: 1000000, order: 1 },
      ]));
    });

    it("generates one frozen invoice per enrolled student with class-level totals", async () => {
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.created).toBe(2);
      const invA = await asA(() => fees.getInvoice(stuA, termId));
      expect(invA.totalKobo).toBe(6000000); // 50000 + 10000
      expect(invA.lines).toHaveLength(2);
      expect(invA.balanceKobo).toBe(6000000); // paid 0
      const invB = await asA(() => fees.getInvoice(stuB, termId));
      expect(invB.totalKobo).toBe(7000000);
    });

    it("is idempotent and refreshes unpaid invoices without duplicating", async () => {
      // edit structure, regenerate → unpaid invoice refreshes to new total
      await asA(() => fees.setFeeItems(jss2, termId, [{ name: "Tuition", amountKobo: 8000000, order: 0 }]));
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.created).toBe(0);
      expect(res.refreshed).toBe(2);
      const invB = await asA(() => fees.getInvoice(stuB, termId));
      expect(invB.totalKobo).toBe(8000000);
      const count = await prisma.invoice.count({ where: { schoolId, termId } });
      expect(count).toBe(2); // no duplicates
    });

    it("skips an invoice that already has a payment recorded", async () => {
      await prisma.invoice.updateMany({ where: { schoolId, studentId: stuA, termId }, data: { paidKobo: 100 } });
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.skipped).toBe(1);
      await prisma.invoice.updateMany({ where: { schoolId, studentId: stuA, termId }, data: { paidKobo: 0 } }); // restore
    });

    it("rejects cross-tenant structure + invoice reads", async () => {
      await expect(asB(() => fees.setFeeItems(jss1, termId, []))).rejects.toThrow(NotFoundException);
      await expect(asB(() => fees.getInvoice(stuA, termId))).rejects.toThrow(NotFoundException);
    });
  });
```
Add `let fees: FeesService;` + `fees = moduleRef.get(FeesService);` to the top-level beforeAll; import `FeesService` from `../src/modules/fees/fees.service` and ensure `NotFoundException` is imported. (`suffix`/`schoolId`/`asA`/`asB` come from the shared top-level setup — confirm names; if this file is standalone, replicate the two-school bootstrap from `assessment.e2e-spec.ts`.)

- [ ] **Step 3:** Run e2e → FAIL (FeesService missing).

- [ ] **Step 4: Implement `fees.service.ts`:**
```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { FeeItemInput } from "./dto/fees.dto";

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

  private async assertClassLevelTerm(schoolId: string, classLevelId: string, termId: string) {
    const [lvl, term] = await Promise.all([
      this.prisma.classLevel.findFirst({ where: { id: classLevelId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!lvl) throw new NotFoundException("Class level not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
  }

  async setFeeItems(classLevelId: string, termId: string, items: FeeItemInput[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);
    for (const it of items) {
      if (!it.name.trim()) throw new BadRequestException("Fee item name is required.");
      if (it.amountKobo < 0) throw new BadRequestException("Fee amount cannot be negative.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.feeItem.deleteMany({ where: { schoolId, classLevelId, termId } });
      if (items.length) {
        await tx.feeItem.createMany({
          data: items.map((it) => ({ schoolId, classLevelId, termId, name: it.name.trim(), amountKobo: it.amountKobo, order: it.order })),
        });
      }
    });
    return this.getFeeItems(classLevelId, termId);
  }

  async getFeeItems(classLevelId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);
    return this.prisma.feeItem.findMany({ where: { schoolId, classLevelId, termId }, orderBy: { order: "asc" } });
  }

  async generateInvoices(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");

    const enrollments = await this.prisma.enrollment.findMany({
      where: { termId, class: { schoolId } },
      select: { studentId: true, class: { select: { classLevelId: true } } },
    });
    const feeItems = await this.prisma.feeItem.findMany({ where: { schoolId, termId } });
    const itemsByLevel = new Map<string, { name: string; amountKobo: number }[]>();
    for (const fi of feeItems) {
      const arr = itemsByLevel.get(fi.classLevelId) ?? [];
      arr.push({ name: fi.name, amountKobo: fi.amountKobo });
      itemsByLevel.set(fi.classLevelId, arr);
    }
    const existing = await this.prisma.invoice.findMany({ where: { schoolId, termId }, select: { studentId: true, paidKobo: true } });
    const paidByStudent = new Map(existing.map((e) => [e.studentId, e.paidKobo]));

    let created = 0, refreshed = 0, skipped = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const e of enrollments) {
        const classLevelId = e.class.classLevelId;
        const lines = itemsByLevel.get(classLevelId) ?? [];
        const totalKobo = lines.reduce((s, l) => s + l.amountKobo, 0);
        const prevPaid = paidByStudent.get(e.studentId);
        if (prevPaid !== undefined && prevPaid > 0) { skipped++; continue; }

        const invoice = await tx.invoice.upsert({
          where: { studentId_termId: { studentId: e.studentId, termId } },
          create: { schoolId, studentId: e.studentId, termId, classLevelId, totalKobo },
          update: { classLevelId, totalKobo },
        });
        await tx.invoiceLine.deleteMany({ where: { schoolId, invoiceId: invoice.id } });
        if (lines.length) {
          await tx.invoiceLine.createMany({ data: lines.map((l) => ({ schoolId, invoiceId: invoice.id, name: l.name, amountKobo: l.amountKobo })) });
        }
        if (prevPaid === undefined) created++; else refreshed++;
      }
    });
    return { created, refreshed, skipped };
  }

  async getInvoices(termId: string, classId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    const studentFilter = classId
      ? { in: (await this.prisma.enrollment.findMany({ where: { termId, classId, class: { schoolId } }, select: { studentId: true } })).map((e) => e.studentId) }
      : undefined;
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId, ...(studentFilter ? { studentId: studentFilter } : {}) },
      include: { student: { select: { firstName: true, lastName: true } }, classLevel: { select: { name: true } } },
    });
    return invoices.map((i) => ({
      studentId: i.studentId,
      name: `${i.student.firstName} ${i.student.lastName}`,
      classLevelName: i.classLevel.name,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
    }));
  }

  async getInvoice(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({
      where: { schoolId, studentId, termId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        classLevel: { select: { name: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
        lines: true,
      },
    });
    if (!invoice) throw new NotFoundException("No invoice for this student/term.");
    return {
      student: { name: `${invoice.student.firstName} ${invoice.student.lastName}`, admissionNo: invoice.student.admissionNo },
      term: { label: `${invoice.term.academicYear.name} · Term ${invoice.term.number}` },
      classLevelName: invoice.classLevel.name,
      lines: invoice.lines.map((l) => ({ name: l.name, amountKobo: l.amountKobo })),
      totalKobo: invoice.totalKobo,
      paidKobo: invoice.paidKobo,
      balanceKobo: invoice.totalKobo - invoice.paidKobo,
    };
  }
}
```
Verify `TenantContext` path/method, `Enrollment.class.classLevelId` relation access, and the `studentId_termId` compound unique name against the generated client (Prisma names it from `@@unique([studentId, termId])` → `studentId_termId`). Fix if different.

- [ ] **Step 5: Implement `fees.controller.ts`** (mirror `release.controller.ts` guard/decorator import paths):
```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { FeesService } from "./fees.service";
import { SetFeeItemsDto, GenerateInvoicesDto } from "./dto/fees.dto";

@Controller("v1/fees")
export class FeesController {
  constructor(private service: FeesService) {}

  @Get("items")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  items(@Query("classLevelId") classLevelId: string, @Query("termId") termId: string) {
    return this.service.getFeeItems(classLevelId, termId);
  }

  @Post("items")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  setItems(@Body() dto: SetFeeItemsDto) {
    return this.service.setFeeItems(dto.classLevelId, dto.termId, dto.items);
  }

  @Post("generate")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.service.generateInvoices(dto.termId);
  }

  @Get("invoices")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  invoices(@Query("termId") termId: string, @Query("classId") classId?: string) {
    return this.service.getInvoices(termId, classId);
  }

  @Get("invoice")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  invoice(@Query("studentId") studentId: string, @Query("termId") termId: string) {
    return this.service.getInvoice(studentId, termId);
  }
}
```

- [ ] **Step 6: `fees.module.ts`** + register in `app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";

@Module({ imports: [AuthModule], controllers: [FeesController], providers: [FeesService] })
export class FeesModule {}
```
Add `FeesModule` to `app.module.ts` `imports`.

- [ ] **Step 7:** Run e2e → all `fees` tests + full suite green. `pnpm --filter @mymakaranta/api build` + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees apps/api/src/app.module.ts apps/api/test/fees.e2e-spec.ts
git commit -m "feat(fees): structure config + idempotent invoice generation + reads"
```

---

## Task 4: `formatMoney` web helper (unit-tested)

**Files:** Create `apps/web/src/lib/money.ts` + `money.test.ts`

- [ ] **Step 1: Failing test** — `apps/web/src/lib/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats NGN kobo as naira with thousands + 2dp", () => {
    expect(formatMoney(5000000, "NGN")).toBe("₦50,000.00");
  });
  it("formats zero", () => {
    expect(formatMoney(0, "NGN")).toBe("₦0.00");
  });
  it("falls back to the ISO code for unknown currencies", () => {
    expect(formatMoney(150000, "GHS")).toMatch(/^GHS\s?1,500\.00$/);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @mymakaranta/web exec vitest run money` → FAIL.

- [ ] **Step 3: Implement `money.ts`:**
```ts
const SYMBOLS: Record<string, string> = { NGN: "₦", GHS: "GH₵", KES: "KSh", ZAR: "R" };

/** Format an integer minor-unit (kobo) amount for display, e.g. 5000000 NGN → "₦50,000.00". */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  const num = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${num}` : `${currency} ${num}`;
}
```
(If the `GHS` test expects no space, align the test + impl — the regex `GHS\s?1,500\.00` allows either. Keep NGN as `₦50,000.00` exactly.)

- [ ] **Step 4:** `pnpm --filter @mymakaranta/web exec vitest run money` → PASS (3). typecheck clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/money.ts apps/web/src/lib/money.test.ts
git commit -m "feat(fees): formatMoney web helper (kobo → currency display)"
```

---

## Task 5: Web — api client + Settings → Fees + `/fees` page + nav

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`; create `settings/fees/page.tsx`, `fees/page.tsx`

- [ ] **Step 1: api client** — in `api.ts` add types + methods (match `authedRequest` style; `School.currency` — confirm the app already exposes the current school's currency, e.g. via `mm.user`/a school endpoint; if not, default to `"NGN"` in the page and note it):
```ts
export interface FeeItemRow { id: string; name: string; amountKobo: number; order: number; }
export interface InvoiceRow { studentId: string; name: string; classLevelName: string; totalKobo: number; paidKobo: number; balanceKobo: number; }
export interface InvoiceDetail {
  student: { name: string; admissionNo: string };
  term: { label: string };
  classLevelName: string;
  lines: Array<{ name: string; amountKobo: number }>;
  totalKobo: number; paidKobo: number; balanceKobo: number;
}
```
```ts
  getFeeItems: (classLevelId: string, termId: string) =>
    authedRequest<FeeItemRow[]>(`/v1/fees/items?classLevelId=${classLevelId}&termId=${termId}`),
  setFeeItems: (classLevelId: string, termId: string, items: Array<{ name: string; amountKobo: number; order: number }>) =>
    authedRequest<FeeItemRow[]>("/v1/fees/items", { method: "POST", body: JSON.stringify({ classLevelId, termId, items }) }),
  generateInvoices: (termId: string) =>
    authedRequest<{ created: number; refreshed: number; skipped: number }>("/v1/fees/generate", { method: "POST", body: JSON.stringify({ termId }) }),
  getInvoices: (termId: string, classId?: string) =>
    authedRequest<InvoiceRow[]>(`/v1/fees/invoices?termId=${termId}${classId ? `&classId=${classId}` : ""}`),
  getInvoiceDetail: (studentId: string, termId: string) =>
    authedRequest<InvoiceDetail>(`/v1/fees/invoice?studentId=${studentId}&termId=${termId}`),
```
Reuse the term-list pattern (`listAcademicYears`) + class-level/class list endpoints (confirm their existing client method names from the assessment Settings page).

- [ ] **Step 2: Nav** — in `layout.tsx`, add a lucide icon (e.g. `Wallet` or `Receipt`) import + a `NAV_ITEMS` entry `{ href: "/fees", label: "Fees", icon: Wallet }` (place after `/release`).

- [ ] **Step 3: Settings → Fees** — `apps/web/src/app/(app)/settings/fees/page.tsx` (`fees.manage`). Read `settings/assessment/page.tsx` for the panel/selector/save patterns. Class-level selector + term selector → editable list of fee items (name + amount-in-naira inputs; store as kobo = naira×100; show a running total via `formatMoney`); Save → `setFeeItems`. Load existing via `getFeeItems`. Empty/loading/error states. (Amount input UX: accept naira with 2dp, convert to kobo on save; display existing kobo as naira.)

- [ ] **Step 4: `/fees` page** — `apps/web/src/app/(app)/fees/page.tsx` (`fees.view`). Term selector → **Generate invoices** button (confirm dialog; calls `generateInvoices`, then refreshes; shows the `{created, refreshed, skipped}` summary as a toast/line). Table of `getInvoices`: student · class level · total · paid · **balance** (all via `formatMoney` with the school currency, default `"NGN"`). Row click → invoice detail (line items) in a panel/modal via `getInvoiceDetail`. Empty/loading states.

- [ ] **Step 5: Verify (no dev server running):**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; `/fees` + `/settings/fees` build. Reconcile `@mymakaranta/ui` imports + tokens against existing pages (per prior slices: `bg-paper`, `text-brand-500`, `text-caption`, `rounded-card`, `Badge` `tone`, `Button` `variant`/`size`, `Spinner size`, `EmptyState` are real; `bg-canvas`/`text-brand-600` are NOT).

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/settings/fees/page.tsx" "apps/web/src/app/(app)/fees/page.tsx"
git commit -m "feat(fees): Settings fee structure + /fees bursar page + nav"
```

---

## Task 6: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject; nav + multi-step interactions in ONE bash call; React controlled inputs need native-setter+dispatch). Start API + web. Log in as the QA proprietor (`+2348033344455`, school "S3 Gradebook QA"). It has class level(s) + a current term + enrolled students (JSS1A: Ada, Bola). In **Settings → Fees**: pick the JSS1 class level + the current term → add items (Tuition ₦50,000, Levy ₦10,000) → Save. On **`/fees`**: pick the term → **Generate invoices** → table shows Ada + Bola with balance ₦60,000 each (formatted) → drill into a student → line items (Tuition, Levy). Re-generate → no duplicates, refreshed count. Verify a total via `GET /v1/fees/invoice`. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — current state: Sprint 4 slice 1 (fee structure + invoicing) built + QA'd on `sprint-4-fees-invoicing`; Sprint 4 decomposition (slices 2–4 remaining: payments+receipts, reconciliation+collections, parent pay). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + web vitest + builds, then merge `sprint-4-fees-invoicing` → main per the user's choice).

---

## Notes for the implementer
- **Explicit `schoolId`** on every read/delete AND every create incl. inside `$transaction` (`tx` runs no middleware). `Enrollment` reads gated by `class: { schoolId }`.
- **Idempotent generation:** upsert by `(studentId, termId)`; skip when `paidKobo > 0`; otherwise delete+recreate lines and recompute `totalKobo`. `created` vs `refreshed` is decided by whether an invoice already existed for the student.
- **Snapshot:** `InvoiceLine`s copy `FeeItem` name+amount at generation; later structure edits don't touch issued invoices (the e2e asserts this).
- **Money is kobo (Int)** end-to-end; format only at the web edge via `formatMoney` + `School.currency`. Never hardcode ₦ in the API.
- **`noUncheckedIndexedAccess`** — `after[0]!`, `lines[0]?.`, etc.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- Permissions `fees.view`/`fees.manage` are seeded + proprietor-auto-granted; no backfill needed for new schools (existing QA proprietor was backfilled all-permissions in slice 4.5 — but confirm it has fees.* via the grant-all at creation; if a 403 appears in QA, that proprietor predates fees perms and needs the same backfill).
