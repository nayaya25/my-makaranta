export interface StudentTotal {
  studentId: string;
  total: number;
}

export interface AnomalyInfo {
  z: number;
  anomaly: boolean;
}

/**
 * Flag student totals that deviate more than `threshold` population standard
 * deviations from the cohort mean. Returns a map studentId → { z, anomaly }.
 * Guards: n < 2 or σ = 0 → all z = 0, anomaly = false (no false flags on tiny
 * or uniform cohorts).
 */
export function flagAnomalies(
  totals: StudentTotal[],
  threshold = 2,
): Map<string, AnomalyInfo> {
  const out = new Map<string, AnomalyInfo>();
  const n = totals.length;
  if (n < 2) {
    for (const t of totals) out.set(t.studentId, { z: 0, anomaly: false });
    return out;
  }
  const mean = totals.reduce((s, t) => s + t.total, 0) / n;
  const variance = totals.reduce((s, t) => s + (t.total - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  for (const t of totals) {
    const z = sigma === 0 ? 0 : (t.total - mean) / sigma;
    out.set(t.studentId, { z, anomaly: Math.abs(z) > threshold });
  }
  return out;
}
