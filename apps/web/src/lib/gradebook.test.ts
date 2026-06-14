import { describe, it, expect } from "vitest";
import { computeRow } from "./gradebook";

const bands = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];

describe("computeRow", () => {
  it("sums the values map and resolves a grade", () => {
    const r = computeRow({ ca1: 20, exam: 60 }, bands);
    expect(r.total).toBe(80);
    expect(r.grade).toBe("A1");
  });
  it("ignores NaN/blank entries", () => {
    const r = computeRow({ ca1: 10, exam: NaN }, bands);
    expect(r.total).toBe(10);
    expect(r.grade).toBe("F9");
  });
});
