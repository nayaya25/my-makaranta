import { allocatePayments, splitInstallments, type InstallmentRow, type ScheduleRow } from "./installment.util";

describe("splitInstallments", () => {
  it("splits net across bps rows in order, floor for all but last", () => {
    const rows: ScheduleRow[] = [
      { order: 1, label: "First", percentBps: 5000, dueDate: new Date("2026-01-01") },
      { order: 2, label: "Second", percentBps: 2500, dueDate: new Date("2026-02-01") },
      { order: 3, label: "Third", percentBps: 2500, dueDate: new Date("2026-03-01") },
    ];
    const out = splitInstallments(100000, rows);
    expect(out.map((o) => o.amountKobo)).toEqual([50000, 25000, 25000]);
    expect(out.map((o) => o.dueDate)).toEqual([rows[0]!.dueDate, rows[1]!.dueDate, rows[2]!.dueDate]);
    expect(out.map((o) => o.order)).toEqual([1, 2, 3]);
    expect(out.map((o) => o.label)).toEqual(["First", "Second", "Third"]);
  });

  it("handles rounding: sum equals net, last row absorbs remainder, earlier rows are floors", () => {
    const rows: ScheduleRow[] = [
      { order: 1, label: null, percentBps: 3334, dueDate: new Date("2026-01-01") },
      { order: 2, label: null, percentBps: 3333, dueDate: new Date("2026-02-01") },
      { order: 3, label: null, percentBps: 3333, dueDate: new Date("2026-03-01") },
    ];
    const out = splitInstallments(99999, rows);
    expect(out).toHaveLength(3);
    const sum = out.reduce((acc, o) => acc + o.amountKobo, 0);
    expect(sum).toBe(99999);
    expect(out[0]!.amountKobo).toBe(Math.floor((99999 * 3334) / 10000));
    expect(out[1]!.amountKobo).toBe(Math.floor((99999 * 3333) / 10000));
    expect(out[2]!.amountKobo).toBe(99999 - out[0]!.amountKobo - out[1]!.amountKobo);
  });

  it("single row [10000 bps] returns the full net", () => {
    const rows: ScheduleRow[] = [{ order: 1, label: null, percentBps: 10000, dueDate: new Date("2026-01-01") }];
    const out = splitInstallments(10000, rows);
    expect(out).toEqual([{ order: 1, label: null, amountKobo: 10000, dueDate: rows[0]!.dueDate }]);
  });

  it("sorts rows by order before splitting", () => {
    const rows: ScheduleRow[] = [
      { order: 2, label: "B", percentBps: 2500, dueDate: new Date("2026-02-01") },
      { order: 1, label: "A", percentBps: 5000, dueDate: new Date("2026-01-01") },
      { order: 3, label: "C", percentBps: 2500, dueDate: new Date("2026-03-01") },
    ];
    const out = splitInstallments(100000, rows);
    expect(out.map((o) => o.order)).toEqual([1, 2, 3]);
    expect(out.map((o) => o.amountKobo)).toEqual([50000, 25000, 25000]);
  });
});

describe("allocatePayments", () => {
  const future = new Date("2999-01-01");
  const past = new Date("2000-01-01");
  const now = new Date("2026-07-06");

  it("no payment, future due date -> DUE with paidKobo 0", () => {
    const installments: InstallmentRow[] = [{ order: 1, label: null, amountKobo: 50000, dueDate: future }];
    const out = allocatePayments(0, installments, now);
    expect(out).toEqual([{ order: 1, label: null, amountKobo: 50000, dueDate: future, paidKobo: 0, status: "DUE" }]);
  });

  it("no payment, past due date -> OVERDUE", () => {
    const installments: InstallmentRow[] = [{ order: 1, label: null, amountKobo: 50000, dueDate: past }];
    const out = allocatePayments(0, installments, now);
    expect(out[0]!.status).toBe("OVERDUE");
    expect(out[0]!.paidKobo).toBe(0);
  });

  it("waterfall allocates paidKobo across ordered installments (all future)", () => {
    const installments: InstallmentRow[] = [
      { order: 1, label: null, amountKobo: 50000, dueDate: future },
      { order: 2, label: null, amountKobo: 25000, dueDate: future },
      { order: 3, label: null, amountKobo: 25000, dueDate: future },
    ];
    const out = allocatePayments(60000, installments, now);
    expect(out.map((o) => o.status)).toEqual(["PAID", "PARTIAL", "DUE"]);
    expect(out.map((o) => o.paidKobo)).toEqual([50000, 10000, 0]);
  });

  it("full payment -> all PAID", () => {
    const installments: InstallmentRow[] = [
      { order: 1, label: null, amountKobo: 50000, dueDate: future },
      { order: 2, label: null, amountKobo: 25000, dueDate: future },
      { order: 3, label: null, amountKobo: 25000, dueDate: future },
    ];
    const out = allocatePayments(100000, installments, now);
    expect(out.every((o) => o.status === "PAID")).toBe(true);
    expect(out.map((o) => o.paidKobo)).toEqual([50000, 25000, 25000]);
  });

  it("first installment unpaid and past due -> OVERDUE, later ones unaffected by ordering", () => {
    const installments: InstallmentRow[] = [
      { order: 1, label: null, amountKobo: 50000, dueDate: past },
      { order: 2, label: null, amountKobo: 25000, dueDate: future },
    ];
    const out = allocatePayments(0, installments, now);
    expect(out[0]!.status).toBe("OVERDUE");
    expect(out[1]!.status).toBe("DUE");
  });

  it("sorts installments by order before allocating", () => {
    const installments: InstallmentRow[] = [
      { order: 2, label: null, amountKobo: 25000, dueDate: future },
      { order: 1, label: null, amountKobo: 50000, dueDate: future },
    ];
    const out = allocatePayments(50000, installments, now);
    expect(out.map((o) => o.order)).toEqual([1, 2]);
    expect(out.map((o) => o.status)).toEqual(["PAID", "DUE"]);
  });
});
