export interface GradeBand {
  grade: string;
  minScore: number;
  remark: string;
}

/**
 * Resolve a 0–100 total to its grade band: the band with the greatest
 * minScore that is <= total. minScore is an inclusive lower bound; upper
 * bounds are implied by the next band. Returns null if no band matches.
 */
export function resolveGrade(
  total: number,
  boundaries: GradeBand[],
): { grade: string; remark: string } | null {
  const sorted = [...boundaries].sort((a, b) => b.minScore - a.minScore);
  const band = sorted.find((b) => total >= b.minScore);
  return band ? { grade: band.grade, remark: band.remark } : null;
}
