import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentChannel } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PaymentsService } from "../payments/payments.service";
import { matchRow, type MatchCandidate } from "./reconcile.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async proposeMatches(termId: string, rows: { reference: string; amountKobo: number; narration: string; date?: string }[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
    });
    const candidates: MatchCandidate[] = invoices
      .filter((i) => i.totalKobo - i.paidKobo > 0)
      .map((i) => ({ invoiceId: i.id, studentName: `${i.student.firstName} ${i.student.lastName}`, admissionNo: i.student.admissionNo, balanceKobo: i.totalKobo - i.paidKobo }));
    return rows.map((row) => {
      const m = matchRow({ narration: row.narration, amountKobo: row.amountKobo }, candidates);
      return { row, candidates: m.candidates, suggestedInvoiceId: m.suggestedInvoiceId };
    });
  }

  async confirmMatches(confirmations: { reference: string; amountKobo: number; invoiceId: string }[], actor: RequestUser) {
    TenantContext.schoolIdOrThrow();
    let recorded = 0, skipped = 0;
    const errors: { reference: string; message: string }[] = [];
    for (const c of confirmations) {
      try {
        await this.payments.recordOfflinePayment({ invoiceId: c.invoiceId, amountKobo: c.amountKobo, channel: PaymentChannel.BANK_TRANSFER, reference: c.reference }, actor);
        recorded++;
      } catch (e) {
        if (e instanceof ConflictException) skipped++;
        else errors.push({ reference: c.reference, message: e instanceof Error ? e.message : "Failed to record." });
      }
    }
    return { recorded, skipped, errors };
  }
}
