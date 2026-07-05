/**
 * MF-1 Task 4 — Apply discounts in generateInvoices + expose in invoice reads
 *
 * Tests:
 *   1. PERCENT 50 -> gross/discount/net correct, one InvoiceDiscount row, breakdown in getInvoice, balance
 *   2. Stacked percent+fixed correct
 *   3. Inactive scheme ignored
 *   4. Regression: no schemes -> gross==total, discount 0, no InvoiceDiscount rows
 *   5. Paid invoice (paidKobo>0) skipped/unchanged after assigning a scheme
 *   6. Re-generating an unpaid invoice refreshes discount + replaces (not duplicates) InvoiceDiscount rows
 */

import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { FeesService } from "./fees.service";

const prisma = new PrismaClient();

describe("FeesService — discounts in generateInvoices", () => {
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
      data: { name: `FeesDiscounts-${ts}`, slug: `fees-discounts-${ts}` } as never,
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

  // ────────────────────────────────────────────────────────────────────────
  // 1. Single PERCENT 50
  // ────────────────────────────────────────────────────────────────────────

  it("applies a PERCENT 50 discount: gross/discount/net + one InvoiceDiscount row + balance", async () => {
    const studentId = await makeStudent(`FD-P50-${Date.now()}`, "Amina");

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `Percent50-${Date.now()}`, method: "PERCENT", value: 50 },
    });
    await prisma.studentDiscount.create({
      data: { schoolId, studentId, discountSchemeId: scheme.id },
    });

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.grossKobo).toBe(100000);
    expect(invoice.discountKobo).toBe(50000);
    expect(invoice.totalKobo).toBe(50000);
    expect(invoice.balanceKobo).toBe(50000);
    expect(invoice.discounts).toEqual([{ name: scheme.name, amountKobo: 50000 }]);

    const rows = await prisma.invoiceDiscount.findMany({ where: { schoolId, invoiceId: invoice.id } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.amountKobo).toBe(50000);
    expect(rows[0]!.schemeId).toBe(scheme.id);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Stacked percent + fixed
  // ────────────────────────────────────────────────────────────────────────

  it("stacks PERCENT then FIXED correctly", async () => {
    const studentId = await makeStudent(`FD-STACK-${Date.now()}`, "Bello");

    const pct = await prisma.discountScheme.create({
      data: { schoolId, name: `StackPct-${Date.now()}`, method: "PERCENT", value: 20 },
    });
    const fixed = await prisma.discountScheme.create({
      data: { schoolId, name: `StackFixed-${Date.now()}`, method: "FIXED", value: 10000 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: pct.id } });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: fixed.id } });

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    // gross 100000; PERCENT 20 -> 20000; FIXED 10000 -> 10000; total discount 30000
    expect(invoice.grossKobo).toBe(100000);
    expect(invoice.discountKobo).toBe(30000);
    expect(invoice.totalKobo).toBe(70000);
    expect(invoice.discounts.length).toBe(2);
    const sum = invoice.discounts.reduce((s, d) => s + d.amountKobo, 0);
    expect(sum).toBe(30000);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Inactive scheme ignored
  // ────────────────────────────────────────────────────────────────────────

  it("ignores an inactive scheme", async () => {
    const studentId = await makeStudent(`FD-INACTIVE-${Date.now()}`, "Chidi");

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `Inactive-${Date.now()}`, method: "PERCENT", value: 50, active: false },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.grossKobo).toBe(100000);
    expect(invoice.discountKobo).toBe(0);
    expect(invoice.totalKobo).toBe(100000);
    expect(invoice.discounts).toEqual([]);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Regression: no schemes
  // ────────────────────────────────────────────────────────────────────────

  it("regression: no schemes -> gross==total, discount 0, no InvoiceDiscount rows", async () => {
    const studentId = await makeStudent(`FD-NONE-${Date.now()}`, "Doyin");

    await asSchool(() => service.generateInvoices(termId));

    const invoice = await asSchool(() => service.getInvoice(studentId, termId));
    expect(invoice.grossKobo).toBe(100000);
    expect(invoice.totalKobo).toBe(100000);
    expect(invoice.discountKobo).toBe(0);
    expect(invoice.discounts).toEqual([]);

    const rows = await prisma.invoiceDiscount.findMany({ where: { schoolId, invoiceId: invoice.id } });
    expect(rows.length).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Paid invoice skipped
  // ────────────────────────────────────────────────────────────────────────

  it("skips a paid invoice (paidKobo>0) even after assigning a scheme", async () => {
    const studentId = await makeStudent(`FD-PAID-${Date.now()}`, "Efe");

    await asSchool(() => service.generateInvoices(termId));
    const before = await asSchool(() => service.getInvoice(studentId, termId));
    expect(before.totalKobo).toBe(100000);

    // Mark as paid directly
    await prisma.invoice.update({ where: { id: before.id }, data: { paidKobo: 100000 } });

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `PaidSkip-${Date.now()}`, method: "PERCENT", value: 50 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    const result = await asSchool(() => service.generateInvoices(termId));
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const after = await asSchool(() => service.getInvoice(studentId, termId));
    expect(after.grossKobo).toBe(before.grossKobo);
    expect(after.discountKobo).toBe(before.discountKobo);
    expect(after.totalKobo).toBe(100000);
    expect(after.discounts).toEqual([]);
    expect(after.paidKobo).toBe(100000);
    expect(after.balanceKobo).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Re-generation refreshes discount, replaces InvoiceDiscount rows
  // ────────────────────────────────────────────────────────────────────────

  it("re-generating an unpaid invoice refreshes discount and replaces (not duplicates) InvoiceDiscount rows", async () => {
    const studentId = await makeStudent(`FD-REGEN-${Date.now()}`, "Grace");

    await asSchool(() => service.generateInvoices(termId));
    const before = await asSchool(() => service.getInvoice(studentId, termId));
    expect(before.discountKobo).toBe(0);

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `Regen-${Date.now()}`, method: "PERCENT", value: 50 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    await asSchool(() => service.generateInvoices(termId));
    const afterFirst = await asSchool(() => service.getInvoice(studentId, termId));
    expect(afterFirst.discountKobo).toBe(50000);
    expect(afterFirst.discounts.length).toBe(1);

    // regenerate again without changing anything -> rows replaced, not duplicated
    await asSchool(() => service.generateInvoices(termId));
    const afterSecond = await asSchool(() => service.getInvoice(studentId, termId));
    expect(afterSecond.discountKobo).toBe(50000);
    expect(afterSecond.discounts.length).toBe(1);

    const rows = await prisma.invoiceDiscount.findMany({ where: { schoolId, invoiceId: afterSecond.id } });
    expect(rows.length).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // getInvoices rows include gross/discount
  // ────────────────────────────────────────────────────────────────────────

  it("getInvoices rows include grossKobo and discountKobo alongside net totalKobo", async () => {
    const studentId = await makeStudent(`FD-LIST-${Date.now()}`, "Halima");

    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: `List-${Date.now()}`, method: "FIXED", value: 15000 },
    });
    await prisma.studentDiscount.create({ data: { schoolId, studentId, discountSchemeId: scheme.id } });

    await asSchool(() => service.generateInvoices(termId));

    const rows = await asSchool(() => service.getInvoices(termId));
    const row = rows.find((r) => r.studentId === studentId);
    expect(row).toBeDefined();
    expect(row!.grossKobo).toBe(100000);
    expect(row!.discountKobo).toBe(15000);
    expect(row!.totalKobo).toBe(85000);
    expect(row!.balanceKobo).toBe(85000);
  });
});
