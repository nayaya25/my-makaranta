import { describe, it, expect, beforeEach } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME } from "./db";
import { enqueueMark, getQueuedMarks, removeMarks, markKey } from "./queue";

beforeEach(async () => {
  await deleteDB(DB_NAME);
});

const base = { classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" as const };

describe("queue", () => {
  it("enqueues a mark and reads it back with a generated key + timestamp", async () => {
    const saved = await enqueueMark(base);
    expect(saved.idempotencyKey).toMatch(/[0-9a-f-]{36}/);
    expect(saved.queuedAt).toBeGreaterThan(0);
    const all = await getQueuedMarks();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("PRESENT");
  });

  it("coalesces re-taps of the same student/date/class into one entry (final status wins)", async () => {
    await enqueueMark(base);
    await enqueueMark({ ...base, status: "ABSENT" });
    await enqueueMark({ ...base, status: "LATE" });
    const all = await getQueuedMarks();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("LATE");
  });

  it("keeps separate entries per student and per date", async () => {
    await enqueueMark(base);
    await enqueueMark({ ...base, studentId: "s2" });
    await enqueueMark({ ...base, date: "2026-06-13" });
    expect(await getQueuedMarks()).toHaveLength(3);
  });

  it("removes marks by key", async () => {
    await enqueueMark(base);
    await removeMarks([markKey(base)]);
    expect(await getQueuedMarks()).toHaveLength(0);
  });
});
