# Payments, Auto-Reconcile & Receipts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record offline payments and accept online (Paystack/mock) payments against invoices; online payments auto-reconcile via a signed webhook; every successful payment yields a printable, publicly-verifiable receipt.

**Architecture:** A `core/payments/` env-selected provider (mock + Paystack, mirroring email/storage). A `payments` feature module: `Payment` model (tenant + RLS) + a non-tenant `Receipt` snapshot (mirrors slice-5 `Verification`). An idempotent reconcile core applies a payment exactly once. A signed public webhook + a public receipt route extend the public surface. Web adds bursar payment actions + a public printable receipt page.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e + vitest; Node `crypto` (HMAC) + native `fetch`.

**Spec:** `docs/superpowers/specs/2026-06-16-sprint-4-slice-2-payments-reconcile-receipts-design.md`

**Branch:** `sprint-4-payments` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping on every tenant read/delete + every create incl. inside `$transaction`; IDOR via tenant-scoped `findFirst`; e2e service-level inside `TenantContext.run` (model on `assessment.e2e-spec.ts`); ids cuids; money = kobo Int; `noUncheckedIndexedAccess`. **REUSE existing schema enums** `PaymentStatus { PENDING SUCCESS FAILED REVERSED }` and `PaymentChannel { PAYSTACK FLUTTERWAVE BANK_TRANSFER CASH }` — do NOT define new ones. The provider/public patterns mirror email/storage + slice-5 (`Verification`, PublicModule).

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (Payment + Receipt models + back-relations), `prisma.service.ts` (TENANT_MODELS += Payment, NOT Receipt), new migrations, `apps/api/src/main.ts` (rawBody)
- Create: `apps/api/src/core/payments/payments.types.ts`, `mock.adapter.ts`, `paystack.adapter.ts`, `payments.module.ts`, `paystack.adapter.spec.ts`, `mock.adapter.spec.ts`
- Create: `apps/api/src/modules/payments/payments.service.ts`, `payments.controller.ts`, `payments.module.ts`, `payment.util.ts`, `dto/payments.dto.ts`
- Modify: `apps/api/src/modules/public/public.controller.ts` + `public.service.ts` (webhook + receipt), `public.module.ts` (needs PaymentsService/provider access — see Task 5), `app.module.ts`
- Create/modify: `apps/api/test/payments.e2e-spec.ts`, `apps/api/test/public.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx` (payment actions)
- Create: `apps/web/src/app/receipt/[code]/page.tsx`

---

## Task 1: `Payment` + `Receipt` models + migration

**Files:** Modify `schema.prisma`, `prisma.service.ts`

- [ ] **Step 1: Add models** (reuse existing `PaymentStatus` + `PaymentChannel` enums — do NOT redefine):
```prisma
model Payment {
  id          String         @id @default(cuid())
  schoolId    String
  school      School         @relation(fields: [schoolId], references: [id])
  invoiceId   String
  invoice     Invoice        @relation(fields: [invoiceId], references: [id])
  amountKobo  Int
  channel     PaymentChannel
  reference   String         @unique
  status      PaymentStatus  @default(PENDING)
  paidAt      DateTime?
  recordedBy  String
  createdAt   DateTime       @default(now())
  receipt     Receipt?

  @@index([schoolId, invoiceId])
}

model Receipt {
  id               String   @id @default(cuid())
  code             String   @unique
  paymentId        String   @unique
  payment          Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  schoolId         String
  receiptNo        String
  studentName      String
  schoolName       String
  termLabel        String
  amountKobo       Int
  channel          String
  paidAt           DateTime
  balanceAfterKobo Int
  createdAt        DateTime @default(now())
}
```

