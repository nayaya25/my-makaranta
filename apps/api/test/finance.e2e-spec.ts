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
import { EmailModule } from "../src/core/email/email.module";
import { PaymentsProviderModule } from "../src/core/payments/payments.module";
import { FeesModule } from "../src/modules/fees/fees.module";
import { FinanceService } from "../src/modules/fees/finance.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Finance (e2e)", () => {
  let prisma: PrismaService;
  let finance: FinanceService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        EmailModule,
        AuthModule,
        PaymentsProviderModule,
        FeesModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    finance = moduleRef.get(FinanceService);

    const a = await prisma.school.create({ data: { name: `Fin A ${suffix}`, slug: `fin-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Fin B ${suffix}`, slug: `fin-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("finance", () => {
    let termId: string;
    const NOWISH = new Date();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `FinYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const l1 = await prisma.classLevel.create({ data: { schoolId, name: `FinJSS1-${suffix}`, order: 1 } });
      const l2 = await prisma.classLevel.create({ data: { schoolId, name: `FinJSS2-${suffix}`, order: 2 } });
      const mk = async (lvlId: string, total: number, paid: number, due: Date | null, label: string) => {
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
        return prisma.invoice.create({ data: { schoolId, studentId: stu.id, termId, classLevelId: lvlId, totalKobo: total, paidKobo: paid, dueDate: due } });
      };
      const past = new Date(Date.now() - 24 * 3600 * 1000);
      const inv1 = await mk(l1.id, 6000000, 6000000, past, "F1");
      const inv2 = await mk(l1.id, 6000000, 2000000, past, "F2");
      await mk(l2.id, 5000000, 0, new Date(Date.now() + 7 * 24 * 3600 * 1000), "F3");
      await prisma.payment.create({ data: { schoolId, invoiceId: inv1.id, amountKobo: 6000000, channel: "CASH", reference: `FINR-${suffix}`, status: "SUCCESS", paidAt: NOWISH, recordedBy: "x" } });
      await prisma.payment.create({ data: { schoolId, invoiceId: inv2.id, amountKobo: 2000000, channel: "CASH", reference: `FINO-${suffix}`, status: "SUCCESS", paidAt: eightDaysAgo, recordedBy: "x" } });
    });

    it("summarizes the term's finances", async () => {
      const s = await asA(() => finance.getFinanceSummary(termId));
      expect(s.expectedKobo).toBe(17000000);
      expect(s.collectedKobo).toBe(8000000);
      expect(s.outstandingKobo).toBe(9000000);
      expect(s.overdueKobo).toBe(4000000);
      expect(s.collectedThisWeekKobo).toBe(6000000);
      expect(s.byClassLevel.length).toBe(2);
      const jss1 = s.byClassLevel.find((g) => g.classLevelName.startsWith("FinJSS1"))!;
      expect(jss1.studentCount).toBe(2);
      expect(jss1.outstandingKobo).toBe(4000000);
    });

    it("rejects a foreign term", async () => {
      await expect(asB(() => finance.getFinanceSummary(termId))).rejects.toThrow(NotFoundException);
    });
  });
});
