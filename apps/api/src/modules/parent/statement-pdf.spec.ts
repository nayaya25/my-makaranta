/**
 * Money/Fees MF-3 Task 3 — Statement PDF
 *
 * Tests:
 *   1. buildStatement(ownChildId, parentUser) -> invoices (composed) + overall = Σ invoices.
 *   2. buildStatement(foreignChildId, parentUser) -> NotFoundException.
 *   3. renderStatementPdf(data) -> Buffer starting with %PDF, length > 1000.
 */

import { PrismaClient } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ParentService } from "./parent.service";
import { renderStatementPdf, type StatementData } from "./statement-pdf";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const prisma = new PrismaClient();

describe("ParentService.buildStatement + renderStatementPdf (MF-3 Task 3)", () => {
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
      data: { name: `ParentStatement-${ts}`, slug: `parent-statement-${ts}` } as never,
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

    service = new ParentService(prisma as unknown as PrismaService, {} as never, {} as never);
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

  it("buildStatement returns the child's composed invoices + overall = sum of invoices", async () => {
    const studentId = await makeStudent(`PS-OWN-${Date.now()}`, "Amina");
    const parentUser = await makeParentWithChild(`0900${Date.now()}`.slice(0, 14), studentId);

    const invoiceA = await prisma.invoice.create({
      data: {
        schoolId, studentId, termId, classLevelId,
        grossKobo: 100000, discountKobo: 20000, totalKobo: 80000, paidKobo: 40000,
        dueDate: new Date("2026-11-15"),
      },
    });
    await prisma.invoiceLine.createMany({
      data: [
        { schoolId, invoiceId: invoiceA.id, name: "Tuition", amountKobo: 80000 },
        { schoolId, invoiceId: invoiceA.id, name: "Books", amountKobo: 20000 },
      ],
    });
    await prisma.invoiceDiscount.create({
      data: { schoolId, invoiceId: invoiceA.id, name: "Sibling Discount", amountKobo: 20000 },
    });
    await prisma.installment.createMany({
      data: [
        { schoolId, invoiceId: invoiceA.id, order: 0, label: "First", amountKobo: 40000, dueDate: new Date("2026-10-01") },
        { schoolId, invoiceId: invoiceA.id, order: 1, label: "Second", amountKobo: 40000, dueDate: new Date("2026-11-15") },
      ],
    });
    const payment = await prisma.payment.create({
      data: {
        schoolId, invoiceId: invoiceA.id, amountKobo: 40000, channel: "CASH",
        reference: `PS-REF-${Date.now()}`, status: "SUCCESS", paidAt: new Date("2026-09-20"), recordedBy: "test",
      },
    });
    await prisma.receipt.create({
      data: {
        code: `PS-RCPT-${Date.now()}`, paymentId: payment.id, schoolId, receiptNo: `RCP-${Date.now()}`,
        studentName: "Amina Test", schoolName: "Test School", termLabel: "Term 1",
        amountKobo: 40000, channel: "CASH", paidAt: new Date("2026-09-20"), balanceAfterKobo: 40000,
      },
    });

    const termB = await prisma.term.create({
      data: { schoolId, academicYearId, number: 2, startDate: new Date("2027-01-01"), endDate: new Date("2027-04-15") },
    });

    const invoiceB = await prisma.invoice.create({
      data: {
        schoolId, studentId, termId: termB.id, classLevelId,
        grossKobo: 30000, discountKobo: 0, totalKobo: 30000, paidKobo: 30000,
      },
    });
    await prisma.invoiceLine.create({ data: { schoolId, invoiceId: invoiceB.id, name: "Uniform", amountKobo: 30000 } });

    const statement = await asSchool(() => service.buildStatement(studentId, parentUser));

    expect(statement.student.name).toBe("Amina Test");
    expect(statement.student.admissionNo).toContain("PS-OWN-");
    expect(statement.school.name).toContain("ParentStatement-");
    expect(statement.invoices.length).toBe(2);

    const invA = statement.invoices.find((i) => i.invoiceId === invoiceA.id)!;
    const invB = statement.invoices.find((i) => i.invoiceId === invoiceB.id)!;
    expect(invA).toBeDefined();
    expect(invB).toBeDefined();
    expect(invA.lines).toEqual([
      { name: "Tuition", amountKobo: 80000 },
      { name: "Books", amountKobo: 20000 },
    ]);
    expect(invA.discounts).toEqual([{ name: "Sibling Discount", amountKobo: 20000 }]);
    expect(invA.installments.length).toBe(2);
    expect(invA.payments.length).toBe(1);
    expect(invA.balanceKobo).toBe(40000);
    expect(invB.balanceKobo).toBe(0);

    const expectedOverall = {
      totalKobo: invA.totalKobo + invB.totalKobo,
      paidKobo: invA.paidKobo + invB.paidKobo,
      balanceKobo: invA.balanceKobo + invB.balanceKobo,
    };
    expect(statement.overall).toEqual(expectedOverall);
  });

  it("buildStatement for a foreign child -> NotFoundException", async () => {
    const ownStudentId = await makeStudent(`PS-SELF-${Date.now()}`, "Chidi");
    const parentUser = await makeParentWithChild(`0901${Date.now()}`.slice(0, 14), ownStudentId);

    const otherStudentId = await makeStudent(`PS-OTHER-${Date.now()}`, "Doyin");
    await makeParentWithChild(`0902${Date.now()}`.slice(0, 14), otherStudentId);

    await expect(asSchool(() => service.buildStatement(otherStudentId, parentUser))).rejects.toThrow(NotFoundException);
  });

  it("renderStatementPdf returns a PDF Buffer", async () => {
    const data: StatementData = {
      school: { name: "Greenfield Academy" },
      student: { name: "Amina Test", admissionNo: "PS-OWN-1" },
      invoices: [
        {
          invoiceId: "inv-1",
          termLabel: "2026/2027 · Term 1",
          lines: [{ name: "Tuition", amountKobo: 80000 }],
          discounts: [{ name: "Sibling Discount", amountKobo: 20000 }],
          installments: [
            { order: 0, label: "First", amountKobo: 40000, dueDate: new Date("2026-10-01"), paidKobo: 40000, status: "PAID" },
            { order: 1, label: "Second", amountKobo: 40000, dueDate: new Date("2026-11-15"), paidKobo: 0, status: "DUE" },
          ],
          payments: [
            { paidAt: new Date("2026-09-20"), amountKobo: 40000, channel: "CASH", reference: "PS-REF-1", receiptCode: "PS-RCPT-1" },
          ],
          grossKobo: 100000,
          discountKobo: 20000,
          totalKobo: 80000,
          paidKobo: 40000,
          balanceKobo: 40000,
          status: "PARTIAL",
        },
      ],
      overall: { totalKobo: 80000, paidKobo: 40000, balanceKobo: 40000 },
    };

    const buffer = await renderStatementPdf(data);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
