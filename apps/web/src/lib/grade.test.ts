import { describe, it, expect } from "vitest";
import { resolveGrade } from "./grade";

const bands = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];

describe("resolveGrade (web)", () => {
  it("returns the band with the greatest minScore <= total", () => {
    expect(resolveGrade(80, bands)?.grade).toBe("A1");
    expect(resolveGrade(60, bands)?.grade).toBe("C6");
    expect(resolveGrade(10, bands)?.grade).toBe("F9");
  });
  it("returns null when nothing matches", () => {
    expect(resolveGrade(10, [{ grade: "A1", minScore: 75, remark: "x" }])).toBeNull();
  });
});
