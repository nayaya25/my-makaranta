/**
 * MF-2 Task 4 — Materialize installments in generateInvoices + derive in invoice reads
 *
 * Tests:
 *   1. Schedule 50/25/25 -> 3 Installment rows summing to totalKobo, Invoice.dueDate = last installment's date
 *   2. With an MF-1 discount -> installments scale to discounted net, still sum to totalKobo
 *   3. getInvoice returns allocated installments/status (paidKobo seeded)
 *   4. No schedule -> no Installment rows, installments == [], single-dueDate behavior intact
 *   5. Regenerating an unpaid invoice replaces (not duplicates) installments
 *   6. Regression: balanceKobo = totalKobo - paidKobo; paid-invoice skip preserved
 */

import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { FeesService } from "./fees.service";

const prisma = new PrismaClient();

describe("FeesService — installments in generateInvoices + reads", () => {
  let service: FeesService;
  let schoolId: string;
  let classLevelId: string;
  let classId: string;
  let academicYearId: string;
  let termId: string;

  const testSchoolIds: string[] = [];

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `FeesInstallments-${ts}`, slug: `fees-installments-${ts}` } as never,
    });
    schoolId = school.id;
    testSchoolIds.push(schoolId);

    const classLevel = await prisma.classLevel.create({
      data: { schoolId, name: "JSS 1", order: 1 },
    });
    classLevelId = classLevel.id;

    const klass = await prisma.class.create({
      data: { schoolId, classLevelId, name: "JSS 1A" },
    });
    classId = klass.id;

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `${ts}/2027`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    academicYearId = academicYear.id;

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        number: 1,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });
    termId = term.id;

    await prisma.feeItem.createMany({
      data: [
        { schoolId, classLevelId, termId, name: "Tuition", amountKobo: 80000, order: 0 },
        { schoolId, classLevelId, termId, name: "Books", amountKobo: 20000, order: 1 },
      ],
    });

    service = new FeesService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.installment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.scheduleInstallment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoiceDiscount.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoiceLine.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoice.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.studentDiscount.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.discountScheme.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.enrollment.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.feeItem.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.class.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
    await prisma.$disconnect();
  });

  const asSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId: null }, fn);

  async function makeStudent(admissionNo: string, firstName: string) {
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo,
        firstName,
        lastName: "Test",
        gender: "FEMALE",
        dateOfBirth: new Date("2015-01-01"),
      },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId, termId },
    });
    return student.id;
  }

  async function setSchedule(dueDates: [Date, Date, Date]) {
    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
    await prisma.scheduleInstallment.createMany({
      data: [
        { schoolId, classLevelId, termId, order: 0, label: "First", percentBps: 5000, dueDate: dueDates[0] },
        { schoolId, classLevelId, termId, order: 1, label: "Second", percentBps: 2500, dueDate: dueDates[1] },
        { schoolId, classLevelId, termId, order: 2, label: "Third", percentBps: 2500, dueDate: dueDates[2] },
      ],
    });
  }

  const D1 = new Date("2026-09-15");
  const D2 = new Date("2026-10-15");
  const D3 = new Date("2026-11-15");

  // ────────────────────────────────────────────────────────────────────────
  // 1. Schedule -> 3 Installment rows, dueDate = last
  // ────────────────────────────────────────────────────────────────────────

  it("materializes 3 Installment rows summing to totalKobo, Invoice.dueDate = last installment's date", async () => {
    const studentId = await makeStudent(`FI-SCHED-${Date.now()}`, "Amina");
    await setSchedule([D1, D2, D3]);

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.totalKobo).toBe(100000);
    expect(invoice.installments.length).toBe(3);
    const sum = invoice.installments.reduce((s, i) => s + i.amountKobo, 0);
    expect(sum).toBe(100000);
    expect(invoice.installments[0]!.amountKobo).toBe(50000);
    expect(invoice.installments[1]!.amountKobo).toBe(25000);
    expect(invoice.installments[2]!.amountKobo).toBe(25000);

    const dbInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(dbInvoice.dueDate?.getTime()).toBe(D3.getTime());

    const rows = await prisma.installment.findMany({ where: { schoolId, invoiceId: invoice.id }, orderBy: { order: "asc" } });
    expect(rows.length).toBe(3);
    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Discount -> installments scale to discounted net
  // ────────────────────────────────────────────────────────────────────────

  it("scales installments to the discounted net and still sums to totalKobo", async () => {
    const studentId = await makeStudent(`FI-DISC-${Date.now()}`, "Bello");
    await setSchedule([D1, D2, D3]);

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `InstDisc-${Date.now()}`, method: "PERCENT", value: 50 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.grossKobo).toBe(100000);
    expect(invoice.discountKobo).toBe(50000);
    expect(invoice.totalKobo).toBe(50000);
    expect(invoice.installments.length).toBe(3);
    const sum = invoice.installments.reduce((s, i) => s + i.amountKobo, 0);
    expect(sum).toBe(50000);
    expect(invoice.installments[0]!.amountKobo).toBe(25000);
    expect(invoice.installments[1]!.amountKobo).toBe(12500);
    expect(invoice.installments[2]!.amountKobo).toBe(12500);

    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. getInvoice returns allocated installments/status
  // ────────────────────────────────────────────────────────────────────────

  it("getInvoice returns allocated installments with derived paidKobo/status", async () => {
    const studentId = await makeStudent(`FI-ALLOC-${Date.now()}`, "Chidi");
    await setSchedule([D1, D2, D3]);

    await asSchool(() => service.generateInvoices(termId));
    const before = await asSchool(() => service.getInvoice(studentId, termId));
    expect(before.status).toBe("UNPAID");
    expect(before.installments.every((i) => i.status === "DUE")).toBe(true);

    // Pay exactly the first installment's amount.
    await prisma.invoice.update({ where: { id: before.id }, data: { paidKobo: 50000 } });

    const after = await asSchool(() => service.getInvoice(studentId, termId));
    expect(after.installments[0]!.status).toBe("PAID");
    expect(after.installments[0]!.paidKobo).toBe(50000);
    expect(after.installments[1]!.status).toBe("DUE");
    expect(after.installments[2]!.status).toBe("DUE");
    expect(after.status).toBe("PARTIAL");
    expect(after.balanceKobo).toBe(50000);

    // Fully pay -> PAID overall.
    await prisma.invoice.update({ where: { id: before.id }, data: { paidKobo: 100000 } });
    const paid = await asSchool(() => service.getInvoice(studentId, termId));
    expect(paid.status).toBe("PAID");
    expect(paid.installments.every((i) => i.status === "PAID")).toBe(true);

    // reset for cleanliness (not required but avoids surprising later assertions)
    await prisma.invoice.update({ where: { id: before.id }, data: { paidKobo: 0 } });
    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. No schedule -> no Installment rows, [] + single-dueDate intact
  // ────────────────────────────────────────────────────────────────────────

  it("no schedule: no Installment rows, installments == [], single-dueDate behavior intact", async () => {
    const studentId = await makeStudent(`FI-NOSCHED-${Date.now()}`, "Doyin");
    const dueDate = new Date("2026-12-01");

    await asSchool(() => service.generateInvoices(termId, dueDate));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.installments).toEqual([]);
    expect(invoice.status).toBe("UNPAID");

    const dbInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(dbInvoice.dueDate?.getTime()).toBe(dueDate.getTime());

    const rows = await prisma.installment.findMany({ where: { schoolId, invoiceId: invoice.id } });
    expect(rows.length).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Regenerating an unpaid invoice replaces (not duplicates) installments
  // ────────────────────────────────────────────────────────────────────────

  it("regenerating an unpaid invoice replaces (not duplicates) installments", async () => {
    const studentId = await makeStudent(`FI-REGEN-${Date.now()}`, "Efe");
    await setSchedule([D1, D2, D3]);

    await asSchool(() => service.generateInvoices(termId));
    const first = await asSchool(() => service.getInvoice(studentId, termId));
    expect(first.installments.length).toBe(3);

    await asSchool(() => service.generateInvoices(termId));
    const second = await asSchool(() => service.getInvoice(studentId, termId));
    expect(second.installments.length).toBe(3);

    const rows = await prisma.installment.findMany({ where: { schoolId, invoiceId: second.id } });
    expect(rows.length).toBe(3);

    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Regression: balance invariant + paid-skip preserved
  // ────────────────────────────────────────────────────────────────────────

  it("regression: balanceKobo = totalKobo - paidKobo; paid-invoice skip preserved (with schedule present)", async () => {
    const studentId = await makeStudent(`FI-REGRESS-${Date.now()}`, "Grace");
    await setSchedule([D1, D2, D3]);

    await asSchool(() => service.generateInvoices(termId));
    const before = await asSchool(() => service.getInvoice(studentId, termId));
    expect(before.totalKobo).toBe(100000);
    expect(before.balanceKobo).toBe(100000 - before.paidKobo);

    await prisma.invoice.update({ where: { id: before.id }, data: { paidKobo: 100000 } });

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `RegressDisc-${Date.now()}`, method: "PERCENT", value: 50 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    const result = await asSchool(() => service.generateInvoices(termId));
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const after = await asSchool(() => service.getInvoice(studentId, termId));
    expect(after.totalKobo).toBe(100000);
    expect(after.paidKobo).toBe(100000);
    expect(after.balanceKobo).toBe(0);
    expect(after.status).toBe("PAID");
    // installments untouched by the skipped regeneration attempt (still the original 3 rows)
    expect(after.installments.length).toBe(3);

    await prisma.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
  });
});