- [ ] **Step 2: Back-relations** — `School`: `payments Payment[]`; `Invoice`: `payments Payment[]`. (Receipt has no tenant back-relations; it's non-tenant.)

- [ ] **Step 3:** In `prisma.service.ts` `TENANT_MODELS`, add **`"Payment"` only** (NOT `Receipt` — it must stay readable on the public path with no tenant context).

- [ ] **Step 4: Migrate:** `cd apps/api && pnpm exec prisma migrate dev --name payments_models` → applied. (Engine-DLL EPERM is a known non-blocking issue.)

- [ ] **Step 5:** `pnpm exec prisma validate` + `pnpm --filter @mymakaranta/api typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(payments): Payment (tenant) + Receipt (non-tenant) models"
```

---

## Task 2: RLS migration for `Payment` (only)

**Files:** Create `apps/api/prisma/migrations/<ts>_rls_payment/migration.sql`

- [ ] **Step 1:** `cd apps/api && pnpm exec prisma migrate dev --create-only --name rls_payment`.
- [ ] **Step 2:** Replace `migration.sql` with the `Payment` block (mirror `rls_fees` — do NOT add RLS for `Receipt`):
```sql
-- Defense-in-depth tenant isolation for Payment. (Receipt is intentionally non-RLS — public receipt path.)
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Payment";
CREATE POLICY tenant_isolation ON "Payment"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Payment" TO mymakaranta_app;
```
- [ ] **Step 3:** `pnpm exec prisma migrate dev` → applied; `migrate status` up to date.
- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/migrations
git commit -m "feat(payments): RLS (FORCE) for Payment"
```

---

## Task 3: `core/payments` provider (mock + Paystack) + unit tests

**Files:** Create `core/payments/payments.types.ts`, `mock.adapter.ts`, `paystack.adapter.ts`, `payments.module.ts`, `mock.adapter.spec.ts`, `paystack.adapter.spec.ts`

- [ ] **Step 1: `payments.types.ts`:**
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

- [ ] **Step 2: `mock.adapter.ts`:**
```ts
import { Injectable } from "@nestjs/common";
import type { InitializeArgs, PaymentProvider, VerifyResult } from "./payments.types";

@Injectable()
export class MockPaymentAdapter implements PaymentProvider {
  async initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }> {
    return { authorizationUrl: `/pay/mock/${args.reference}` };
  }
  async verify(reference: string): Promise<VerifyResult> {
    // Dev/test: any reference verifies as success; amount is echoed back by the caller's record.
    return { status: reference ? "success" : "failed", amountKobo: 0 };
  }
  verifySignature(_rawBody: Buffer, signature: string): boolean {
    return signature === (process.env.PAYMENTS_MOCK_WEBHOOK_TOKEN ?? "mock-signature");
  }
}
```
(NOTE: `verify` returns `amountKobo: 0` for the mock — the caller does NOT trust the provider amount for offline-style application; for online verify the service applies the Payment's OWN stored `amountKobo`, not the provider's. The provider amount is informational. Make the service apply `payment.amountKobo`.)

- [ ] **Step 3: `paystack.adapter.ts`:**
```ts
import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { InitializeArgs, PaymentProvider, VerifyResult } from "./payments.types";

const BASE = "https://api.paystack.co";

@Injectable()
export class PaystackPaymentAdapter implements PaymentProvider {
  private get key(): string {
    const k = process.env.PAYSTACK_SECRET_KEY;
    if (!k) throw new Error("PAYSTACK_SECRET_KEY is not set");
    return k;
  }

  async initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }> {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: args.reference, amount: args.amountKobo, email: args.email, metadata: args.metadata }),
    });
    if (!res.ok) throw new Error(`Paystack initialize failed: ${res.status}`);
    const json = (await res.json()) as { data?: { authorization_url?: string } };
    const url = json.data?.authorization_url;
    if (!url) throw new Error("Paystack initialize returned no authorization_url");
    return { authorizationUrl: url };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok) throw new Error(`Paystack verify failed: ${res.status}`);
    const json = (await res.json()) as { data?: { status?: string; amount?: number } };
    const s = json.data?.status;
    const status: VerifyResult["status"] = s === "success" ? "success" : s === "failed" ? "failed" : "pending";
    return { status, amountKobo: json.data?.amount ?? 0 };
  }

  verifySignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac("sha512", this.key).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
