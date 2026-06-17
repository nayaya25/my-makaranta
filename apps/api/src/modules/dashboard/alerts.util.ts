export type AlertType = "ATTENDANCE_DIP" | "LOW_COLLECTION" | "RESULTS_OVERDUE";
export type AlertSeverity = "high" | "medium";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  classId: string;
  className: string;
  message: string;
}

export interface ClassAlertInput {
  classId: string;
  className: string;
  attendance: { baselineRate: number; recentRate: number; recentMarks: number };
  fees: { expectedKobo: number; overdueKobo: number };
  results: { subjectsScored: number; subjectsOffered: number; released: boolean };
  termElapsedFraction: number; // 0..1; 1 when the term has ended
}

export const ALERT_THRESHOLDS = {
  dipDrop: 0.1,
  dipHighDrop: 0.2,
  dipMinRecentMarks: 10,
  overdueHighFraction: 0.3,
  resultsElapsed: 0.8,
} as const;

export function formatNairaFromKobo(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString("en-US")}`;
}

const SEV_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1 };
const TYPE_RANK: Record<AlertType, number> = { ATTENDANCE_DIP: 0, LOW_COLLECTION: 1, RESULTS_OVERDUE: 2 };

export function buildAlerts(
  inputs: ClassAlertInput[],
  opts: typeof ALERT_THRESHOLDS = ALERT_THRESHOLDS,
): Alert[] {
  const out: Alert[] = [];
  for (const c of inputs) {
    // ATTENDANCE_DIP
    if (c.attendance.recentMarks >= opts.dipMinRecentMarks) {
      const drop = c.attendance.baselineRate - c.attendance.recentRate;
      if (drop >= opts.dipDrop) {
        out.push({
          type: "ATTENDANCE_DIP",
          severity: drop >= opts.dipHighDrop ? "high" : "medium",
          classId: c.classId,
          className: c.className,
          message: `${c.className} attendance down ${Math.round(drop * 100)}% this week (${Math.round(c.attendance.recentRate * 100)}% vs ${Math.round(c.attendance.baselineRate * 100)}% term average).`,
        });
      }
    }
    // LOW_COLLECTION
    if (c.fees.overdueKobo > 0) {
      const frac = c.fees.expectedKobo > 0 ? c.fees.overdueKobo / c.fees.expectedKobo : 0;
      out.push({
        type: "LOW_COLLECTION",
        severity: frac >= opts.overdueHighFraction ? "high" : "medium",
        classId: c.classId,
        className: c.className,
        message: `${c.className}: ${formatNairaFromKobo(c.fees.overdueKobo)} in overdue fees (${Math.round(frac * 100)}% of expected).`,
      });
    }
    // RESULTS_OVERDUE
    if (
      c.termElapsedFraction >= opts.resultsElapsed &&
      !c.results.released &&
      c.results.subjectsOffered > 0 &&
      c.results.subjectsScored < c.results.subjectsOffered
    ) {
      out.push({
        type: "RESULTS_OVERDUE",
        severity: c.termElapsedFraction >= 1 ? "high" : "medium",
        classId: c.classId,
        className: c.className,
        message: `${c.className}: results not released — ${c.results.subjectsScored}/${c.results.subjectsOffered} subjects scored.`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.className.localeCompare(b.className),
  );
}
