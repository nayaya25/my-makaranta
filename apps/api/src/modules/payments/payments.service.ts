import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PaymentChannel } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PAYMENT_SERVICE, type PaymentProvider } from "../../core/payments/payments.types";
import { generatePaymentReference, generateReceiptCode, generateReceiptNo } from "./payment.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const OFFLINE_CHANNELS: PaymentChannel[] = [PaymentChannel.CASH, PaymentChannel.BANK_TRANSFER];

type InvoiceWithCtx = {
  id: string; studentId: string; totalKobo: number; paidKobo: number;
  student: { firstName: string; lastName: string };
  term: { number: number; academicYear: { name: string } };
};

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_SERVICE) private provider: PaymentProvider,
  ) {}

  private async invoiceOr404(schoolId: string, invoiceId: string): Promise<InvoiceWithCtx> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } },
    });
    if (!inv) throw new NotFoundException("Invoice not found in this school.");
    return inv as InvoiceWithCtx;
  }

  async recordOfflinePayment(dto: { invoiceId: string; amountKobo: number; channel: PaymentChannel; reference?: string }, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.amountKobo <= 0) throw new BadRequestException("Amount must be positive.");
    if (!OFFLINE_CHANNELS.includes(dto.channel)) throw new BadRequestException("Channel must be CASH or BANK_TRANSFER for a recorded payment.");
    const invoice = await this.invoiceOr404(schoolId, dto.invoiceId);
    const reference = dto.reference?.trim() || generatePaymentReference();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: { schoolId, invoiceId: invoice.id, amountKobo: dto.amountKobo, channel: dto.channel, reference, status: "SUCCESS", paidAt: new Date(), recordedBy: actor.id },
        });
        const updated = await tx.invoice.update({ where: { id: invoice.id, schoolId }, data: { paidKobo: { increment: dto.amountKobo } } });
        const receiptCode = await this.writeReceipt(tx, payment.id, schoolId, invoice, dto.amountKobo, dto.channel, updated.totalKobo - updated.paidKobo, payment.paidAt ?? new Date());
        return { paymentId: payment.id, receiptCode };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("A payment with this reference already exists.");
      }
      throw e;
    }
  }

  async initializeOnline(dto: { invoiceId: string; amountKobo: number; email: string }, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.amountKobo <= 0) throw new BadRequestException("Amount must be positive.");
    const invoice = await this.invoiceOr404(schoolId, dto.invoiceId);
    const reference = generatePaymentReference();
    await this.prisma.payment.create({
      data: { schoolId, invoiceId: invoice.id, amountKobo: dto.amountKobo, channel: "PAYSTACK", reference, status: "PENDING", recordedBy: actor.id },
    });
    const { authorizationUrl } = await this.provider.initialize({ reference, amountKobo: dto.amountKobo, email: dto.email, metadata: { invoiceId: invoice.id, schoolId } });
    return { reference, authorizationUrl };
  }

  async verifyPayment(reference: string, _actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const payment = await this.prisma.payment.findFirst({ where: { reference, schoolId } });
    if (!payment) throw new NotFoundException("Payment not found.");
    const result = await this.provider.verify(reference);
    if (result.status === "success") return this.applyByReference(reference);
    return { applied: false, status: result.status };
  }

  /** Idempotent apply: claims the PENDING->SUCCESS transition; safe to call repeatedly; unknown ref → no-op. */
  private async applyByReference(reference: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({ where: { reference, status: "PENDING" }, data: { status: "SUCCESS", paidAt: new Date() } });
      if (claim.count === 0) return { applied: false, status: "noop" as const };
      const payment = await tx.payment.findFirstOrThrow({ where: { reference } });
      const invoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { paidKobo: { increment: payment.amountKobo } },
        include: { student: { select: { firstName: true, lastName: true } }, term: { select: { number: true, academicYear: { select: { name: true } } } } },
      });
      const receiptCode = await this.writeReceipt(tx, payment.id, payment.schoolId, invoice as InvoiceWithCtx, payment.amountKobo, payment.channel, invoice.totalKobo - invoice.paidKobo, payment.paidAt ?? new Date());
      return { applied: true, status: "success" as const, receiptCode };
    });
  }

  /** Public webhook entry — NO tenant context; resolves schoolId from the payment row. */
  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.provider.verifySignature(rawBody, signature)) throw new BadRequestException("Invalid signature.");
    let event: { event?: string; data?: { reference?: string } };
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { return { ok: true }; }
    if (event.event === "charge.success" && event.data?.reference) {
      await this.applyByReference(event.data.reference);
    }
    return { ok: true };
  }

  async getReceipt(code: string) {
    if (!code) return null;
    const r = await this.prisma.receipt.findUnique({ where: { code } });
    if (!r) return null;
    return { receiptNo: r.receiptNo, school: r.schoolName, student: r.studentName, term: r.termLabel, amountKobo: r.amountKobo, channel: r.channel, paidAt: r.paidAt.toISOString(), balanceAfterKobo: r.balanceAfterKobo };
  }

  async getPayments(invoiceId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.invoiceOr404(schoolId, invoiceId);
    return this.prisma.payment.findMany({ where: { schoolId, invoiceId }, orderBy: { createdAt: "desc" } });
  }

  private async writeReceipt(
    tx: Prisma.TransactionClient,
    paymentId: string, schoolId: string, invoice: InvoiceWithCtx,
    amountKobo: number, channel: PaymentChannel, balanceAfterKobo: number, paidAt: Date,
  ): Promise<string> {
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    const code = generateReceiptCode();
    await tx.receipt.create({
      data: {
        code, paymentId, schoolId, receiptNo: generateReceiptNo(),
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        schoolName: school?.name ?? "", termLabel: `${invoice.term.academicYear.name} · Term ${invoice.term.number}`,
        amountKobo, channel: String(channel), paidAt, balanceAfterKobo,
      },
    });
    return code;
  }
}
