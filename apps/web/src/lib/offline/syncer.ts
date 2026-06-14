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
      const existing = groups.get(k);
      if (existing) existing.push(m);
      else groups.set(k, [m]);
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
      const first = group[0];
      if (!first) continue;
      try {
        await api.markAttendance({
          classId: first.classId,
          date: first.date,
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
    const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)] ?? 8000;
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
