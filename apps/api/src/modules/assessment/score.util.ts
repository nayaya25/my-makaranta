import { resolveGrade, type GradeBand } from "./grade.util";

export interface ScoreCell {
  assessmentTypeId: string;
  value: number;
}

export interface SubjectResult {
  total: number;
  grade: string | null;
  remark: string | null;
  complete: boolean;
}

/**
 * Additive subject result: total = sum of entered component values (missing = 0),
 * complete = every assessment type has a value, grade via resolveGrade (null if no
 * boundaries). `typeIds` is the school's full ordered set of assessment-type ids.
 */
export function computeSubjectResult(
  scores: ScoreCell[],
  typeIds: string[],
  boundaries: GradeBand[],
): SubjectResult {
  const byType = new Map(scores.map((s) => [s.assessmentTypeId, s.value]));
  const total = typeIds.reduce((sum, id) => sum + (byType.get(id) ?? 0), 0);
  const complete = typeIds.every((id) => byType.has(id));
  const g = resolveGrade(total, boundaries);
  return { total, grade: g?.grade ?? null, remark: g?.remark ?? null, complete };
}
