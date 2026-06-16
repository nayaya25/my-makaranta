import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { FeeItemInput } from "./dto/fees.dto";

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

  private async assertClassLevelTerm(schoolId: string, classLevelId: string, termId: string) {
    const [lvl, term] = await Promise.all([
      this.prisma.classLevel.findFirst({ where: { id: classLevelId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!lvl) throw new NotFoundException("Class level not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
  }

  async setFeeItems(classLevelId: string, termId: string, items: FeeItemInput[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);
    for (const it of items) {
      if (!it.name.trim()) throw new BadRequestException("Fee item name is required.");
      if (it.amountKobo < 0) throw new BadRequestException("Fee amount cannot be negative.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.feeItem.deleteMany({ where: { schoolId, classLevelId, termId } });
      if (items.length) {
        await tx.feeItem.createMany({
          data: items.map((it) => ({ schoolId, classLevelId, termId, name: it.name.trim(), amountKobo: it.amountKobo, order: it.order })),
        });
      }
    });
    return this.getFeeItems(classLevelId, termId);
  }

  async getFeeItems(classLevelId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);
    return this.prisma.feeItem.findMany({ where: { schoolId, classLevelId, termId }, orderBy: { order: "asc" } });
  }

  async generateInvoices(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");

    const enrollments = await this.prisma.enrollment.findMany({
      where: { termId, class: { schoolId } },
      select: { studentId: true, class: { select: { classLevelId: true } } },
    });
    const feeItems = await this.prisma.feeItem.findMany({ where: { schoolId, termId } });
    const itemsByLevel = new Map<string, { name: string; amountKobo: number }[]>();
    for (const fi of feeItems) {
      const arr = itemsByLevel.get(fi.classLevelId) ?? [];
      arr.push({ name: fi.name, amountKobo: fi.amountKobo });
      itemsByLevel.set(fi.classLevelId, arr);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0, refreshed = 0, skipped = 0;
      const existing = await tx.invoice.findMany({ where: { schoolId, termId }, select: { studentId: true, paidKobo: true } });
      const paidByStudent = new Map(existing.map((e) => [e.studentId, e.paidKobo]));
      for (const e of enrollments) {
        const classLevelId = e.class.classLevelId;
        const lines = itemsByLevel.get(classLevelId) ?? [];
        const totalKobo = lines.reduce((s, l) => s + l.amountKobo, 0);
        const prevPaid = paidByStudent.get(e.studentId);
        if (prevPaid !== undefined && prevPaid > 0) { skipped++; continue; }
        const invoice = await tx.invoice.upsert({
          where: { studentId_termId: { studentId: e.studentId, termId } },
          create: { schoolId, studentId: e.studentId, termId, classLevelId, totalKobo },
          update: { classLevelId, totalKobo },
        });
        await tx.invoiceLine.deleteMany({ where: { schoolId, invoiceId: invoice.id } });
        if (lines.length) {
          await tx.invoiceLine.createMany({ data: lines.map((l) => ({ schoolId, invoiceId: invoice.id, name: l.name, amountKobo: l.amountKobo })) });
        }
        if (prevPaid === undefined) created++; else refreshed++;
      }
      return { created, refreshed, skipped };
    });
    return result;
  }

  async getInvoices(termId: string, classId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    let studentIds: string[] | undefined;
    if (classId) {
      const enr = await this.prisma.enrollment.findMany({ where: { termId, classId, class: { schoolId } }, select: { studentId: true } });
      studentIds = enr.map((e) => e.studentId);
    }
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
      include: { student: { select: { firstName: true, lastName: true } }, classLevel: { select: { name: true } } },
    });
    return invoices.map((i) => ({
      studentId: i.studentId,
      name: `${i.student.firstName} ${i.student.lastName}`,
      classLevelName: i.classLevel.name,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
    }));
  }

  async getInvoice(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({
      where: { schoolId, studentId, termId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        classLevel: { select: { name: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
        lines: true,
      },
    });
    if (!invoice) throw new NotFoundException("No invoice for this student/term.");
    return {
      student: { name: `${invoice.student.firstName} ${invoice.student.lastName}`, admissionNo: invoice.student.admissionNo },
      term: { label: `${invoice.term.academicYear.name} · Term ${invoice.term.number}` },
      classLevelName: invoice.classLevel.name,
      lines: invoice.lines.map((l) => ({ name: l.name, amountKobo: l.amountKobo })),
      totalKobo: invoice.totalKobo,
      paidKobo: invoice.paidKobo,
      balanceKobo: invoice.totalKobo - invoice.paidKobo,
    };
  }
}
