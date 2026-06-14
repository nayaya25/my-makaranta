import { resolveGrade, type GradeBand } from "./grade.util";

const WAEC: GradeBand[] = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
  { grade: "B3", minScore: 65, remark: "Good" },
];

describe("resolveGrade", () => {
  it("maps a score to the band with the greatest minScore <= score", () => {
    expect(resolveGrade(85, WAEC)).toEqual({ grade: "A1", remark: "Excellent" });
    expect(resolveGrade(66, WAEC)).toEqual({ grade: "B3", remark: "Good" });
    expect(resolveGrade(50, WAEC)).toEqual({ grade: "C6", remark: "Credit" });
    expect(resolveGrade(0, WAEC)).toEqual({ grade: "F9", remark: "Fail" });
  });

  it("treats minScore as an inclusive lower bound (boundary edge)", () => {
    expect(resolveGrade(75, WAEC)).toEqual({ grade: "A1", remark: "Excellent" });
    expect(resolveGrade(74, WAEC)).toEqual({ grade: "B3", remark: "Good" });
  });

  it("returns null when no band matches (no zero band)", () => {
    expect(resolveGrade(10, [{ grade: "A1", minScore: 75, remark: "Excellent" }])).toBeNull();
  });
});
