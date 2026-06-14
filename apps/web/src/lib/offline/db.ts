import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "mymakaranta-offline";
export const DB_VERSION = 1;
export const MARK_QUEUE = "mark_queue";
export const ROSTER_CACHE = "roster_cache";
export const CLASSES_CACHE = "classes_cache";

export function openOfflineDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MARK_QUEUE)) db.createObjectStore(MARK_QUEUE);
      if (!db.objectStoreNames.contains(ROSTER_CACHE)) db.createObjectStore(ROSTER_CACHE);
      if (!db.objectStoreNames.contains(CLASSES_CACHE)) db.createObjectStore(CLASSES_CACHE);
    },
  });
}
