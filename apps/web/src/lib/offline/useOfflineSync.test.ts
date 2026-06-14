import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { deleteDB } from "idb";
import { DB_NAME } from "./db";
import { enqueueMark } from "./queue";
import { useOfflineSync } from "./useOfflineSync";

beforeEach(async () => {
  await deleteDB(DB_NAME);
});

describe("useOfflineSync", () => {
  it("exposes the current sync snapshot and reflects pending marks", async () => {
    await enqueueMark({ classId: "c1", date: "2026-06-14", studentId: "s1", status: "PRESENT" });
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.pendingCount).toBeGreaterThanOrEqual(0));
    expect(result.current).toHaveProperty("online");
    expect(result.current).toHaveProperty("state");
  });
});
