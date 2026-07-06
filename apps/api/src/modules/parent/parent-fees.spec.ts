/**
 * Money/Fees MF-3 Task 1 — Parent invoice detail + installment-aware list
 *
 * Tests:
 *   1. getInvoiceDetail(ownInvoice, parentUser) -> lines/discounts/installments (allocated)/payments
 *      (with receiptCode) + correct gross/discount/total/paid/balance.
 *   2. getInvoiceDetail(foreignInvoice, parentUser) -> NotFoundException.
 *   3. getInvoiceDetail for a non-parent user -> NotFoundException.
 *   4. getInvoices(parentUser) rows include installment-aware status + nextInstallmentKobo
 *      (with a schedule = first unpaid installment's outstanding; without = balanceKobo).
 */

import { PrismaClient } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ParentService } from "./parent.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const prisma = new PrismaClient();

describe("ParentService — invoice detail + installment-aware list (MF-3 Task 1)", () => {
  let service: ParentService;
  let schoolId: string;
  let classLevelId: string;
  let classId: string;
  let academicYearId: string;
  let termId: string;

  const testSchoolIds: string[] = [];

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `ParentFees-${ts}`, slug: `parent-fees-${ts}` } as never,
    });
    schoolId = school.id;
    testSchoolIds.push(schoolId);

    const classLevel = await prisma.classLevel.create({ data: { schoolId, name: "JSS 1", order: 1 } });
    classLevelId = classLevel.id;

    const klass = await prisma.class.create({ data: { schoolId, classLevelId, name: "JSS 1A" } });
    classId = klass.id;

    const academicYear = await prisma.academicYear.create({
      data: { schoolId, name: `${ts}/2027`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
    });
    academicYearId = academicYear.id;

    const term = await prisma.term.create({
      data: { schoolId, academicYearId, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    });
    termId = term.id;

    service = new ParentService(prisma as unknown as PrismaService, {} as never);
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.payment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.installment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoiceDiscount.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoiceLine.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.invoice.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.guardian.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.enrollment.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.parent.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
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
      data: { schoolId, admissionNo, firstName, lastName: "Test", gender: "FEMALE", dateOfBirth: new Date("2015-01-01") },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, classId, termId } });
    return student.id;
  }

  async function makeParentWithChild(phone: string, studentId: string): Promise<RequestUser> {
    const parent = await prisma.parent.create({
      data: { schoolId, phone, firstName: "Parent", lastName: phone, preferredLang: "EN" },
    });
    await prisma.guardian.create({
      data: { studentId, parentId: parent.id, relationship: "MOTHER", isPrimary: true },
    });
    return { id: `user-${parent.id}`, schoolId, identityType: "PARENT", identityId: parent.id };
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1 & 4. Own child's invoice, with schedule + discount + payment + receipt
  // ────────────────────────────────────────────────────────────────────────

  it("getInvoiceDetail composes lines/discounts/installments/payments with receiptCode + correct totals", async () => {
    const studentId = await makeStudent(`PF-OWN-${Date.now()}`, "Amina");
    const parentUser = await makeParentWithChild(`0800${Date.now()}`.slice(0, 14), studentId);

    const invoice = await prisma.invoice.create({
      data: {
        schoolId, studentId, termId, classLevelId,
        grossKobo: 100000, discountKobo: 20000, totalKobo: 80000, paidKobo: 40000,
        dueDate: new Date("2026-11-15"),
      },
    });

    await prisma.invoiceLine.createMany({
      data: [
        { schoolId, invoiceId: invoice.id, name: "Tuition", amountKobo: 80000 },
        { schoolId, invoiceId: invoice.id, name: "Books", amountKobo: 20000 },
      ],
    });

    await prisma.invoiceDiscount.create({
      data: { schoolId, invoiceId: invoice.id, name: "Sibling Discount", amountKobo: 20000 },
    });

    await prisma.installment.createMany({
      data: [
        { schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 40000, dueDate: new Date("2026-10-01") },
        { schoolId, invoiceId: invoice.id, order: 1, label: "Second", amountKobo: 40000, dueDate: new Date("2026-11-15") },
      ],
    });

    const payment = await prisma.payment.create({
      data: {
        schoolId, invoiceId: invoice.id, amountKobo: 40000, channel: "CASH",
        reference: `PF-REF-${Date.now()}`, status: "SUCCESS", paidAt: new Date("2026-09-20"), recordedBy: "test",
      },
    });
    await prisma.receipt.create({
      data: {
        code: `PF-RCPT-${Date.now()}`, paymentId: payment.id, schoolId, receiptNo: `RCP-${Date.now()}`,
        studentName: "Amina Test", schoolName: "Test School", termLabel: "Term 1",
        amountKobo: 40000, channel: "CASH", paidAt: new Date("2026-09-20"), balanceAfterKobo: 40000,
      },
    });

    const detail = await asSchool(() => service.getInvoiceDetail(invoice.id, parentUser));

    expect(detail.invoiceId).toBe(invoice.id);
    expect(detail.student.name).toBe("Amina Test");
    expect(detail.lines).toEqual([
      { name: "Tuition", amountKobo: 80000 },
      { name: "Books", amountKobo: 20000 },
    ]);
    expect(detail.discounts).toEqual([{ name: "Sibling Discount", amountKobo: 20000 }]);
    expect(detail.grossKobo).toBe(100000);
    expect(detail.discountKobo).toBe(20000);
    expect(detail.totalKobo).toBe(80000);
    expect(detail.paidKobo).toBe(40000);
    expect(detail.balanceKobo).toBe(40000);

    expect(detail.installments.length).toBe(2);
    expect(detail.installments[0]!.status).toBe("PAID");
    expect(detail.installments[0]!.paidKobo).toBe(40000);
    expect(detail.installments[1]!.paidKobo).toBe(0);

    expect(detail.payments.length).toBe(1);
    expect(detail.payments[0]!.amountKobo).toBe(40000);
    expect(detail.payments[0]!.receiptCode).toBe(payment ? (await prisma.receipt.findUnique({ where: { paymentId: payment.id } }))!.code : null);

    expect(detail.status).toBe("PARTIAL");

    // getInvoices row for the same invoice: installment-aware status + nextInstallmentKobo
    const rows = await asSchool(() => service.getInvoices(parentUser));
    const row = rows.find((r) => r.invoiceId === invoice.id)!;
    expect(row).toBeDefined();
    expect(row.status).toBe("PARTIAL");
    // first unpaid installment (order 1) has amountKobo 40000, paidKobo 0 -> outstanding 40000
    expect(row.nextInstallmentKobo).toBe(40000);
    expect(row.nextDueDate).toBe(new Date("2026-11-15").toISOString());
  });

  it("getInvoices without a schedule: nextInstallmentKobo falls back to balanceKobo", async () => {
    const studentId = await makeStudent(`PF-NOSCHED-${Date.now()}`, "Bello");
    const parentUser = await makeParentWithChild(`0801${Date.now()}`.slice(0, 14), studentId);

    const invoice = await prisma.invoice.create({
      data: {
        schoolId, studentId, termId, classLevelId,
        grossKobo: 50000, discountKobo: 0, totalKobo: 50000, paidKobo: 10000,
        dueDate: new Date("2026-12-01"),
      },
    });
    await prisma.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, name: "Tuition", amountKobo: 50000 } });

    const rows = await asSchool(() => service.getInvoices(parentUser));
    const row = rows.find((r) => r.invoiceId === invoice.id)!;
    expect(row).toBeDefined();
    expect(row.nextInstallmentKobo).toBe(40000); // balanceKobo
    expect(row.status).toBe("PARTIAL");
    expect(row.nextDueDate).toBe(new Date("2026-12-01").toISOString());
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Foreign invoice -> NotFoundException
  // ────────────────────────────────────────────────────────────────────────

  it("getInvoiceDetail on another family's invoice -> NotFoundException", async () => {
    const ownStudentId = await makeStudent(`PF-SELF-${Date.now()}`, "Chidi");
    const parentUser = await makeParentWithChild(`0802${Date.now()}`.slice(0, 14), ownStudentId);

    const otherStudentId = await makeStudent(`PF-OTHER-${Date.now()}`, "Doyin");
    await makeParentWithChild(`0803${Date.now()}`.slice(0, 14), otherStudentId);

    const foreignInvoice = await prisma.invoice.create({
      data: { schoolId, studentId: otherStudentId, termId, classLevelId, grossKobo: 30000, discountKobo: 0, totalKobo: 30000, paidKobo: 0 },
    });
    await prisma.invoiceLine.create({ data: { schoolId, invoiceId: foreignInvoice.id, name: "Tuition", amountKobo: 30000 } });

    await expect(asSchool(() => service.getInvoiceDetail(foreignInvoice.id, parentUser))).rejects.toThrow(NotFoundException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Non-parent user -> NotFoundException
  // ────────────────────────────────────────────────────────────────────────

  it("getInvoiceDetail for a non-parent user -> NotFoundException", async () => {
    const studentId = await makeStudent(`PF-STAFFVIEW-${Date.now()}`, "Efe");
    const invoice = await prisma.invoice.create({
      data: { schoolId, studentId, termId, classLevelId, grossKobo: 30000, discountKobo: 0, totalKobo: 30000, paidKobo: 0 },
    });
    await prisma.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, name: "Tuition", amountKobo: 30000 } });

    const staffUser: RequestUser = { id: "staff-1", schoolId, identityType: "STAFF", identityId: "staff-1" };

    await expect(asSchool(() => service.getInvoiceDetail(invoice.id, staffUser))).rejects.toThrow(NotFoundException);
  });
});
