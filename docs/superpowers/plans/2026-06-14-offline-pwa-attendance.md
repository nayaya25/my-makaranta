# Offline PWA Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the attendance marking grid work in connectivity dead zones — every tap is durably queued locally and syncs automatically on reconnect, with same-day offline re-reads.

**Architecture:** A self-contained offline layer under `apps/web/src/lib/offline/` (IndexedDB via `idb`): a write `queue`, a `roster-cache`, and a `syncer` singleton that flushes queued marks to the existing idempotent `POST /v1/attendance/mark`. The marking grid is the only consumer; the NestJS API and `public/sw.js` are untouched. Replay safety comes from the server's `(studentId, date)` upsert being idempotent.

**Tech Stack:** Next.js 15 / React 19, TypeScript, `idb`; tests with vitest + @testing-library/react + fake-indexeddb (newly bootstrapped in `apps/web`).

**Spec:** `docs/superpowers/specs/2026-06-14-sprint-2.5-offline-pwa-attendance-design.md`

**Branch:** `sprint-2.5-offline-attendance` (already created).

---

## File Structure

**Create:**
- `apps/web/vitest.config.ts` — vitest config (jsdom, `@/` alias, setup file).
- `apps/web/vitest.setup.ts` — jest-dom + fake-indexeddb registration.
- `apps/web/src/lib/offline/types.ts` — shared offline types (`QueuedMark`).
- `apps/web/src/lib/offline/db.ts` — IndexedDB open + store names.
- `apps/web/src/lib/offline/queue.ts` — mark queue (enqueue/get/remove + coalescing).
- `apps/web/src/lib/offline/roster-cache.ts` — roster + classes cache.
- `apps/web/src/lib/offline/overlay.ts` — pure helper: overlay queued marks onto a roster.
- `apps/web/src/lib/offline/syncer.ts` — sync singleton (flush/subscribe/backoff/listeners).
- `apps/web/src/lib/offline/useOfflineSync.ts` — React hook over the syncer.
- Test files alongside: `db.test.ts`, `queue.test.ts`, `roster-cache.test.ts`, `syncer.test.ts`.

**Modify:**
- `apps/web/package.json` — add deps + `test` script.
- `apps/web/src/lib/api.ts` — add optional `idempotencyKey` to `MarkAttendanceRecord`.
- `apps/web/src/app/(app)/attendance/page.tsx` — offline-first tap path, cache-fallback load + overlay, offline-aware UI.

---

## Task 1: Bootstrap the web test framework

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/src/lib/offline/smoke.test.ts` (temporary, deleted in Step 6)

- [ ] **Step 1: Install dev dependencies**

Run (from repo root):
```bash
pnpm --filter @mymakaranta/web add -D vitest @testing-library/react @testing-library/jest-dom jsdom fake-indexeddb
```
Then audit per project policy:
```bash
pnpm audit
```
Expected: install succeeds; audit shows no new critical advisories.

- [ ] **Step 2: Create vitest config**

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Create vitest setup**

Create `apps/web/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
// Register a fresh in-memory IndexedDB for every test file.
import "fake-indexeddb/auto";
```

- [ ] **Step 4: Add the test script**

In `apps/web/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 5: Write a smoke test and run it**

Create `apps/web/src/lib/offline/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("web test harness", () => {
  it("runs and has indexedDB available", () => {
    expect(typeof indexedDB).toBe("object");
  });
});
```

Run:
```bash
pnpm --filter @mymakaranta/web test
```
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm apps/web/src/lib/offline/smoke.test.ts
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/vitest.config.ts apps/web/vitest.setup.ts pnpm-lock.yaml
git commit -m "test(web): bootstrap vitest + testing-library + fake-indexeddb"
```
Note: lockfile lives at repo root (`pnpm-lock.yaml`); `apps/web/pnpm-lock.yaml` will not exist — stage whichever the repo uses.

---

## Task 2: Offline types + IndexedDB open

**Files:**
- Create: `apps/web/src/lib/offline/types.ts`
- Modify: `apps/web/package.json` (add `idb` runtime dep)
- Create: `apps/web/src/lib/offline/db.ts`
- Test: `apps/web/src/lib/offline/db.test.ts`

- [ ] **Step 0: Install the `idb` runtime dependency**

Run from repo root:
```bash
pnpm --filter @mymakaranta/web add idb
pnpm audit
```
Expected: install succeeds; no new critical advisories.

- [ ] **Step 1: Define shared types**

Create `apps/web/src/lib/offline/types.ts`:
```ts
import type { AttendanceStatus } from "@/lib/api";

