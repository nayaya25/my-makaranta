export function weeksInTerm(startDate: Date, endDate: Date): number {
  const ms = endDate.getTime() - startDate.getTime();
  const weeks = Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
  return Math.min(20, Math.max(1, weeks));
}
