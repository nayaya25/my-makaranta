export type ScheduleRow = { order: number; label: string | null; percentBps: number; dueDate: Date };
export type SplitInstallment = { order: number; label: string | null; amountKobo: number; dueDate: Date };

/** Split netKobo across rows by basis points; the last row absorbs rounding so the
 *  amounts sum exactly to netKobo. Assumes Σ percentBps === 10000 and rows are ordered. */
export function splitInstallments(netKobo: number, rows: ScheduleRow[]): SplitInstallment[] {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const out: SplitInstallment[] = [];
  let allocated = 0;
  sorted.forEach((r, i) => {
    const amountKobo = i === sorted.length - 1 ? netKobo - allocated : Math.floor((netKobo * r.percentBps) / 10000);
    allocated += amountKobo;
    out.push({ order: r.order, label: r.label, amountKobo, dueDate: r.dueDate });
  });
  return out;
}

export type InstallmentRow = { order: number; label: string | null; amountKobo: number; dueDate: Date };
export type InstallmentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";
export type AllocatedInstallment = InstallmentRow & { paidKobo: number; status: InstallmentStatus };

/** Waterfall-allocate paidKobo across ordered installments; derive each one's status. */
export function allocatePayments(paidKobo: number, installments: InstallmentRow[], now: Date): AllocatedInstallment[] {
  const sorted = [...installments].sort((a, b) => a.order - b.order);
  let remaining = paidKobo;
  return sorted.map((inst) => {
    const paid = Math.max(0, Math.min(remaining, inst.amountKobo));
    remaining -= paid;
    let status: InstallmentStatus;
    if (paid >= inst.amountKobo) status = "PAID";
    else if (inst.dueDate.getTime() < now.getTime()) status = "OVERDUE";
    else if (paid > 0) status = "PARTIAL";
    else status = "DUE";
    return { ...inst, paidKobo: paid, status };
  });
}
