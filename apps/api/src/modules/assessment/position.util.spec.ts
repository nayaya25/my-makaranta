import { computePositions } from "./position.util";

describe("computePositions", () => {
  it("ranks by average descending", () => {
    const m = computePositions([
      { studentId: "a", average: 60 }, { studentId: "b", average: 90 }, { studentId: "c", average: 75 },
    ]);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(2);
    expect(m.get("a")).toBe(3);
  });

  it("uses standard competition ranking for ties (1,2,2,4)", () => {
    const m = computePositions([
      { studentId: "a", average: 90 }, { studentId: "b", average: 80 },
      { studentId: "c", average: 80 }, { studentId: "d", average: 70 },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(2);
    expect(m.get("d")).toBe(4);
  });

  it("returns an empty map for no students", () => {
    expect(computePositions([]).size).toBe(0);
  });
});
