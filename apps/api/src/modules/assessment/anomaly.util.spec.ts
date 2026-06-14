import { flagAnomalies } from "./anomaly.util";

describe("flagAnomalies", () => {
  it("flags a value > 2σ from the mean", () => {
    const totals = [
      { studentId: "a", total: 50 }, { studentId: "b", total: 52 }, { studentId: "c", total: 48 },
      { studentId: "d", total: 51 }, { studentId: "e", total: 49 }, { studentId: "f", total: 50 },
      { studentId: "g", total: 53 }, { studentId: "h", total: 47 }, { studentId: "x", total: 95 },
    ];
    const m = flagAnomalies(totals);
    expect(m.get("x")?.anomaly).toBe(true);
    expect(m.get("a")?.anomaly).toBe(false);
    expect(m.get("x")!.z).toBeGreaterThan(2);
  });

  it("flags no one when σ is 0 (all equal)", () => {
    const m = flagAnomalies([{ studentId: "a", total: 40 }, { studentId: "b", total: 40 }]);
    expect(m.get("a")?.anomaly).toBe(false);
    expect(m.get("a")?.z).toBe(0);
  });

  it("flags no one when n < 2", () => {
    const m = flagAnomalies([{ studentId: "a", total: 40 }]);
    expect(m.get("a")?.anomaly).toBe(false);
  });

  it("respects a custom threshold", () => {
    const totals = [
      { studentId: "a", total: 10 }, { studentId: "b", total: 12 },
      { studentId: "c", total: 8 }, { studentId: "x", total: 20 },
    ];
    expect(flagAnomalies(totals, 1).get("x")?.anomaly).toBe(true);
  });
});
