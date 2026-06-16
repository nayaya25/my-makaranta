export type InvoiceStatusValue = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

/** Derived invoice status from balance + due date (no stored column). */
export function computeInvoiceStatus(args: { totalKobo: number; paidKobo: number; dueDate: Date | null; now: Date }): InvoiceStatusValue {
  if (args.paidKobo >= args.totalKobo) return "PAID";
  if (args.dueDate && args.dueDate.getTime() < args.now.getTime()) return "OVERDUE";
  if (args.paidKobo > 0) return "PARTIAL";
  return "UNPAID";
}
