import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import { PaymentsService } from "../payments/payments.service";
import { computeInvoiceStatus } from "../fees/invoice-status.util";
import { allocatePayments, type AllocatedInstallment } from "../fees/installment.util";

const invoiceDetailArgs = {
  include: {
    student: { select: { firstName: true, lastName: true, admissionNo: true } },
    term: { select: { number: true, academicYear: { select: { name: true } } } },
    lines: true,
    invoiceDiscounts: { select: { name: true, amountKobo: true } },
    installments: { orderBy: { order: "asc" as const } },
    payments: { where: { status: "SUCCESS" as const }, orderBy: { paidAt: "asc" as const }, include: { receipt: { select: { code: true } } } },
  },
} satisfies Prisma.InvoiceDefaultArgs;

type InvoiceDetailPayload = Prisma.InvoiceGetPayload<typeof invoiceDetailArgs>;

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
      include: {
        student: { select: { firstName: true, lastName: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
        installments: { orderBy: { order: "asc" } },
      },
    });
    const now = new Date();
    return invoices.map((i) => {
      const allocated = allocatePayments(
        i.paidKobo,
        i.installments.map((inst) => ({ order: inst.order, label: inst.label, amountKobo: inst.amountKobo, dueDate: inst.dueDate })),
        now,
      );
      const status = this.deriveStatus(i.totalKobo, i.paidKobo, allocated, i.dueDate, now);
      const balanceKobo = i.totalKobo - i.paidKobo;
      const nextInstallment = allocated.find((inst) => inst.status !== "PAID");
      const nextDueDate = nextInstallment ? nextInstallment.dueDate : i.dueDate;
      return {
        studentId: i.studentId,
        studentName: `${i.student.firstName} ${i.student.lastName}`,
        invoiceId: i.id,
        termLabel: `${i.term.academicYear.name} · Term ${i.term.number}`,
        totalKobo: i.totalKobo,
        paidKobo: i.paidKobo,
        balanceKobo,
        status,
        dueDate: i.dueDate ? i.dueDate.toISOString() : null,
        nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
        nextInstallmentKobo: nextInstallment ? nextInstallment.amountKobo - nextInstallment.paidKobo : balanceKobo,
      };
    });
  }

  /** Ownership-checked, composed invoice detail (lines/discounts/installments/payments). */
  async getInvoiceDetail(invoiceId: string, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ids = await this.childStudentIds(user);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId, studentId: { in: ids.length ? ids : ["__none__"] } },
      ...invoiceDetailArgs,
    });
    if (!invoice) throw new NotFoundException("Invoice not found.");
    return this.composeInvoice(invoice, new Date());
  }

  /** Shared invoice composition — used by getInvoiceDetail and (Task 3) buildStatement. */
  private composeInvoice(invoice: InvoiceDetailPayload, now: Date) {
    const allocated = allocatePayments(
      invoice.paidKobo,
      invoice.installments.map((i) => ({ order: i.order, label: i.label, amountKobo: i.amountKobo, dueDate: i.dueDate })),
      now,
    );
    const status = this.deriveStatus(invoice.totalKobo, invoice.paidKobo, allocated, invoice.dueDate, now);
    return {
      invoiceId: invoice.id,
      student: { name: `${invoice.student.firstName} ${invoice.student.lastName}`, admissionNo: invoice.student.admissionNo },
      termLabel: `${invoice.term.academicYear.name} · Term ${invoice.term.number}`,
      lines: invoice.lines.map((l) => ({ name: l.name, amountKobo: l.amountKobo })),
      discounts: invoice.invoiceDiscounts.map((d) => ({ name: d.name, amountKobo: d.amountKobo })),
      grossKobo: invoice.grossKobo,
      discountKobo: invoice.discountKobo,
      totalKobo: invoice.totalKobo,
      paidKobo: invoice.paidKobo,
      balanceKobo: invoice.totalKobo - invoice.paidKobo,
      installments: allocated,
      payments: invoice.payments.map((p) => ({
        paidAt: p.paidAt,
        amountKobo: p.amountKobo,
        channel: p.channel,
        reference: p.reference,
        receiptCode: p.receipt?.code ?? null,
      })),
      status,
    };
  }

  /** Installment-aware invoice status (private helper reused by list + detail). */
  private deriveStatus(
    totalKobo: number,
    paidKobo: number,
    installments: AllocatedInstallment[],
    dueDate: Date | null,
    now: Date,
  ): "PAID" | "PARTIAL" | "OVERDUE" | "UNPAID" {
    if (paidKobo >= totalKobo) return "PAID";
    if (installments.some((i) => i.status === "OVERDUE")) return "OVERDUE";
    if (installments.length === 0 && dueDate && dueDate.getTime() < now.getTime()) return "OVERDUE";
    if (paidKobo > 0) return "PARTIAL";
    return "UNPAID";
  }

  /** Ownership-checked fee statement for one child — all invoices composed + overall totals. */
  async buildStatement(studentId: string, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ids = await this.childStudentIds(user);
    if (!ids.includes(studentId)) throw new NotFoundException("Student not found.");

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { firstName: true, lastName: true, admissionNo: true },
    });
    if (!student) throw new NotFoundException("Student not found.");

    const school = await this.prisma.school.findFirst({ where: { id: schoolId }, select: { name: true } });

    const invoices = await this.prisma.invoice.findMany({
      where: { studentId, schoolId },
      orderBy: { issuedAt: "asc" },
      ...invoiceDetailArgs,
    });

    const now = new Date();
    const composed = invoices.map((invoice) => this.composeInvoice(invoice, now));

    const overall = composed.reduce(
      (acc, inv) => ({
        totalKobo: acc.totalKobo + inv.totalKobo,
        paidKobo: acc.paidKobo + inv.paidKobo,
        balanceKobo: acc.balanceKobo + inv.balanceKobo,
      }),
      { totalKobo: 0, paidKobo: 0, balanceKobo: 0 },
    );

    return {
      school: { name: school?.name ?? "" },
      student: { name: `${student.firstName} ${student.lastName}`, admissionNo: student.admissionNo },
      invoices: composed,
      overall,
    };
  }

  /** The parent's children's SUCCESS payments, newest first. */
  async getReceipts(user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ids = await this.childStudentIds(user);
    if (ids.length === 0) return [];
    const payments = await this.prisma.payment.findMany({
      where: { schoolId, status: "SUCCESS", invoice: { studentId: { in: ids } } },
      orderBy: { paidAt: "desc" },
      include: {
        receipt: { select: { code: true } },
        invoice: {
          include: {
            student: { select: { firstName: true, lastName: true } },
            term: { select: { number: true, academicYear: { select: { name: true } } } },
          },
        },
      },
    });
    return payments.map((p) => ({
      paidAt: p.paidAt ?? p.createdAt,
      amountKobo: p.amountKobo,
      childName: `${p.invoice.student.firstName} ${p.invoice.student.lastName}`,
      termLabel: `${p.invoice.term.academicYear.name} · Term ${p.invoice.term.number}`,
      receiptCode: p.receipt?.code ?? null,
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
