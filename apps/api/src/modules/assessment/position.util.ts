export interface StudentAverage {
  studentId: string;
  average: number;
}

/**
 * Standard competition ranking ("1224"): position = 1 + (# of students with a
 * strictly greater average). Tied students share a position; the next distinct
 * average skips accordingly. Empty input -> empty map.
 */
export function computePositions(students: StudentAverage[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of students) {
    const higher = students.filter((o) => o.average > s.average).length;
    out.set(s.studentId, higher + 1);
  }
  return out;
}