```

- [ ] **Step 4: `payments.module.ts` (`@Global`):**
```ts
import { Global, Module } from "@nestjs/common";
import { PAYMENT_SERVICE } from "./payments.types";
import { MockPaymentAdapter } from "./mock.adapter";
import { PaystackPaymentAdapter } from "./paystack.adapter";

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_SERVICE,
      useFactory: () =>
        process.env.PAYMENTS_PROVIDER === "paystack" ? new PaystackPaymentAdapter() : new MockPaymentAdapter(),
    },
  ],
  exports: [PAYMENT_SERVICE],
})
export class PaymentsProviderModule {}
```
Register `PaymentsProviderModule` in `app.module.ts` imports.

- [ ] **Step 5: Unit tests** (`mock.adapter.spec.ts` + `paystack.adapter.spec.ts`) run by the api jest config (`src/.*\.spec\.ts$`):
```ts
// mock.adapter.spec.ts
import { MockPaymentAdapter } from "./mock.adapter";
describe("MockPaymentAdapter", () => {
  const a = new MockPaymentAdapter();
  it("initializes a local url", async () => {
    expect((await a.initialize({ reference: "REF1", amountKobo: 1000, email: "x@y.z" })).authorizationUrl).toContain("REF1");
  });
  it("verifies a known reference as success", async () => {
    expect((await a.verify("REF1")).status).toBe("success");
  });
  it("accepts the mock webhook token signature", () => {
    expect(a.verifySignature(Buffer.from("{}"), "mock-signature")).toBe(true);
    expect(a.verifySignature(Buffer.from("{}"), "wrong")).toBe(false);
  });
});
```
```ts
// paystack.adapter.spec.ts — signature only (no network)
import { createHmac } from "node:crypto";
import { PaystackPaymentAdapter } from "./paystack.adapter";
describe("PaystackPaymentAdapter.verifySignature", () => {
  const prev = process.env.PAYSTACK_SECRET_KEY;
  beforeAll(() => { process.env.PAYSTACK_SECRET_KEY = "sk_test_x"; });
  afterAll(() => { process.env.PAYSTACK_SECRET_KEY = prev; });
  const a = new PaystackPaymentAdapter();
  it("accepts a correct HMAC-SHA512 signature and rejects a tampered one", () => {
    const body = Buffer.from(JSON.stringify({ event: "charge.success" }));
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(a.verifySignature(body, sig)).toBe(true);
    expect(a.verifySignature(body, sig.replace(/.$/, "0"))).toBe(false);
    expect(a.verifySignature(body, "")).toBe(false);
  });
});
```

- [ ] **Step 6:** `pnpm exec jest payments` (or the adapter spec names) from `apps/api` → PASS. typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/core/payments apps/api/src/app.module.ts
git commit -m "feat(payments): env-selected payment provider (mock + Paystack) + signature verify"
```

---

## Task 4: payments service + controller + idempotent reconcile + e2e

**Files:** Create `payment.util.ts`, `dto/payments.dto.ts`, `payments.service.ts`, `payments.controller.ts`, `payments.module.ts`; modify `app.module.ts`; create `test/payments.e2e-spec.ts`

- [ ] **Step 1: `payment.util.ts`** (code/receiptNo generators — duplicate the tiny crypto helper rather than cross-importing assessment):
```ts
import { randomBytes } from "node:crypto";
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode(len: number): string {
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[b[i]! % ALPHABET.length];
  return out;
}
/** Unguessable public receipt code. */
export function generateReceiptCode(): string { return randomCode(16); }
/** Human-friendly receipt number. */
export function generateReceiptNo(): string { return `RCT-${randomCode(8)}`; }
/** Provider transaction reference. */
export function generatePaymentReference(): string { return `MMK-${randomCode(12)}`; }
```

- [ ] **Step 2: DTOs** — `dto/payments.dto.ts`:
```ts
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { PaymentChannel } from "@prisma/client";

const OFFLINE = [PaymentChannel.CASH, PaymentChannel.BANK_TRANSFER] as const;

export class RecordPaymentDto {
  @IsString() @IsNotEmpty() invoiceId!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsEnum(PaymentChannel) channel!: PaymentChannel; // service further restricts to offline channels
  @IsOptional() @IsString() reference?: string;
}

export class InitializeOnlineDto {
  @IsString() @IsNotEmpty() invoiceId!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsEmail() email!: string;
}

export class VerifyPaymentDto {
  @IsString() @IsNotEmpty() reference!: string;
}
```

