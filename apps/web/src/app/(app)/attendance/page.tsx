"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Select,
  Spinner,
  cn,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AttendanceDay,
  type AttendanceStatus,
  type Class,
} from "@/lib/api";
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
import { CalendarCheck, CheckCheck } from "lucide-react";

type StatusOrNull = AttendanceStatus | null;

const STATUS_CYCLE: StatusOrNull[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
];

function cycleStatus(current: StatusOrNull): AttendanceStatus {
  if (current === null) return "PRESENT";
  const idx = STATUS_CYCLE.indexOf(current);
  if (idx === -1 || idx === STATUS_CYCLE.length - 1) return "PRESENT";
  return STATUS_CYCLE[idx + 1] as AttendanceStatus;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

const STATUS_TONE: Record<AttendanceStatus, "success" | "error" | "warning" | "info"> = {
  PRESENT: "success",
  ABSENT: "error",
  LATE: "warning",
  EXCUSED: "info",
};

const STATUS_TILE_BG: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success/8 border-success/30",
  ABSENT: "bg-error/8 border-error/30",
  LATE: "bg-warning/8 border-warning/30",
  EXCUSED: "bg-info/8 border-info/30",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface LocalRecord {
  studentId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  status: StatusOrNull;
}

export default function AttendancePage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());

  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  const sync = useOfflineSync();

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

  useEffect(() => {
    if (selectedClassId) loadAttendance(selectedClassId, selectedDate);
  }, [selectedClassId, selectedDate, loadAttendance]);

  function persist(changed: LocalRecord[]) {
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
      persist(next.filter((r) => r.studentId === studentId));
      return next;
    });
  }

  function markAllPresent() {
    setRecords((prev) => {
      const next = prev.map((r) => ({ ...r, status: "PRESENT" as AttendanceStatus }));
      persist(next);
      return next;
    });
  }

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="px-4 py-8 mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
          Attendance
        </h1>
        <p className="text-small text-ink-500">Mark daily attendance for your class.</p>
        {!sync.online && (
          <div className="mt-2">
            <Badge tone="warning">Offline — marks saved on this device</Badge>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-small font-medium text-ink-700 dark:text-ink-300">
            Class
          </label>
          {classesLoading ? (
            <div className="h-11 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark animate-pulse" />
          ) : (
            <Select.Root value={selectedClassId} onValueChange={setSelectedClassId}>
              <Select.Trigger>
                <Select.Value placeholder="Select a class" />
              </Select.Trigger>
              <Select.Content>
                {classes.map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}
        </div>

        <div className="flex-1 sm:max-w-[180px]">
          <label className="mb-1.5 block text-small font-medium text-ink-700 dark:text-ink-300">
            Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={cn(
              "flex h-11 w-full rounded-input border border-ink-300 bg-surface px-3.5 text-body text-ink-1000",
              "dark:bg-surface-dark dark:border-white/15 dark:text-ink-100",
              "transition-shadow duration-micro focus:outline-none focus:shadow-focus",
            )}
          />
        </div>

        <div className="flex items-center gap-3 sm:self-end">
          <Button
            variant="outline"
            size="sm"
            onClick={markAllPresent}
            disabled={records.length === 0 || gridLoading}
            className="h-11 whitespace-nowrap"
          >
            <CheckCheck size={16} className="mr-2" aria-hidden />
            Mark all present
          </Button>

          {/* Save indicator */}
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
        </div>
      </div>

      {/* Grid area */}
      {gridLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!gridLoading && gridError && (
        <ErrorState
          description={gridError}
          onRetry={() => loadAttendance(selectedClassId, selectedDate)}
        />
      )}

      {!gridLoading && !gridError && records.length === 0 && selectedClassId && (
        <EmptyState
          icon={<CalendarCheck size={28} />}
          title="No students"
          description={
            selectedClass
              ? `${selectedClass.name} has no enrolled students.`
              : "This class has no students."
          }
        />
      )}

      {!gridLoading && !gridError && records.length > 0 && (
        <>
          <p className="mb-3 text-caption text-ink-500 tabular-nums">
            {records.length} student{records.length !== 1 ? "s" : ""} &middot; Tap a card to cycle status
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {records.map((r) => (
              <button
                key={r.studentId}
                onClick={() => tapTile(r.studentId)}
                aria-label={`${r.firstName} ${r.lastName}: ${r.status ?? "unmarked"}. Tap to cycle.`}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-card border p-4 min-h-[120px] justify-center",
                  "transition-colors duration-micro active:scale-[0.97] ease-expo",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                  r.status
                    ? STATUS_TILE_BG[r.status]
                    : "bg-surface dark:bg-surface-dark border-ink-200 dark:border-white/10",
                )}
              >
                <Avatar
                  name={`${r.firstName} ${r.lastName}`}
                  src={r.photoUrl ?? undefined}
                  size="md"
                />
                <div className="flex flex-col items-center gap-1 min-w-0 w-full">
                  <span className="text-small font-medium text-ink-1000 dark:text-ink-100 text-center leading-tight truncate w-full">
                    {r.firstName} {r.lastName}
                  </span>
                  {r.status ? (
                    <Badge tone={STATUS_TONE[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  ) : (
                    <span className="text-caption text-ink-500">— unmarked</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
