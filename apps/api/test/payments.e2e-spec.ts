/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { PaymentsProviderModule } from "../src/core/payments/payments.module";
import { PaymentsModule } from "../src/modules/payments/payments.module";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Payments (e2e)", () => {
  let prisma: PrismaService;
  let payments: PaymentsService;

  const suffix = Date.now().toString(36);
  const userId = "test-user";
  let schoolId: string;
  let schoolBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        PaymentsProviderModule,
        PaymentsModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    payments = moduleRef.get(PaymentsService);

    const a = await prisma.school.create({ data: { name: `Pay A ${suffix}`, slug: `pay-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Pay B ${suffix}`, slug: `pay-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("payments", () => {
    let invoiceId: string; const TOTAL = 6000000;
    let actor: { id: string; phone: string; schoolId: string; identityType: string };

    beforeAll(async () => {
      actor = { id: "bursar-1", phone: "+2348091000001", schoolId, identityType: "PROPRIETOR" };
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "PayYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `PJSS1-${suffix}`, order: 1 } });
      const stu = await prisma.student.create({ data: { schoolId, admissionNo: `P-${suffix}`, firstName: "Pay", lastName: "Er", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      const inv = await prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId: term.id, classLevelId: lvl.id, totalKobo: TOTAL, paidKobo: 0 } });
      invoiceId = inv.id;
    });

    it("records an offline payment, applies it, creates a receipt", async () => {
      const r = await asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 2000000, channel: "CASH" }, actor));
      expect(r.receiptCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } })).paidKobo).toBe(2000000);
      const rec = await payments.getReceipt(r.receiptCode);
      expect(rec!.amountKobo).toBe(2000000);
      expect(rec!.balanceAfterKobo).toBe(4000000);
    });

    it("supports partial then overpayment (balance negative)", async () => {
      await asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 5000000, channel: "BANK_TRANSFER" }, actor));
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } })).paidKobo).toBe(7000000);
    });

    it("initializes online as PENDING without applying", async () => {
      const r = await asA(() => payments.initializeOnline({ invoiceId, amountKobo: 1000000, email: "p@e.test" }, actor));
      expect(r.authorizationUrl).toContain(r.reference);
      expect((await prisma.payment.findFirstOrThrow({ where: { schoolId, reference: r.reference } })).status).toBe("PENDING");
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } })).paidKobo).toBe(7000000);
    });

    it("verifies online idempotently (applies once)", async () => {
      const init = await asA(() => payments.initializeOnline({ invoiceId, amountKobo: 1000000, email: "p@e.test" }, actor));
      await asA(() => payments.verifyPayment(init.reference, actor));
      await asA(() => payments.verifyPayment(init.reference, actor));
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invoiceId } })).paidKobo).toBe(8000000);
    });

    it("rejects cross-tenant record + zero amount", async () => {
      await expect(asB(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 1000, channel: "CASH" }, { ...actor, schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
      await expect(asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 0, channel: "CASH" }, actor))).rejects.toThrow(BadRequestException);
    });

    it("rejects a duplicate explicit reference with 409", async () => {
      const ref = `DUP-${suffix}`;
      await asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 1000, channel: "CASH", reference: ref }, actor));
      await expect(asA(() => payments.recordOfflinePayment({ invoiceId, amountKobo: 1000, channel: "CASH", reference: ref }, actor))).rejects.toThrow(ConflictException);
    });
  });
});
