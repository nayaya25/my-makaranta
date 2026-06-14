import { describe, it, expect, beforeEach } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME } from "./db";
import {
  cacheRoster,
  getCachedRoster,
  cacheClasses,
  getCachedClasses,
} from "./roster-cache";
import type { AttendanceDay, Class } from "@/lib/api";

beforeEach(async () => {
  await deleteDB(DB_NAME);
});

const day: AttendanceDay = {
  date: "2026-06-14",
  students: [
    { studentId: "s1", firstName: "Amina", lastName: "Bello", status: "PRESENT", photoUrl: null },
  ],
};
const classes: Class[] = [{ id: "c1", name: "JSS1A", classLevelId: "l1" }];

describe("roster-cache", () => {
  it("caches and returns a roster by classId + date", async () => {
    await cacheRoster("c1", day);
    const got = await getCachedRoster("c1", "2026-06-14");
    expect(got?.students[0]?.firstName).toBe("Amina");
  });

  it("returns undefined for an uncached roster", async () => {
    expect(await getCachedRoster("c1", "2099-01-01")).toBeUndefined();
  });

  it("caches and returns the class list", async () => {
    await cacheClasses(classes);
    expect((await getCachedClasses())?.[0]?.name).toBe("JSS1A");
  });
});
