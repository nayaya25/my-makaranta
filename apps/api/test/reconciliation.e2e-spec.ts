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
import { ReconciliationService } from "../src/modules/fees/reconciliation.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Reconciliation (e2e)", () => {
  let prisma: PrismaService;
  let recon: ReconciliationService;

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
        AuthModule,
        PaymentsProviderModule,
        FeesModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    recon = moduleRef.get(ReconciliationService);

    const a = await prisma.school.create({ data: { name: `Recon A ${suffix}`, slug: `recon-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Recon B ${suffix}`, slug: `recon-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("reconciliation", () => {
    let termId: string; let adaInv: string; let bolaInv: string;
    const actor = { id: "bursar-1", phone: "+2348093000001", schoolId, identityType: "PROPRIETOR" };

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `RecYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `RJSS1-${suffix}`, order: 1 } });
      const ada = await prisma.student.create({ data: { schoolId, admissionNo: `ADM-A-${suffix}`, firstName: "Ada", lastName: "Eze", gender: "FEMALE", dateOfBirth: new Date("2010-01-01") } });
      const bola = await prisma.student.create({ data: { schoolId, admissionNo: `ADM-B-${suffix}`, firstName: "Bola", lastName: "Ade", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      adaInv = (await prisma.invoice.create({ data: { schoolId, studentId: ada.id, termId: term.id, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 0 } })).id;
      bolaInv = (await prisma.invoice.create({ data: { schoolId, studentId: bola.id, termId: term.id, classLevelId: lvl.id, totalKobo: 5000000, paidKobo: 0 } })).id;
    });

    it("proposes ranked matches; correct top suggestion + confidence", async () => {
      const res = await asA(() => recon.proposeMatches(termId, [
        { reference: "TXN1", amountKobo: 6000000, narration: "TRF FROM ADA EZE" },
        { reference: "TXN2", amountKobo: 2000000, narration: "school fees bola ade" },
        { reference: "TXN3", amountKobo: 1000000, narration: "anonymous deposit 0000" },
      ]));
      expect(res[0]!.suggestedInvoiceId).toBe(adaInv);
      expect(res[0]!.candidates[0]!.confidence).toBe("high");
      expect(res[1]!.suggestedInvoiceId).toBe(bolaInv);
      expect(res[2]!.suggestedInvoiceId).toBeNull();
    });

    it("confirms matches → records BANK_TRANSFER payments + applies", async () => {
      const r = await asA(() => recon.confirmMatches([
        { reference: "TXN1", amountKobo: 6000000, invoiceId: adaInv },
        { reference: "TXN2", amountKobo: 2000000, invoiceId: bolaInv },
      ], actor));
      expect(r.recorded).toBe(2);
      expect(r.skipped).toBe(0);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: adaInv } })).paidKobo).toBe(6000000);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: bolaInv } })).paidKobo).toBe(2000000);
      expect((await prisma.payment.findFirst({ where: { schoolId, reference: "TXN1" } }))!.channel).toBe("BANK_TRANSFER");
    });

    it("skips a duplicate reference on re-confirm (idempotent)", async () => {
      const r = await asA(() => recon.confirmMatches([{ reference: "TXN1", amountKobo: 6000000, invoiceId: adaInv }], actor));
      expect(r.skipped).toBe(1);
      expect(r.recorded).toBe(0);
    });

    it("does not apply a cross-tenant invoice", async () => {
      const r = await asB(() => recon.confirmMatches([{ reference: "TXNX", amountKobo: 1000, invoiceId: adaInv }], { ...actor, schoolId: schoolBId }));
      expect(r.recorded).toBe(0);
      expect(r.errors.length).toBe(1);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: adaInv } })).paidKobo).toBe(6000000);
    });

    it("rejects propose for a foreign term", async () => {
      await expect(asB(() => recon.proposeMatches(termId, [{ reference: "X", amountKobo: 1, narration: "x" }]))).rejects.toThrow(NotFoundException);
    });
  });
});
