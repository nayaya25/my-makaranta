import { describe, it, expect } from "vitest";
import { overlayQueuedMarks } from "./overlay";
import type { AttendanceRecord } from "@/lib/api";
import type { QueuedMark } from "./types";

const students: AttendanceRecord[] = [
  { studentId: "s1", firstName: "Amina", lastName: "Bello", status: null, photoUrl: null },
  { studentId: "s2", firstName: "Chidi", lastName: "Okafor", status: "PRESENT", photoUrl: null },
];

const queued: QueuedMark[] = [
  { classId: "c1", date: "2026-06-14", studentId: "s1", status: "ABSENT", idempotencyKey: "k1", queuedAt: 1 },
];

describe("overlayQueuedMarks", () => {
  it("overrides a student's status with the queued mark", () => {
    const out = overlayQueuedMarks(students, queued);
    expect(out.find((s) => s.studentId === "s1")?.status).toBe("ABSENT");
  });

  it("leaves students without a queued mark untouched", () => {
    const out = overlayQueuedMarks(students, queued);
    expect(out.find((s) => s.studentId === "s2")?.status).toBe("PRESENT");
  });

  it("returns the roster unchanged when there are no queued marks", () => {
    expect(overlayQueuedMarks(students, [])).toEqual(students);
  });
});
