import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import { PaymentsService } from "../payments/payments.service";
import { computeInvoiceStatus } from "../fees/invoice-status.util";

@Injectable()
export class ParentService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async getChildren(user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: user.identityId, schoolId } });
    if (!parent) return [];
    const guardians = await this.prisma.guardian.findMany({
      where: { parentId: parent.id },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    });
    return guardians.map((g) => ({
      studentId: g.student.id,
      name: `${g.student.firstName} ${g.student.lastName}`,
      admissionNo: g.student.admissionNo,
    }));
  }

  private async childStudentIds(user: RequestUser): Promise<string[]> {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: user.identityId, schoolId } });
    if (!parent) return [];
    const guardians = await this.prisma.guardian.findMany({ where: { parentId: parent.id, student: { schoolId } }, select: { studentId: true } });
    return guardians.map((g) => g.studentId);
  }

  async getInvoices(user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ids = await this.childStudentIds(user);
    if (ids.length === 0) return [];
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, studentId: { in: ids } },
      include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } },
    });
    const now = new Date();
    return invoices.map((i) => ({
      studentId: i.studentId,
      studentName: `${i.student.firstName} ${i.student.lastName}`,
      invoiceId: i.id,
      termLabel: `${i.term.academicYear.name} · Term ${i.term.number}`,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
      status: computeInvoiceStatus({ totalKobo: i.totalKobo, paidKobo: i.paidKobo, dueDate: i.dueDate, now }),
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    }));
  }

  async pay(dto: { invoiceId: string; amountKobo: number; email: string }, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, schoolId }, select: { studentId: true } });
    const ids = await this.childStudentIds(user);
    if (!invoice || !ids.includes(invoice.studentId)) throw new NotFoundException("Invoice not found.");
    return this.payments.initializeOnline({ invoiceId: dto.invoiceId, amountKobo: dto.amountKobo, email: dto.email }, user);
  }

  async payVerify(reference: string, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const payment = await this.prisma.payment.findFirst({ where: { reference, schoolId }, select: { invoiceId: true } });
    if (!payment) throw new NotFoundException("Payment not found.");
    const invoice = await this.prisma.invoice.findFirst({ where: { id: payment.invoiceId, schoolId }, select: { studentId: true } });
    const ids = await this.childStudentIds(user);
    if (!invoice || !ids.includes(invoice.studentId)) throw new NotFoundException("Payment not found.");
    return this.payments.verifyPayment(reference, user);
  }
}
