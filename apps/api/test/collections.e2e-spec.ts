/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
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
import { CollectionsService } from "../src/modules/fees/collections.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Collections (e2e)", () => {
  let prisma: PrismaService;
  let collections: CollectionsService;

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
    collections = moduleRef.get(CollectionsService);

    const a = await prisma.school.create({ data: { name: `Coll A ${suffix}`, slug: `coll-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Coll B ${suffix}`, slug: `coll-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("collections", () => {
    let termId: string;
    let invoiceId: string;
    let studentId: string;
    let actor: { id: string; phone: string; schoolId: string; identityType: string };

    beforeAll(async () => {
      actor = { id: "bursar-1", phone: "+2348092000001", schoolId, identityType: "PROPRIETOR" };
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `ColYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
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

    it("bulk-sets the due date", async () => {
      expect((await asA(() => collections.setDueDate(termId, new Date("2025-10-01T00:00:00Z")))).updated).toBe(1);
    });

    it("reports OVERDUE past due date, sorted overdue-first", async () => {
      const rows = await asA(() => collections.getCollections(termId));
      const row = rows.find((x) => x.studentId === studentId)!;
      expect(row.status).toBe("OVERDUE");
      expect(row.balanceKobo).toBe(4000000);
      expect(rows[0]!.status).toBe("OVERDUE");
    });

    it("sends a reminder to all guardians' parents and logs it", async () => {
      const r = await asA(() => collections.sendReminder(invoiceId, actor));
      expect(r.recipientCount).toBe(2);
      const rows = await asA(() => collections.getCollections(termId));
      expect(rows.find((x) => x.studentId === studentId)!.lastRemindedAt).toBeTruthy();
      const log = await prisma.feeReminder.findFirst({ where: { schoolId, invoiceId } });
      expect(log!.recipientCount).toBe(2);
      expect(log!.channels).toContain("sms");
    });

    it("rejects a reminder on a settled invoice", async () => {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { paidKobo: 5000000 } });
      await expect(asA(() => collections.sendReminder(invoiceId, actor))).rejects.toThrow(BadRequestException);
      await prisma.invoice.update({ where: { id: invoiceId }, data: { paidKobo: 1000000 } });
    });

    it("bulk-reminds outstanding invoices", async () => {
      const r = await asA(() => collections.sendBulkReminders(termId, actor));
      expect(r.remindersSent).toBeGreaterThanOrEqual(1);
      expect(r.totalRecipients).toBeGreaterThanOrEqual(2);
    });

    it("rejects cross-tenant", async () => {
      await expect(asB(() => collections.getCollections(termId))).rejects.toThrow(NotFoundException);
      await expect(asB(() => collections.sendReminder(invoiceId, { ...actor, schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
    });
  });
});
