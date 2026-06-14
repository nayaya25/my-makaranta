export interface GradeBoundaryTemplateRow {
  grade: string;
  minScore: number;
  remark: string;
  order: number;
}

// Standard Nigerian secondary grade scales. Same A1–F9 boundaries; remark wording
// differs by examining board convention. "Custom" = edit freely (no template).
export const GRADE_TEMPLATES: Record<"WAEC" | "NECO", GradeBoundaryTemplateRow[]> = {
  WAEC: [
    { grade: "A1", minScore: 75, remark: "Excellent", order: 0 },
    { grade: "B2", minScore: 70, remark: "Very Good", order: 1 },
    { grade: "B3", minScore: 65, remark: "Good", order: 2 },
    { grade: "C4", minScore: 60, remark: "Credit", order: 3 },
    { grade: "C5", minScore: 55, remark: "Credit", order: 4 },
    { grade: "C6", minScore: 50, remark: "Credit", order: 5 },
    { grade: "D7", minScore: 45, remark: "Pass", order: 6 },
    { grade: "E8", minScore: 40, remark: "Pass", order: 7 },
    { grade: "F9", minScore: 0, remark: "Fail", order: 8 },
  ],
  NECO: [
    { grade: "A1", minScore: 75, remark: "Distinction", order: 0 },
    { grade: "B2", minScore: 70, remark: "Upper Credit", order: 1 },
    { grade: "B3", minScore: 65, remark: "Upper Credit", order: 2 },
    { grade: "C4", minScore: 60, remark: "Credit", order: 3 },
    { grade: "C5", minScore: 55, remark: "Credit", order: 4 },
    { grade: "C6", minScore: 50, remark: "Credit", order: 5 },
    { grade: "D7", minScore: 45, remark: "Pass", order: 6 },
    { grade: "E8", minScore: 40, remark: "Pass", order: 7 },
    { grade: "F9", minScore: 0, remark: "Fail", order: 8 },
  ],
};
