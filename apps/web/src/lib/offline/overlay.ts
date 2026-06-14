import type { AttendanceRecord } from "@/lib/api";
import type { QueuedMark } from "./types";

/**
 * Overlay queued (unsynced) marks on top of a server/cached roster so the grid
 * always shows the teacher's latest local taps. The queue is the source of
 * truth for unsynced edits. Caller passes only the marks for this class+date.
 */
export function overlayQueuedMarks(
  students: AttendanceRecord[],
  queued: QueuedMark[],
): AttendanceRecord[] {
  if (queued.length === 0) return students;
  const byStudent = new Map(queued.map((q) => [q.studentId, q.status]));
  return students.map((s) =>
    byStudent.has(s.studentId) ? { ...s, status: byStudent.get(s.studentId)! } : s,
  );
}