- [ ] **Step 3: Failing e2e** — `test/payments.e2e-spec.ts` (service-level; replicate the two-school bootstrap from `assessment.e2e-spec.ts`; build a fees fixture: academic year + term + class level + class + student + enrollment, set fee items, generate an invoice for the student so `invoiceId` exists with a known total — or create an `Invoice` directly with `totalKobo`). Get `PaymentsService` via `moduleRef.get`. Tests:
```ts
  describe("payments", () => {
    let invoiceId: string; const TOTAL = 6000000;
    const actor = { id: "bursar-1", phone: "+2348091000001", schoolId, identityType: "PROPRIETOR" };

    beforeAll(async () => {
      // minimal: a student + term + classLevel + invoice with totalKobo=TOTAL, paidKobo=0
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "PayYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `PJSS1-${suffix}`, order: 1 } });
      const stu = await prisma.student.create({ data: { schoolId, admissionNo: `P-${suffix}`, firstName: "Pay", lastName: "Er", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      const inv = await prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId: term.id, classLevelId: lvl.id, totalKobo: TOTAL, paidKobo: 0 } });
      invoiceId = inv.id;
    });

    it("records an offline payment, applies it, and creates a receipt", async () => {
      const r = await asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 2000000, channel: "CASH" }, actor));
      expect(r.receiptCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/);
      const inv = await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } });
      expect(inv.paidKobo).toBe(2000000);
      const rec = await payments.getReceipt(r.receiptCode); // public, no tenant
      expect(rec!.amountKobo).toBe(2000000);
      expect(rec!.balanceAfterKobo).toBe(4000000);
    });

    it("supports partial then overpayment (balance goes negative)", async () => {
      await asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 5000000, channel: "BANK_TRANSFER" }, actor));
      const inv = await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } });
      expect(inv.paidKobo).toBe(7000000); // 2,000,000 + 5,000,000 > 6,000,000 total → overpaid
    });

    it("initializes an online payment as PENDING without applying", async () => {
      const r = await asA(() => payments.initializeOnline({ invoiceId, amountKobo: 1000000, email: "p@e.test" }, actor));
      expect(r.authorizationUrl).toContain(r.reference);
      const p = await prisma.payment.findFirstOrThrow({ where: { schoolId, reference: r.reference } });
      expect(p.status).toBe("PENDING");
      const inv = await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } });
      expect(inv.paidKobo).toBe(7000000); // unchanged by init
    });

    it("verifies an online payment idempotently (applies once)", async () => {
      const init = await asA(() => payments.initializeOnline({ invoiceId, amountKobo: 1000000, email: "p@e.test" }, actor));
      await asA(() => payments.verifyPayment(init.reference, actor));
      await asA(() => payments.verifyPayment(init.reference, actor)); // duplicate → no-op
      const inv = await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } });
      expect(inv.paidKobo).toBe(8000000); // +1,000,000 exactly once
    });

    it("rejects cross-tenant record + zero amount", async () => {
      await expect(asB(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 1000, channel: "CASH" }, { ...actor, schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
      await expect(asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 0, channel: "CASH" }, actor))).rejects.toThrow(BadRequestException);
    });
  });
```
Add `payments` (PaymentsService) handle + import; ensure `NotFoundException`/`BadRequestException` imported; use the real school-B id var. (`getReceipt` is called WITHOUT `asA` to prove it needs no tenant context.)

- [ ] **Step 4:** Run e2e → FAIL (service missing).

