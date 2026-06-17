import { attendanceRate, pickTopClass, feePaidRate } from "./dashboard.util";

describe("attendanceRate", () => {
  it("counts present + late as attended over total", () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 1, excused: 1 })).toEqual({
      rate: 0.8, presentDays: 8, totalDays: 10,
    });
  });
  it("returns 0 (not NaN) when there are no records", () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toEqual({
      rate: 0, presentDays: 0, totalDays: 0,
    });
  });
});

describe("pickTopClass", () => {
  it("returns null when no rows", () => {
    expect(pickTopClass([])).toBeNull();
  });
  it("ignores null averages and picks the highest", () => {
    expect(
      pickTopClass([
        { classId: "a", name: "JSS1A", average: 72 },
        { classId: "b", name: "JSS1B", average: null },
        { classId: "c", name: "JSS2A", average: 81 },
      ]),
    ).toEqual({ classId: "c", name: "JSS2A", average: 81 });
  });
  it("keeps the first on a tie (deterministic)", () => {
    expect(
      pickTopClass([
        { classId: "a", name: "A", average: 80 },
        { classId: "b", name: "B", average: 80 },
      ]),
    ).toEqual({ classId: "a", name: "A", average: 80 });
  });
});

describe("feePaidRate", () => {
  it("returns the collected/expected ratio", () => {
    expect(feePaidRate(9000000, 12000000)).toBe(0.75);
  });
  it("returns 0 (not NaN) when nothing is expected", () => {
    expect(feePaidRate(0, 0)).toBe(0);
  });
  it("can exceed 1 on overpayment (credit)", () => {
    expect(feePaidRate(12000000, 10000000)).toBe(1.2);
  });
});
