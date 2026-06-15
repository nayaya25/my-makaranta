export interface GradeBand {
  grade: string;
  minScore: number;
}

/** Highest minScore among bands (the distinction threshold), or null if empty. */
export function topBandMinScore(gradeKey: GradeBand[]): number | null {
  if (gradeKey.length === 0) return null;
  return gradeKey.reduce((max, b) => (b.minScore > max ? b.minScore : max), gradeKey[0]!.minScore);
}

/** Top performer = finished 1st, or scored at/above the distinction band. */
export function shouldCelebrate(args: { position: number; average: number; gradeKey: GradeBand[] }): boolean {
  if (args.position === 1) return true;
  const top = topBandMinScore(args.gradeKey);
  return top !== null && args.average >= top;
}
