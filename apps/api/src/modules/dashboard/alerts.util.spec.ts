import { buildAlerts, type ClassAlertInput } from "./alerts.util";

const base: ClassAlertInput = {
  classId: "c1",
  className: "JSS1A",
  attendance: { baselineRate: 0.9, recentRate: 0.9, recentMarks: 20 },
  fees: { expectedKobo: 0, overdueKobo: 0 },
  results: { subjectsScored: 3, subjectsOffered: 3, released: true },
  termElapsedFraction: 0.5,
};
const one = (over: Partial<ClassAlertInput>) => buildAlerts([{ ...base, ...over }]);

describe("buildAlerts — ATTENDANCE_DIP", () => {
  it("fires high when the drop is >= 0.20 and recent marks pass the gate", () => {
    const a = one({ attendance: { baselineRate: 0.9, recentRate: 0.6, recentMarks: 20 } });
    expect(a).toEqual([{ type: "ATTENDANCE_DIP", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A attendance down 30% this week (60% vs 90% term average)." }]);
  });
  it("fires medium when the drop is between 0.10 and 0.20", () => {
    const a = one({ attendance: { baselineRate: 0.9, recentRate: 0.78, recentMarks: 20 } });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["ATTENDANCE_DIP", "medium"]]);
  });
  it("does not fire below the 0.10 drop threshold", () => {
    expect(one({ attendance: { baselineRate: 0.9, recentRate: 0.82, recentMarks: 20 } })).toEqual([]);
  });
  it("does not fire when recent marks are below the noise gate", () => {
    expect(one({ attendance: { baselineRate: 0.9, recentRate: 0.2, recentMarks: 9 } })).toEqual([]);
  });
});

describe("buildAlerts — LOW_COLLECTION", () => {
  it("fires high when overdue is >= 30% of expected", () => {
    const a = one({ fees: { expectedKobo: 10000000, overdueKobo: 5000000 } });
    expect(a).toEqual([{ type: "LOW_COLLECTION", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A: ₦50,000 in overdue fees (50% of expected)." }]);
  });
  it("fires medium when overdue is positive but < 30%", () => {
    const a = one({ fees: { expectedKobo: 10000000, overdueKobo: 1000000 } });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["LOW_COLLECTION", "medium"]]);
  });
  it("does not fire when nothing is overdue", () => {
    expect(one({ fees: { expectedKobo: 10000000, overdueKobo: 0 } })).toEqual([]);
  });
});

describe("buildAlerts — RESULTS_OVERDUE", () => {
  it("fires high when the term has ended, unreleased + incomplete", () => {
    const a = one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 1 });
    expect(a).toEqual([{ type: "RESULTS_OVERDUE", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A: results not released — 2/3 subjects scored." }]);
  });
  it("fires medium when >= 80% elapsed but not ended", () => {
    const a = one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 0.85 });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["RESULTS_OVERDUE", "medium"]]);
  });
  it("does not fire before 80% elapsed", () => {
    expect(one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 0.7 })).toEqual([]);
  });
  it("does not fire when released or fully scored or nothing offered", () => {
    expect(one({ results: { subjectsScored: 2, subjectsOffered: 3, released: true }, termElapsedFraction: 1 })).toEqual([]);
    expect(one({ results: { subjectsScored: 3, subjectsOffered: 3, released: false }, termElapsedFraction: 1 })).toEqual([]);
    expect(one({ results: { subjectsScored: 0, subjectsOffered: 0, released: false }, termElapsedFraction: 1 })).toEqual([]);
  });
});

describe("buildAlerts — multiple + sort", () => {
  it("emits several alerts for one class and sorts high before medium", () => {
    const a = buildAlerts([{
      ...base,
      attendance: { baselineRate: 0.9, recentRate: 0.6, recentMarks: 20 }, // dip high
      fees: { expectedKobo: 10000000, overdueKobo: 1000000 },               // low medium
    }]);
    expect(a.map((x) => [x.type, x.severity])).toEqual([
      ["ATTENDANCE_DIP", "high"],
      ["LOW_COLLECTION", "medium"],
    ]);
  });
  it("returns [] for empty input", () => {
    expect(buildAlerts([])).toEqual([]);
  });
});
