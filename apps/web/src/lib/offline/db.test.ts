import { describe, it, expect } from "vitest";
import { openOfflineDb, MARK_QUEUE, ROSTER_CACHE, CLASSES_CACHE } from "./db";

describe("openOfflineDb", () => {
  it("creates the three object stores", async () => {
    const db = await openOfflineDb();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual([CLASSES_CACHE, MARK_QUEUE, ROSTER_CACHE].sort());
    db.close();
  });
});
