export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export function attendanceRate(c: AttendanceCounts): {
  rate: number;
  presentDays: number;
  totalDays: number;
} {
  const presentDays = c.present + c.late;
  const totalDays = c.present + c.late + c.absent + c.excused;
  return { rate: totalDays === 0 ? 0 : presentDays / totalDays, presentDays, totalDays };
}

export interface TopClassRow {
  classId: string;
  name: string;
  average: number | null;
}

export function pickTopClass(
  rows: TopClassRow[],
): { classId: string; name: string; average: number } | null {
  let best: { classId: string; name: string; average: number } | null = null;
  for (const r of rows) {
    if (r.average === null) continue;
    if (best === null || r.average > best.average) {
      best = { classId: r.classId, name: r.name, average: r.average };
    }
  }
  return best;
}

export function feePaidRate(collectedKobo: number, expectedKobo: number): number {
  return expectedKobo === 0 ? 0 : collectedKobo / expectedKobo;
}
