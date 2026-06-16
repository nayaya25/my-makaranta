import { summarizeInvoices } from "./finance-summary.util";

const NOW = new Date("2026-06-16T00:00:00Z");
const past = new Date("2026-06-15T00:00:00Z");
const future = new Date("2026-07-01T00:00:00Z");

describe("summarizeInvoices", () => {
  const rows = [
    { classLevelId: "l1", classLevelName: "JSS1", totalKobo: 6000000, paidKobo: 6000000, dueDate: past },
    { classLevelId: "l1", classLevelName: "JSS1", totalKobo: 6000000, paidKobo: 2000000, dueDate: past },
    { classLevelId: "l2", classLevelName: "JSS2", totalKobo: 5000000, paidKobo: 0, dueDate: future },
  ];

  it("totals expected/collected/outstanding", () => {
    const s = summarizeInvoices(rows, NOW);
    expect(s.expectedKobo).toBe(17000000);
    expect(s.collectedKobo).toBe(8000000);
    expect(s.outstandingKobo).toBe(9000000);
  });
  it("overdue counts only past-due outstanding", () => {
    expect(summarizeInvoices(rows, NOW).overdueKobo).toBe(4000000);
  });
  it("groups by class level with student counts", () => {
    const s = summarizeInvoices(rows, NOW);
    const l1 = s.byClassLevel.find((g) => g.classLevelId === "l1")!;
    const l2 = s.byClassLevel.find((g) => g.classLevelId === "l2")!;
    expect(l1.expectedKobo).toBe(12000000);
    expect(l1.collectedKobo).toBe(8000000);
    expect(l1.outstandingKobo).toBe(4000000);
    expect(l1.studentCount).toBe(2);
    expect(l2.studentCount).toBe(1);
  });
  it("empty rows → zeros + empty breakdown", () => {
    const s = summarizeInvoices([], NOW);
    expect(s).toMatchObject({ expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, overdueKobo: 0, byClassLevel: [] });
  });
});
