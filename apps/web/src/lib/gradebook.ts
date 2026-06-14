import { resolveGrade, type GradeBand } from "./grade";

/** Live gradebook-row total + grade for the UI. Sums a {assessmentTypeId: value}
 *  map (ignoring NaN/blank) and resolves the grade against the school's bands. */
export function computeRow(
  values: Record<string, number>,
  boundaries: GradeBand[],
): { total: number; grade: string | null; remark: string | null } {
  const total = Object.values(values).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const g = resolveGrade(total, boundaries);
  return { total, grade: g?.grade ?? null, remark: g?.remark ?? null };
}