- [ ] **Step 5: Implement `payments.service.ts`:**
```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentChannel } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PAYMENT_SERVICE, type PaymentProvider } from "../../core/payments/payments.types";
import { generatePaymentReference, generateReceiptCode, generateReceiptNo } from "./payment.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const OFFLINE_CHANNELS: PaymentChannel[] = [PaymentChannel.CASH, PaymentChannel.BANK_TRANSFER];

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_SERVICE) private provider: PaymentProvider,
  ) {}

  private async invoiceOr404(schoolId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } },
    });
    if (!inv) throw new NotFoundException("Invoice not found in this school.");
    return inv;
  }

  async recordOfflinePayment(dto: { invoiceId: string; amountKobo: number; channel: PaymentChannel; reference?: string }, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.amountKobo <= 0) throw new BadRequestException("Amount must be positive.");
    if (!OFFLINE_CHANNELS.includes(dto.channel)) throw new BadRequestException("Channel must be CASH or BANK_TRANSFER for a recorded payment.");
    const invoice = await this.invoiceOr404(schoolId, dto.invoiceId);
    const reference = dto.reference?.trim() || generatePaymentReference();
    const { receiptCode } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { schoolId, invoiceId: invoice.id, amountKobo: dto.amountKobo, channel: dto.channel, reference, status: "SUCCESS", paidAt: new Date(), recordedBy: actor.id },
      });
      const updated = await tx.invoice.update({ where: { id: invoice.id, schoolId }, data: { paidKobo: { increment: dto.amountKobo } } });
      const code = await this.writeReceipt(tx, payment.id, schoolId, invoice, dto.amountKobo, dto.channel, updated.totalKobo - updated.paidKobo, payment.paidAt!);
      return { receiptCode: code };
    });
    return { receiptCode };
  }

  async initializeOnline(dto: { invoiceId: string; amountKobo: number; email: string }, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.amountKobo <= 0) throw new BadRequestException("Amount must be positive.");
    const invoice = await this.invoiceOr404(schoolId, dto.invoiceId);
    const reference = generatePaymentReference();
    await this.prisma.payment.create({
      data: { schoolId, invoiceId: invoice.id, amountKobo: dto.amountKobo, channel: "PAYSTACK", reference, status: "PENDING", recordedBy: actor.id },
    });
    const { authorizationUrl } = await this.provider.initialize({ reference, amountKobo: dto.amountKobo, email: dto.email, metadata: { invoiceId: invoice.id, schoolId } });
    return { reference, authorizationUrl };
  }

  async verifyPayment(reference: string, _actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const payment = await this.prisma.payment.findFirst({ where: { reference, schoolId } });
    if (!payment) throw new NotFoundException("Payment not found.");
    const result = await this.provider.verify(reference);
    if (result.status === "success") return this.applyByReference(reference);
    return { applied: false, status: result.status };
  }

  /** Idempotent apply: claims the PENDING→SUCCESS transition; safe to call repeatedly. */
  private async applyByReference(reference: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({ where: { reference, status: "PENDING" }, data: { status: "SUCCESS", paidAt: new Date() } });
      if (claim.count === 0) return { applied: false, status: "already" as const };
      const payment = await tx.payment.findFirstOrThrow({ where: { reference } });
      const invoice = await tx.invoice.update({ where: { id: payment.invoiceId }, data: { paidKobo: { increment: payment.amountKobo } }, include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } } });
      const code = await this.writeReceipt(tx, payment.id, payment.schoolId, invoice, payment.amountKobo, payment.channel, invoice.totalKobo - invoice.paidKobo, payment.paidAt ?? new Date());
      return { applied: true, status: "success" as const, receiptCode: code };
    });
  }

  /** Called by the public webhook controller — NO tenant context; resolves schoolId from the payment. */
  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.provider.verifySignature(rawBody, signature)) {
      throw new BadRequestException("Invalid signature."); // controller maps to 401
    }
    let event: { event?: string; data?: { reference?: string } };
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { return { ok: true }; }
    if (event.event === "charge.success" && event.data?.reference) {
      await this.applyByReference(event.data.reference); // idempotent; unknown ref → claim.count 0 → no-op (findFirstOrThrow guarded below)
    }
    return { ok: true };
  }

  async getReceipt(code: string) {
    if (!code) return null;
    const r = await this.prisma.receipt.findUnique({ where: { code } });
    if (!r) return null;
    return { receiptNo: r.receiptNo, school: r.schoolName, student: r.studentName, term: r.termLabel, amountKobo: r.amountKobo, channel: r.channel, paidAt: r.paidAt.toISOString(), balanceAfterKobo: r.balanceAfterKobo };
  }

  async getPayments(invoiceId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.invoiceOr404(schoolId, invoiceId);
    return this.prisma.payment.findMany({ where: { schoolId, invoiceId }, orderBy: { createdAt: "desc" } });
  }

  private async writeReceipt(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    paymentId: string, schoolId: string, invoice: { studentId: string; student: { firstName: string; lastName: string }; term: { number: number; academicYear: { name: string } } },
    amountKobo: number, channel: PaymentChannel, balanceAfterKobo: number, paidAt: Date,
  ): Promise<string> {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    const code = generateReceiptCode();
    await tx.receipt.create({
      data: {
        code, paymentId, schoolId, receiptNo: generateReceiptNo(),
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        schoolName: school?.name ?? "", termLabel: `${invoice.term.academicYear.name} · Term ${invoice.term.number}`,
        amountKobo, channel: String(channel), paidAt, balanceAfterKobo,
      },
    });
    return code;
  }
}
```
NOTES: in `handleWebhook`, an unknown reference makes `applyByReference` claim 0 rows → but then `findFirstOrThrow` would throw. GUARD: in `applyByReference`, after `claim.count === 0` return early (already handled). For an unknown reference, `claim.count` is also 0 (no matching PENDING row) → returns `{ applied:false }` BEFORE `findFirstOrThrow`. Good — no throw. Verify the early-return covers both "already applied" and "unknown reference". Also verify `tx` typing compiles (if the `writeReceipt` `tx` param typing is awkward, type it as `Prisma.TransactionClient` imported from `@prisma/client`).

