import { openOfflineDb, MARK_QUEUE } from "./db";
import type { QueuedMark } from "./types";
import type { AttendanceStatus } from "@/lib/api";

export interface MarkInput {
  classId: string;
  date: string;
  studentId: string;
  status: AttendanceStatus;
}

export function markKey(m: { classId: string; date: string; studentId: string }): string {
  return `${m.classId}|${m.date}|${m.studentId}`;
}

export async function enqueueMark(input: MarkInput): Promise<QueuedMark> {
  const mark: QueuedMark = {
    ...input,
    idempotencyKey: crypto.randomUUID(),
    queuedAt: Date.now(),
  };
  const db = await openOfflineDb();
  // put with the composite key overwrites any prior queued status for this student/date — coalescing.
  await db.put(MARK_QUEUE, mark, markKey(mark));
  db.close();
  return mark;
}

export async function getQueuedMarks(): Promise<QueuedMark[]> {
  const db = await openOfflineDb();
  const all = (await db.getAll(MARK_QUEUE)) as QueuedMark[];
  db.close();
  return all;
}

export async function removeMarks(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openOfflineDb();
  const tx = db.transaction(MARK_QUEUE, "readwrite");
  await Promise.all(keys.map((k) => tx.store.delete(k)));
  await tx.done;
  db.close();
}
