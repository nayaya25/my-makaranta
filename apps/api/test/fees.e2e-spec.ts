/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { PaymentsProviderModule } from "../src/core/payments/payments.module";
import { FeesModule } from "../src/modules/fees/fees.module";
import { FeesService } from "../src/modules/fees/fees.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Fees (e2e)", () => {
  let prisma: PrismaService;
  let fees: FeesService;

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
        FeesModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    fees = moduleRef.get(FeesService);

    const a = await prisma.school.create({ data: { name: `Fees A ${suffix}`, slug: `fees-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Fees B ${suffix}`, slug: `fees-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("fees", () => {
    let termId: string; let jss1: string; let jss2: string;
    let stuA: string; let stuB: string;

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "FeeYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const l1 = await prisma.classLevel.create({ data: { schoolId, name: `FJSS1-${suffix}`, order: 1 } });
      const l2 = await prisma.classLevel.create({ data: { schoolId, name: `FJSS2-${suffix}`, order: 2 } });
      jss1 = l1.id; jss2 = l2.id;
      const c1 = await prisma.class.create({ data: { schoolId, classLevelId: l1.id, name: `FJSS1A-${suffix}` } });
      const c2 = await prisma.class.create({ data: { schoolId, classLevelId: l2.id, name: `FJSS2A-${suffix}` } });
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
      await asA(() => fees.setFeeItems(jss1, termId, [{ name: "Tuition", amountKobo: 5500000, order: 0 }]));
      const after = await asA(() => fees.getFeeItems(jss1, termId));
      expect(after).toHaveLength(1);
      expect(after[0]!.amountKobo).toBe(5500000);
      await asA(() => fees.setFeeItems(jss1, termId, [
        { name: "Tuition", amountKobo: 5000000, order: 0 },
        { name: "Levy", amountKobo: 1000000, order: 1 },
      ]));
    });

    it("generates one frozen invoice per enrolled student with class-level totals", async () => {
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.created).toBe(2);
      const invA = await asA(() => fees.getInvoice(stuA, termId));
      expect(invA.totalKobo).toBe(6000000);
      expect(invA.lines).toHaveLength(2);
      expect(invA.balanceKobo).toBe(6000000);
      const invB = await asA(() => fees.getInvoice(stuB, termId));
      expect(invB.totalKobo).toBe(7000000);
    });

    it("is idempotent and refreshes unpaid invoices without duplicating", async () => {
      await asA(() => fees.setFeeItems(jss2, termId, [{ name: "Tuition", amountKobo: 8000000, order: 0 }]));
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.created).toBe(0);
      expect(res.refreshed).toBe(2);
      expect((await asA(() => fees.getInvoice(stuB, termId))).totalKobo).toBe(8000000);
      expect(await prisma.invoice.count({ where: { schoolId, termId } })).toBe(2);
    });

    it("skips an invoice that already has a payment recorded", async () => {
      await prisma.invoice.updateMany({ where: { schoolId, studentId: stuA, termId }, data: { paidKobo: 100 } });
      const res = await asA(() => fees.generateInvoices(termId));
      expect(res.skipped).toBe(1);
      await prisma.invoice.updateMany({ where: { schoolId, studentId: stuA, termId }, data: { paidKobo: 0 } });
    });

    it("freezes invoice lines against later structure edits", async () => {
      // jss1 currently Tuition 50000 + Levy 10000; invoice already generated at 60000
      const before = await asA(() => fees.getInvoice(stuA, termId));
      expect(before.totalKobo).toBe(6000000);
      // edit structure but DON'T regenerate → issued invoice unchanged
      await asA(() => fees.setFeeItems(jss1, termId, [{ name: "Tuition", amountKobo: 9999999, order: 0 }]));
      const after = await asA(() => fees.getInvoice(stuA, termId));
      expect(after.totalKobo).toBe(6000000); // frozen
      // restore for cleanliness
      await asA(() => fees.setFeeItems(jss1, termId, [
        { name: "Tuition", amountKobo: 5000000, order: 0 },
        { name: "Levy", amountKobo: 1000000, order: 1 },
      ]));
    });

    it("rejects cross-tenant structure + invoice access", async () => {
      await expect(asB(() => fees.setFeeItems(jss1, termId, []))).rejects.toThrow(NotFoundException);
      await expect(asB(() => fees.getInvoice(stuA, termId))).rejects.toThrow(NotFoundException);
    });
  });
});