- [ ] **Step 6: `payments.controller.ts`** (authenticated bursar endpoints; mirror release.controller guard imports):
```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { PaymentsService } from "./payments.service";
import { RecordPaymentDto, InitializeOnlineDto, VerifyPaymentDto } from "./dto/payments.dto";

@Controller("v1/payments")
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post("record") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  record(@Body() dto: RecordPaymentDto, @CurrentUser() user: RequestUser) {
    return this.service.recordOfflinePayment(dto, user);
  }
  @Post("initialize") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  initialize(@Body() dto: InitializeOnlineDto, @CurrentUser() user: RequestUser) {
    return this.service.initializeOnline(dto, user);
  }
  @Post("verify") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  verify(@Body() dto: VerifyPaymentDto, @CurrentUser() user: RequestUser) {
    return this.service.verifyPayment(dto.reference, user);
  }
  @Get("by-invoice") @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.view")
  byInvoice(@Query("invoiceId") invoiceId: string) {
    return this.service.getPayments(invoiceId);
  }
}
```

- [ ] **Step 7: `payments.module.ts`** (imports AuthModule; provider is global so PAYMENT_SERVICE injects) + register in `app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({ imports: [AuthModule], controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
```
(Export `PaymentsService` so the public webhook controller can use it — see Task 5.) Add `PaymentsModule` to `app.module.ts`.

- [ ] **Step 8:** Run e2e → all `payments` tests + full suite green. Build + typecheck clean.

