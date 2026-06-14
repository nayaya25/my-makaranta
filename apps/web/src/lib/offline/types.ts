import type { AttendanceStatus } from "@/lib/api";

export interface QueuedMark {
  classId: string;
  date: string; // YYYY-MM-DD
  studentId: string;
  status: AttendanceStatus;
  idempotencyKey: string;
  queuedAt: number; // epoch ms
}