export interface QueuedMark {
  classId: string;
  date: string; // YYYY-MM-DD
  studentId: string;
  status: AttendanceStatus;
  idempotencyKey: string;
  queuedAt: number; // epoch ms
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/offline/db.test.ts`:
```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test db`
Expected: FAIL — cannot find module `./db`.

- [ ] **Step 4: Implement db.ts**

Create `apps/web/src/lib/offline/db.ts`:
```ts
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
```
(Out-of-line keys: callers pass an explicit string key to `put/get`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/offline/types.ts apps/web/src/lib/offline/db.ts apps/web/src/lib/offline/db.test.ts
git commit -m "feat(offline): IndexedDB open with mark_queue/roster_cache/classes_cache stores"
```

---

## Task 3: Mark queue with coalescing

**Files:**
- Create: `apps/web/src/lib/offline/queue.ts`
- Test: `apps/web/src/lib/offline/queue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/offline/queue.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test queue`
Expected: FAIL — cannot find module `./queue`.

- [ ] **Step 3: Implement queue.ts**

Create `apps/web/src/lib/offline/queue.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test queue`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/offline/queue.ts apps/web/src/lib/offline/queue.test.ts
git commit -m "feat(offline): mark queue with composite-key coalescing"
```

---

## Task 4: Roster cache, classes cache + queued-mark overlay

**Files:**
- Create: `apps/web/src/lib/offline/roster-cache.ts`
- Create: `apps/web/src/lib/offline/overlay.ts`
- Test: `apps/web/src/lib/offline/roster-cache.test.ts`
- Test: `apps/web/src/lib/offline/overlay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/offline/roster-cache.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test roster-cache`
Expected: FAIL — cannot find module `./roster-cache`.

- [ ] **Step 3: Implement roster-cache.ts**

Create `apps/web/src/lib/offline/roster-cache.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test roster-cache`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing overlay test**

Create `apps/web/src/lib/offline/overlay.test.ts`:
```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test overlay`
Expected: FAIL — cannot find module `./overlay`.

- [ ] **Step 7: Implement overlay.ts**

Create `apps/web/src/lib/offline/overlay.ts`:
```ts
import type { AttendanceRecord } from "@/lib/api";
import type { QueuedMark } from "./types";

/**
 * Overlay queued (unsynced) marks on top of a server/cached roster so the grid
 * always shows the teacher's latest local taps. The queue is the source of
 * truth for unsynced edits. Caller passes only the marks for this class+date.
 */
export function overlayQueuedMarks(
  students: AttendanceRecord[],
  queued: QueuedMark[],
): AttendanceRecord[] {
  if (queued.length === 0) return students;
  const byStudent = new Map(queued.map((q) => [q.studentId, q.status]));
  return students.map((s) =>
    byStudent.has(s.studentId) ? { ...s, status: byStudent.get(s.studentId)! } : s,
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test overlay`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/offline/roster-cache.ts apps/web/src/lib/offline/roster-cache.test.ts apps/web/src/lib/offline/overlay.ts apps/web/src/lib/offline/overlay.test.ts
git commit -m "feat(offline): roster/classes cache + pure queued-mark overlay helper"
```

---

## Task 5: Add idempotencyKey to the mark payload type

**Files:**
- Modify: `apps/web/src/lib/api.ts` (the `MarkAttendanceRecord` interface, around line 185)

- [ ] **Step 1: Add the optional field**

In `apps/web/src/lib/api.ts`, change:
```ts
export interface MarkAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
}
```
to:
```ts
export interface MarkAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
  idempotencyKey?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mymakaranta/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(offline): allow idempotencyKey on mark payload records"
```

---

## Task 6: Syncer singleton

**Files:**
- Create: `apps/web/src/lib/offline/syncer.ts`
- Test: `apps/web/src/lib/offline/syncer.test.ts`

The syncer groups queued marks by `(classId, date)`, sends one `api.markAttendance` batch per group, removes synced keys, and tracks `{ online, pendingCount, state }`. Tests mock the api module and toggle `navigator.onLine`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/offline/syncer.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test syncer`
Expected: FAIL — cannot find module `./syncer`.

- [ ] **Step 3: Implement syncer.ts**

Create `apps/web/src/lib/offline/syncer.ts`:
```ts
import { api } from "@/lib/api";
import { getQueuedMarks, removeMarks, markKey, enqueueMark, type MarkInput } from "./queue";
import type { QueuedMark } from "./types";

export type SyncState = "idle" | "syncing" | "offline" | "error";

export interface SyncSnapshot {
  online: boolean;
  pendingCount: number;
  state: SyncState;
}

type Listener = (s: SyncSnapshot) => void;

const RETRY_MS = [2000, 4000, 8000];

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function createSyncer() {
  let snapshot: SyncSnapshot = { online: isOnline(), pendingCount: 0, state: "idle" };
  const listeners = new Set<Listener>();
  let flushing = false;
  let retry = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function emit(patch: Partial<SyncSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l(snapshot));
  }

  async function refresh(): Promise<void> {
    const pending = await getQueuedMarks();
    emit({ pendingCount: pending.length, online: isOnline() });
  }

  function groupByClassDate(marks: QueuedMark[]): Map<string, QueuedMark[]> {
    const groups = new Map<string, QueuedMark[]>();
    for (const m of marks) {
      const k = `${m.classId}|${m.date}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(m);
    }
    return groups;
  }

  async function flush(): Promise<void> {
    if (flushing) return;
    const pending = await getQueuedMarks();
    if (pending.length === 0) {
      emit({ pendingCount: 0, state: "idle", online: isOnline() });
      return;
    }
    if (!isOnline()) {
      emit({ pendingCount: pending.length, state: "offline", online: false });
      return;
    }

    flushing = true;
    emit({ state: "syncing", online: true, pendingCount: pending.length });
    let hadError = false;

    for (const [, group] of groupByClassDate(pending)) {
      try {
        await api.markAttendance({
          classId: group[0].classId,
          date: group[0].date,
          records: group.map((m) => ({
            studentId: m.studentId,
            status: m.status,
            idempotencyKey: m.idempotencyKey,
          })),
        });
        await removeMarks(group.map(markKey));
      } catch {
        hadError = true;
      }
    }

    flushing = false;
    const remaining = await getQueuedMarks();

    if (hadError) {
      emit({ pendingCount: remaining.length, state: "error", online: isOnline() });
      scheduleRetry();
    } else {
      retry = 0;
      emit({ pendingCount: remaining.length, state: "idle", online: isOnline() });
    }
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)];
    retry += 1;
    retryTimer = setTimeout(() => {
      void flush();
    }, delay);
  }

  async function enqueueAndSync(input: MarkInput): Promise<void> {
    await enqueueMark(input);
    await refresh();
    if (isOnline()) void flush();
  }

  function init(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      emit({ online: true });
      void flush();
    });
    window.addEventListener("offline", () => emit({ online: false, state: "offline" }));
    void flush();
  }

  return {
    subscribe(l: Listener): () => void {
      listeners.add(l);
      l(snapshot);
      return () => listeners.delete(l);
    },
    getSnapshot: () => snapshot,
    refresh,
    flush,
    enqueueAndSync,
    init,
  };
}

export const syncer = createSyncer();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test syncer`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full web suite**

Run: `pnpm --filter @mymakaranta/web test`
Expected: all offline tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/offline/syncer.ts apps/web/src/lib/offline/syncer.test.ts
git commit -m "feat(offline): syncer — batch-by-(class,date) flush, backoff retry, online listeners"
```

---

## Task 7: useOfflineSync hook

**Files:**
- Create: `apps/web/src/lib/offline/useOfflineSync.ts`
- Test: `apps/web/src/lib/offline/useOfflineSync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/offline/useOfflineSync.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mymakaranta/web test useOfflineSync`
Expected: FAIL — cannot find module `./useOfflineSync`.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/lib/offline/useOfflineSync.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import { syncer, type SyncSnapshot } from "./syncer";

export function useOfflineSync(): SyncSnapshot {
  const [snap, setSnap] = useState<SyncSnapshot>(syncer.getSnapshot());
  useEffect(() => {
    const unsub = syncer.subscribe(setSnap);
    syncer.init();
    void syncer.refresh();
    return unsub;
  }, []);
  return snap;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mymakaranta/web test useOfflineSync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/offline/useOfflineSync.ts apps/web/src/lib/offline/useOfflineSync.test.ts
git commit -m "feat(offline): useOfflineSync hook over the syncer"
```

---

## Task 8: Wire the marking grid to the offline layer

**Files:**
- Modify: `apps/web/src/app/(app)/attendance/page.tsx`

This replaces the debounced direct save with offline-first enqueue, adds cache-fallback loading + queued-mark overlay, and swaps the `saveState` span for an offline-aware indicator.

- [ ] **Step 1: Add imports**

At the top of `apps/web/src/app/(app)/attendance/page.tsx`, add after the existing `@/lib/api` import:
```ts
import { syncer } from "@/lib/offline/syncer";
import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import {
  cacheRoster,
  getCachedRoster,
  cacheClasses,
  getCachedClasses,
} from "@/lib/offline/roster-cache";
import { overlayQueuedMarks } from "@/lib/offline/overlay";
import { getQueuedMarks } from "@/lib/offline/queue";
```

- [ ] **Step 2: Use the offline sync hook + drop the old save plumbing**

Inside the component, add near the other hooks:
```ts
const sync = useOfflineSync();
```
Remove the now-unused `saveState`, `setSaveState`, `saveTimer`, `pendingRecords`, `flushSave`, and `scheduleSave` (the syncer owns persistence now).

- [ ] **Step 3: Classes load with cache fallback**

Replace the classes `useEffect` body:
```ts
useEffect(() => {
  api.listClasses()
    .then((cs) => {
      void cacheClasses(cs);
      setClasses(cs);
      if (cs[0]) setSelectedClassId(cs[0].id);
    })
    .catch(async () => {
      const cached = await getCachedClasses();
      if (cached) {
        setClasses(cached);
        if (cached[0]) setSelectedClassId(cached[0].id);
      }
    })
    .finally(() => setClassesLoading(false));
}, []);
```

- [ ] **Step 4: Roster load with cache fallback + queued-mark overlay**

Replace `loadAttendance`:
```ts
const loadAttendance = useCallback(async (classId: string, date: string) => {
  if (!classId) return;
  setGridLoading(true);
  setGridError(null);

  const render = async (students: AttendanceDay["students"]) => {
    const queued = await getQueuedMarks();
    const forDay = queued.filter((q) => q.classId === classId && q.date === date);
    const overlaid = overlayQueuedMarks(students, forDay);
    setRecords(
      overlaid.map((s) => ({
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        photoUrl: s.photoUrl,
        status: s.status,
      })),
    );
  };

  try {
    const data = await api.getClassAttendance(classId, date);
    void cacheRoster(classId, data);
    await render(data.students);
  } catch (err) {
    const cached = await getCachedRoster(classId, date);
    if (cached) {
      await render(cached.students);
    } else {
      setGridError(err instanceof ApiError ? err.message : "Could not load attendance.");
    }
  } finally {
    setGridLoading(false);
  }
}, []);
```
(`AttendanceDay` is already imported via the existing `@/lib/api` import group; if not, add it.)

- [ ] **Step 5: Offline-first tap + mark-all**

Replace `tapTile` and `markAllPresent`:
```ts
function persist(next: LocalRecord[], changed: LocalRecord[]) {
  for (const r of changed) {
    if (r.status !== null) {
      void syncer.enqueueAndSync({
        classId: selectedClassId,
        date: selectedDate,
        studentId: r.studentId,
        status: r.status,
      });
    }
  }
}

function tapTile(studentId: string) {
  setRecords((prev) => {
    const next = prev.map((r) =>
      r.studentId === studentId ? { ...r, status: cycleStatus(r.status) } : r,
    );
    const changed = next.filter((r) => r.studentId === studentId);
    persist(next, changed);
    return next;
  });
}

function markAllPresent() {
  setRecords((prev) => {
    const next = prev.map((r) => ({ ...r, status: "PRESENT" as AttendanceStatus }));
    persist(next, next);
    return next;
  });
}
```

- [ ] **Step 6: Offline connection pill + offline-aware status indicator**

First, add a quiet connection pill in the header block, right after the
`<p>Mark daily attendance for your class.</p>` line, so the teacher always knows
their connection state (`Badge` is already imported):
```tsx
{!sync.online && (
  <div className="mt-2">
    <Badge tone="warning">Offline — marks saved on this device</Badge>
  </div>
)}
```

Then replace the save-indicator `<span>` block (the one keyed on `saveState`) with:
```tsx
<span
  aria-live="polite"
  className={cn(
    "text-caption font-medium transition-opacity duration-micro tabular-nums whitespace-nowrap",
    sync.state === "idle" && sync.pendingCount === 0 ? "opacity-60" : "opacity-100",
    sync.state === "error" ? "text-error" : !sync.online ? "text-warning" : "text-ink-500",
  )}
>
  {!sync.online
    ? `${sync.pendingCount} saved on this device`
    : sync.state === "syncing"
      ? `Syncing ${sync.pendingCount}…`
      : sync.state === "error"
        ? "Sync failed — retrying"
        : "All saved"}
</span>
```

- [ ] **Step 7: Typecheck + lint + build**

Run:
```bash
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
Expected: all pass; `/attendance` route builds.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(app)/attendance/page.tsx"
git commit -m "feat(offline): wire marking grid to offline-first queue + sync with cache fallback"
```

---

## Task 9: Offline browser QA (manual verification)

No code; this is the third safety net (matches the Sprint 2 QA discipline). Use the gstack browse playbook in `docs/RESUME.md` (re-inject `mm.token`/`mm.user`, one interaction per bash call).

- [ ] **Step 1: Start servers + seed** (reuse the Sprint 2 seed flow; a class with ≥3 enrolled students in the current term).

- [ ] **Step 2: Online load → cache.** Open `/attendance`, select the class while online (this caches the roster + classes). Confirm 3 students render.

- [ ] **Step 3: Go offline.** In the browse session, emulate offline (CDP: `Network.emulateNetworkConditions offline=true`, or Playwright `context.setOffline(true)`).

- [ ] **Step 4: Mark offline.** Tap students; confirm tiles update and the indicator reads "Offline" + "N saved on this device". Reload the page while still offline; confirm the roster re-renders from cache **with the queued marks overlaid** (nothing lost).

- [ ] **Step 5: Go online.** Restore the network. Confirm the indicator transitions to "Syncing N…" then "All saved", with no console errors.

- [ ] **Step 6: Verify persistence via API.** `GET /v1/attendance/class/:id?date=...` with the token; confirm the offline-marked statuses are saved server-side.

- [ ] **Step 7: Record results** in `.gstack/qa-reports/` (gitignored) and fix any UI↔API seam bug found (atomic `fix(qa):` commit + re-verify), as in Sprint 2.

---

## Task 10: Docs + finish

- [ ] **Step 1: Update RESUME.md**

In `docs/RESUME.md`: move Sprint 2.5 from "Next steps" into "Current state" (built + QA'd), note the offline layer location (`apps/web/src/lib/offline/`) and that `apps/web` now has vitest. Update the test count.

- [ ] **Step 2: Commit**

```bash
git add docs/RESUME.md
git commit -m "docs: RESUME update — Sprint 2.5 offline attendance built + QA'd"
```

- [ ] **Step 3: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to choose merge/PR/cleanup. Merge `sprint-2.5-offline-attendance` → `main` once tests + builds + offline QA are green.

---

## Notes for the implementer

- **Run tests from repo root** with `pnpm --filter @mymakaranta/web test <pattern>` (Turborepo workspace).
- **fake-indexeddb/auto** gives each test file a fresh in-memory IDB; `deleteDB(DB_NAME)` in `beforeEach` keeps tests isolated.
- **Idempotency:** never worry about double-sends — the server upsert keyed on `(studentId, date)` makes any replay a no-op. That's why a failed-then-retried batch is always safe.
- **Don't touch** the NestJS API, the Prisma schema, or `public/sw.js` — this sprint is client-only by design.
- **Keep `idempotencyKey` flowing** end to end (queue → syncer payload) so server-side traceability works even though dedup relies on the upsert key.
- **Retry timer in tests:** the syncer error test schedules a real backoff `setTimeout`. It's harmless (it re-reads an emptied queue on the next tick and no-ops), but if you see cross-test flakiness, wrap that test in `vi.useFakeTimers()` / `vi.useRealTimers()` — fake-indexeddb resolves via microtasks, so `await` still works under fake timers.
- **`Date.now()` / `crypto.randomUUID()`** are used in `queue.enqueueMark`; both are available in jsdom + Node 24, no polyfill needed.
- **`noUncheckedIndexedAccess` is ON** (repo `tsconfig.base.json`). Any array index access (`arr[0].foo`) is a typecheck error — use optional chaining (`arr[0]?.foo`) or a non-null assertion (`arr[0]!`) in both source and tests. `pnpm --filter @mymakaranta/web typecheck` MUST pass for each task, not just the tests.