- [ ] **Step 9: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/payments apps/api/src/app.module.ts apps/api/test/payments.e2e-spec.ts
git commit -m "feat(payments): record/initialize/verify + idempotent reconcile + receipts"
```

---

## Task 5: Raw body + public webhook + public receipt + e2e

**Files:** Modify `apps/api/src/main.ts`, `public.module.ts`, `public.controller.ts`, `public.service.ts`; modify `test/public.e2e-spec.ts`

- [ ] **Step 1: Raw body** in `main.ts`: change `NestFactory.create(AppModule)` → `NestFactory.create(AppModule, { rawBody: true })`. (NestJS exposes `req.rawBody: Buffer` on requests; existing JSON parsing is unaffected.)

- [ ] **Step 2: Public module wiring.** The public webhook needs `PaymentsService`. Import `PaymentsModule` into `PublicModule` (it exports `PaymentsService`):
```ts
import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
@Module({ imports: [PaymentsModule], controllers: [PublicController], providers: [PublicService] })
export class PublicModule {}
```

- [ ] **Step 3: Public webhook + receipt** in `public.controller.ts` (NO guards). Add (inject `PaymentsService`):
```ts
import { Body, Controller, Get, HttpCode, Param, Post, Req, Headers, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsService } from "../payments/payments.service";
// ...existing PublicService for verify...

  // in the controller (add PaymentsService to the constructor):
  @Post("payments/webhook")
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-paystack-signature") signature: string) {
    try {
      return await this.payments.handleWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), signature ?? "");
    } catch {
      throw new UnauthorizedException("Invalid signature.");
    }
  }

  @Get("receipt/:code")
  receipt(@Param("code") code: string) {
    return this.payments.getReceipt(code);
  }
```
(Keep the existing `verify/:code` route from slice 5. Add `private payments: PaymentsService` to the controller constructor alongside `PublicService`.)

- [ ] **Step 4: e2e** — extend `test/public.e2e-spec.ts` (it already has a no-tenant bootstrap). Add a payments-webhook + receipt block:
  - Create a school + invoice + a PENDING `Payment` directly (known reference + amountKobo), then call `PaymentsService.handleWebhook(rawBody, sig)` with the mock provider:
```ts
  it("applies a charge.success webhook (valid signature) idempotently", async () => {
    // seed a PENDING payment for an invoice with totalKobo
    // ...create school/term/classLevel/student/invoice(total 5000)/payment(PENDING, ref REF, amount 3000)...
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "REFWEBHOOK" } }));
    await pub.paymentsHandleWebhook(body, "mock-signature"); // or call PaymentsService.handleWebhook directly
    // invoice.paidKobo === 3000
    await pub.paymentsHandleWebhook(body, "mock-signature"); // duplicate → no-op
    // invoice.paidKobo still 3000
  });
  it("rejects a bad signature", async () => {
    await expect(payments.handleWebhook(Buffer.from("{}"), "bad")).rejects.toThrow();
  });
  it("returns a public receipt by code with no tenant context", async () => {
    // after the webhook, the payment has a receipt; fetch via getReceipt(code)
  });
```
(Get `PaymentsService` via `moduleRef.get` in this file; call `handleWebhook`/`getReceipt` directly — no HTTP needed. Use `PAYMENTS_PROVIDER` unset → mock, so `verifySignature` accepts `"mock-signature"`.)

- [ ] **Step 5:** Run e2e (`public` + full) → green. Build + typecheck clean.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/main.ts apps/api/src/modules/public apps/api/test/public.e2e-spec.ts
git commit -m "feat(payments): signed public webhook (raw body) + public receipt route"
```

---

## Task 6: Web — payment actions + public receipt page

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx`; create `apps/web/src/app/receipt/[code]/page.tsx`

- [ ] **Step 1: api client** — types + methods (reuse `request` unauth helper for the public receipt):
```ts
export interface PublicReceipt { receiptNo: string; school: string; student: string; term: string; amountKobo: number; channel: string; paidAt: string; balanceAfterKobo: number; }
```
```ts
  recordPayment: (invoiceId: string, amountKobo: number, channel: "CASH" | "BANK_TRANSFER", reference?: string) =>
    authedRequest<{ receiptCode: string }>("/v1/payments/record", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, channel, reference }) }),
  initializeOnline: (invoiceId: string, amountKobo: number, email: string) =>
    authedRequest<{ reference: string; authorizationUrl: string }>("/v1/payments/initialize", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, email }) }),
  verifyPayment: (reference: string) =>
    authedRequest<{ applied: boolean; status: string; receiptCode?: string }>("/v1/payments/verify", { method: "POST", body: JSON.stringify({ reference }) }),
  getPublicReceipt: (code: string) => request<PublicReceipt | null>(`/v1/public/receipt/${encodeURIComponent(code)}`),
