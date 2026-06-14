import { computeSubjectResult } from "./score.util";
import type { GradeBand } from "./grade.util";

const bands: GradeBand[] = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];
const typeIds = ["ca1", "ca2", "ca3", "exam"];

describe("computeSubjectResult", () => {
  it("sums entered values and maps to a grade", () => {
    const r = computeSubjectResult(
      [{ assessmentTypeId: "ca1", value: 10 }, { assessmentTypeId: "ca2", value: 10 },
       { assessmentTypeId: "ca3", value: 10 }, { assessmentTypeId: "exam", value: 55 }],
      typeIds, bands,
    );
    expect(r.total).toBe(85);
    expect(r.grade).toBe("A1");
    expect(r.complete).toBe(true);
  });

  it("treats missing components as 0 and flags incomplete", () => {
    const r = computeSubjectResult([{ assessmentTypeId: "ca1", value: 8 }], typeIds, bands);
    expect(r.total).toBe(8);
    expect(r.complete).toBe(false);
    expect(r.grade).toBe("F9");
  });

  it("returns null grade when no boundaries configured", () => {
    const r = computeSubjectResult([{ assessmentTypeId: "ca1", value: 8 }], typeIds, []);
    expect(r.grade).toBeNull();
    expect(r.remark).toBeNull();
  });
});
