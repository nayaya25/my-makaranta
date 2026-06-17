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
import { ParentModule } from "../src/modules/parent/parent.module";
import { ParentService } from "../src/modules/parent/parent.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Parent pay (e2e)", () => {
  let prisma: PrismaService;
  let parent: ParentService;

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
        ParentModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    parent = moduleRef.get(ParentService);

    const a = await prisma.school.create({ data: { name: `PP A ${suffix}`, slug: `pp-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `PP B ${suffix}`, slug: `pp-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

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
      expect(await prisma.payment.count({ where: { schoolId } })).toBe(before);
    });
    it("verifies a child payment idempotently (mock success applies once)", async () => {
      const init = await asA(() => parent.pay({ invoiceId: invChild2, amountKobo: 1000000, email: "pp@e.test" }, actor()));
      await asA(() => parent.payVerify(init.reference, actor()));
      await asA(() => parent.payVerify(init.reference, actor()));
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: invChild2 } })).paidKobo).toBe(1000000);
    });
    it("rejects cross-tenant", async () => {
      await expect(asB(() => parent.getInvoices({ ...actor(), schoolId: schoolBId }))).resolves.toEqual([]);
      await expect(asB(() => parent.pay({ invoiceId: invChild1, amountKobo: 1000, email: "x@e.test" }, { ...actor(), schoolId: schoolBId }))).rejects.toThrow(NotFoundException);
    });
  });
});