```

- [ ] **Step 2: Payment actions on `/fees` invoice detail.** In the invoice detail panel/modal, add a **Record payment** form (channel select CASH/BANK_TRANSFER + amount in naira → `recordPayment` → on success store `receiptCode` + a **View receipt** link to `/receipt/[code]`, and reload the invoice so the balance updates). Add a **Pay online** button (`initializeOnline` with the school's email or a prompt → `window.open(authorizationUrl)`; in mock the URL is a stub — provide a **"I've paid — verify"** button calling `verifyPayment(reference)` then reload). Show payments list via `getPayments` (optional). All amounts via `formatMoney`.

- [ ] **Step 3: Public receipt page** — `apps/web/src/app/receipt/[code]/page.tsx` (PUBLIC, outside `(app)`; mirror the slice-5 `/verify/[code]` + report-card print page). Fetch `getPublicReceipt(code)`; render a printable receipt (receiptNo, school, student, term, amount, channel, paidAt, balance-after) + Print/Save-as-PDF; clean "not found" state. Use `formatMoney`.

- [ ] **Step 4: Verify (no dev server):** `pnpm --filter @mymakaranta/web typecheck` + `lint` + `build`. `/receipt/[code]` + `/fees` build. Reconcile tokens/ui per prior slices.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/fees/page.tsx" "apps/web/src/app/receipt"
git commit -m "feat(payments): bursar payment actions + public printable receipt page"
```

---

## Task 7: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject; one bash call per interaction sequence; React inputs via native-setter+dispatch). Start API + web (mock provider). Log in as the QA proprietor (`+2348033344455`, school "S3 Gradebook QA"). It has the JSS1 invoices (Ada/Bola ₦60,000) from slice-1 QA. On `/fees` → open Ada's invoice → **Record payment** ₦20,000 CASH → balance drops to ₦40,000 → **View receipt** opens `/receipt/[code]` showing ₦20,000 + balance-after ₦40,000 (printable). Also exercise **Pay online** (mock → stub → verify) → reconciled. Cross-check `GET /v1/public/receipt/<code>` (no auth) returns the snapshot; a bad code → not-found page. Optionally POST a `charge.success` to `/v1/public/payments/webhook` with the mock signature header and confirm reconcile. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 2 (payments + auto-reconcile + receipts) built + QA'd; env `PAYMENTS_PROVIDER`/`PAYSTACK_SECRET_KEY`/`PAYMENTS_MOCK_WEBHOOK_TOKEN`; remaining slices 3 (CSV/overdue/reminders/reports) + 4 (parent pay). Note the webhook/RLS prod consideration (Payment writes scoped by resolved schoolId; GUC wiring still a pre-deploy task). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-payments` → main per the user's choice).

---

## Notes for the implementer
- **Idempotency is load-bearing:** apply ONLY via the `updateMany({where:{reference,status:"PENDING"}})` claim; `claim.count === 0` → return before any invoice mutation (covers both already-applied AND unknown-reference). Offline payments are created already-SUCCESS and applied in their own create transaction (unique `reference` prevents a double-create).
- **Provider amount is NOT trusted for the applied amount** — the service applies `payment.amountKobo` (what was recorded/initialized), not the provider's reported amount. (A production hardening would reconcile mismatches; out of scope — note it.)
- **`Receipt` is non-tenant / non-RLS** — never add it to `TENANT_MODELS`; the public receipt read needs no tenant context.
- **Webhook:** verify signature FIRST (401 on fail); then parse + apply idempotently; return 200 even for unknown references (avoid Paystack retry storms). Raw body via `rawBody: true`.
- **Explicit `schoolId`** on every tenant read/create incl. inside `$transaction`; `handleWebhook` resolves `schoolId` from the Payment row (it runs with no tenant context).
- **Reuse existing enums** `PaymentStatus` + `PaymentChannel` (no new enums). Offline channels = CASH, BANK_TRANSFER; online = PAYSTACK.
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **Tokens/ui** — reconcile against existing pages (slice-5 findings: `bg-paper`/`text-brand-500`/`text-caption` real; `bg-canvas`/`text-brand-600` not).
