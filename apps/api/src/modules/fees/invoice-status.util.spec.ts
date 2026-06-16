import { computeInvoiceStatus } from "./invoice-status.util";

const D = (s: string) => new Date(s);
const NOW = D("2026-06-16T00:00:00Z");

describe("computeInvoiceStatus", () => {
  it("PAID when paid >= total", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 1000, dueDate: D("2020-01-01"), now: NOW })).toBe("PAID");
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 1200, dueDate: null, now: NOW })).toBe("PAID");
  });
  it("OVERDUE when outstanding and past due date", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: D("2026-06-15T00:00:00Z"), now: NOW })).toBe("OVERDUE");
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: D("2026-06-15T00:00:00Z"), now: NOW })).toBe("OVERDUE");
  });
  it("PARTIAL when some paid, not past due", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: D("2026-07-01T00:00:00Z"), now: NOW })).toBe("PARTIAL");
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 400, dueDate: null, now: NOW })).toBe("PARTIAL");
  });
  it("UNPAID when nothing paid, not past due", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: null, now: NOW })).toBe("UNPAID");
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: D("2026-07-01T00:00:00Z"), now: NOW })).toBe("UNPAID");
  });
  it("dueDate exactly == now is NOT overdue", () => {
    expect(computeInvoiceStatus({ totalKobo: 1000, paidKobo: 0, dueDate: NOW, now: NOW })).toBe("UNPAID");
  });
});
