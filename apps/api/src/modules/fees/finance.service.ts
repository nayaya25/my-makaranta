import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { summarizeInvoices, type SummaryRow } from "./finance-summary.util";

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async getFinanceSummary(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");

    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: { classLevel: { select: { name: true } } },
    });
    const rows: SummaryRow[] = invoices.map((i) => ({
      classLevelId: i.classLevelId,
      classLevelName: i.classLevel.name,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      dueDate: i.dueDate,
    }));
    const summary = summarizeInvoices(rows, new Date());

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const agg = await this.prisma.payment.aggregate({
      where: { schoolId, status: "SUCCESS", paidAt: { gte: weekAgo }, invoice: { termId } },
      _sum: { amountKobo: true },
    });
    return { ...summary, collectedThisWeekKobo: agg._sum.amountKobo ?? 0 };
  }
}
