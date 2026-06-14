import { describe, it, expect, beforeEach, vi } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME } from "./db";
import { enqueueMark, getQueuedMarks } from "./queue";

const markAttendance = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { markAttendance: (...args: unknown[]) => markAttendance(...args) },
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

async function freshSyncer() {
  vi.resetModules();
  return await import("./syncer");
}

beforeEach(async () => {
  await deleteDB(DB_NAME);
  markAttendance.mockReset();
  setOnline(true);
});

describe("syncer.flush", () => {
  it("sends one batch per (classId,date) and clears the queue on success", async () => {
    markAttendance.mockResolvedValue({ saved: 2 });
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s2", status: "ABSENT" });
    await enqueueMark({ classId: "c1", date: "2026-06-13", studentId: "s1", status: "LATE" });

    const { syncer } = await freshSyncer();
    await syncer.flush();

    expect(markAttendance).toHaveBeenCalledTimes(2); // two distinct dates
    expect(await getQueuedMarks()).toHaveLength(0);
  });

  it("keeps marks queued and reports error state when the API call fails", async () => {
    markAttendance.mockRejectedValue(new Error("network"));
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });

    const { syncer } = await freshSyncer();
    await syncer.flush();

    expect(await getQueuedMarks()).toHaveLength(1);
    expect(syncer.getSnapshot().state).toBe("error");
  });

  it("does not call the API when offline", async () => {
    setOnline(false);
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });

    const { syncer } = await freshSyncer();
    await syncer.flush();

    expect(markAttendance).not.toHaveBeenCalled();
    expect(await getQueuedMarks()).toHaveLength(1);
  });

  it("passes idempotencyKey through in the batch payload", async () => {
    markAttendance.mockResolvedValue({ saved: 1 });
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });

    const { syncer } = await freshSyncer();
    await syncer.flush();

    const payload = markAttendance.mock.calls[0]![0];
    expect(payload.classId).toBe("c1");
    expect(payload.records[0]?.idempotencyKey).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("syncer.getSnapshot", () => {
  it("reports the pending count after refresh", async () => {
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });
    const { syncer } = await freshSyncer();
    await syncer.refresh();
    expect(syncer.getSnapshot().pendingCount).toBe(1);
  });
});
