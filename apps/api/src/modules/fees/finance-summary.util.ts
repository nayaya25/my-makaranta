import { computeInvoiceStatus } from "./invoice-status.util";

export interface SummaryRow { classLevelId: string; classLevelName: string; totalKobo: number; paidKobo: number; dueDate: Date | null; }
export interface ClassLevelSummary { classLevelId: string; classLevelName: string; expectedKobo: number; collectedKobo: number; outstandingKobo: number; studentCount: number; }
export interface FinanceSummary { expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; byClassLevel: ClassLevelSummary[]; }

export function summarizeInvoices(rows: SummaryRow[], now: Date): FinanceSummary {
  let expectedKobo = 0, collectedKobo = 0, outstandingKobo = 0, overdueKobo = 0;
  const groups = new Map<string, ClassLevelSummary>();
  for (const r of rows) {
    const balance = r.totalKobo - r.paidKobo;
    expectedKobo += r.totalKobo;
    collectedKobo += r.paidKobo;
    outstandingKobo += balance;
    if (computeInvoiceStatus({ totalKobo: r.totalKobo, paidKobo: r.paidKobo, dueDate: r.dueDate, now }) === "OVERDUE") {
      overdueKobo += balance;
    }
    const g = groups.get(r.classLevelId) ?? { classLevelId: r.classLevelId, classLevelName: r.classLevelName, expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, studentCount: 0 };
    g.expectedKobo += r.totalKobo;
    g.collectedKobo += r.paidKobo;
    g.outstandingKobo += balance;
    g.studentCount += 1;
    groups.set(r.classLevelId, g);
  }
  const byClassLevel = [...groups.values()].sort((a, b) => a.classLevelName.localeCompare(b.classLevelName));
  return { expectedKobo, collectedKobo, outstandingKobo, overdueKobo, byClassLevel };
}
