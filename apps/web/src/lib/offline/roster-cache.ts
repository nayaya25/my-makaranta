import { openOfflineDb, ROSTER_CACHE, CLASSES_CACHE } from "./db";
import type { AttendanceDay, Class } from "@/lib/api";

const rosterKey = (classId: string, date: string) => `${classId}|${date}`;
const CLASSES_KEY = "classes";

export async function cacheRoster(classId: string, day: AttendanceDay): Promise<void> {
  const db = await openOfflineDb();
  await db.put(ROSTER_CACHE, { ...day, cachedAt: Date.now() }, rosterKey(classId, day.date));
  db.close();
}

export async function getCachedRoster(
  classId: string,
  date: string,
): Promise<AttendanceDay | undefined> {
  const db = await openOfflineDb();
  const got = (await db.get(ROSTER_CACHE, rosterKey(classId, date))) as AttendanceDay | undefined;
  db.close();
  return got;
}

export async function cacheClasses(classes: Class[]): Promise<void> {
  const db = await openOfflineDb();
  await db.put(CLASSES_CACHE, classes, CLASSES_KEY);
  db.close();
}

export async function getCachedClasses(): Promise<Class[] | undefined> {
  const db = await openOfflineDb();
  const got = (await db.get(CLASSES_CACHE, CLASSES_KEY)) as Class[] | undefined;
  db.close();
  return got;
}
