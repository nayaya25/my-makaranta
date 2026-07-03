"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import Link from "next/link";
import {
  Button,
  Card,
  cn,
  EmptyState,
  PageContainer,
  PageHeader,
  Spinner,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type Class,
  type ClassTimetable,
  type Period,
  type SubjectAssignment,
} from "@/lib/api";

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
] as const;

type DayOfWeek = (typeof DAYS)[number]["value"];

function cellKey(day: DayOfWeek, periodId: string): string {
  return `${day}-${periodId}`;
}

export default function TimetablePage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classId, setClassId] = useState("");
  const [yearId, setYearId] = useState("");

  const [timetable, setTimetable] = useState<ClassTimetable | null>(null);
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-cell state
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [openDropdown, setOpenDropdown] = useState<{ day: DayOfWeek; periodId: string } | null>(null);

  // Load classes + years on mount
  useEffect(() => {
    void (async () => {
      try {
        const [cs, yrs] = await Promise.all([api.listClasses(), api.listAcademicYears()]);
        setClasses(cs);
        setYears(yrs);
        if (cs[0]) setClassId(cs[0].id);
        if (yrs[0]) setYearId(yrs[0].id);
      } catch {
        setError("Could not load classes or academic years.");
      }
    })();
  }, []);

  // Fetch timetable + assignments when class+year are selected
  const fetchTimetable = useCallback(async (cId: string, yId: string) => {
    if (!cId || !yId) return;
    setLoading(true);
    setError(null);
    try {
      const [tt, sa] = await Promise.all([
        api.getClassTimetable(cId, yId),
        api.listSubjectAssignments(cId, yId),
      ]);
      setTimetable(tt);
      setAssignments(sa);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load timetable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (classId && yearId) {
      void fetchTimetable(classId, yearId);
    }
  }, [classId, yearId, fetchTimetable]);

  // Valid assignments for dropdown (must have subject + staff)
  const validAssignments = assignments.filter((a) => a.subject && a.staff);

  const addToSaving = (key: string) =>
    setSavingCells((prev) => new Set([...prev, key]));

  const removeFromSaving = (key: string) =>
    setSavingCells((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const clearCellError = (key: string) =>
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  async function handleAssignmentSelect(
    day: DayOfWeek,
    period: Period,
    subjectAssignmentId: string,
  ) {
    if (!subjectAssignmentId) return;
    const key = cellKey(day, period.id);
    setOpenDropdown(null);
    addToSaving(key);
    clearCellError(key);
    try {
      await api.putTimetableEntry({
        classId,
        academicYearId: yearId,
        dayOfWeek: day,
        periodId: period.id,
        subjectAssignmentId,
      });
      await fetchTimetable(classId, yearId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setCellErrors((prev) => ({ ...prev, [key]: e.message }));
      } else {
        setCellErrors((prev) => ({ ...prev, [key]: e instanceof ApiError ? e.message : "Save failed." }));
      }
    } finally {
      removeFromSaving(key);
    }
  }

  async function handleClear(entryId: string, day: DayOfWeek, periodId: string) {
    const key = cellKey(day, periodId);
    addToSaving(key);
    clearCellError(key);
    try {
      await api.deleteTimetableEntry(entryId);
      await fetchTimetable(classId, yearId);
    } catch (e) {
      setCellErrors((prev) => ({ ...prev, [key]: e instanceof ApiError ? e.message : "Delete failed." }));
    } finally {
      removeFromSaving(key);
    }
  }

  const periods = timetable ? [...timetable.periods].sort((a, b) => a.order - b.order) : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title="Timetable"
        description="Build the weekly class timetable by assigning subjects to periods."
      />

      {/* Selects row */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Class
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Academic Year
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {/* Empty: no classes or years */}
      {!loading && (classes.length === 0 || years.length === 0) ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="Nothing to show"
          description={
            classes.length === 0
              ? "No classes found. Create a class first."
              : "No academic years found. Create an academic year first."
          }
        />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : timetable && periods.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={<Calendar size={28} />}
            title="No bell schedule"
            description="Configure your periods before building a timetable."
          />
          <Link href="/settings/timetable">
            <Button variant="outline" size="sm">
              Go to Settings → Timetable
            </Button>
          </Link>
        </div>
      ) : timetable ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] text-left dark:border-white/10 dark:bg-white/[0.03]">
                  {/* Period column */}
                  <th
                    className="sticky left-0 z-10 w-40 min-w-[10rem] bg-ink-1000/[0.02] px-3 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500 dark:bg-white/[0.03]"
                  >
                    Period
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d.value}
                      className="px-3 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500"
                    >
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  if (period.isBreak) {
                    return (
                      <tr
                        key={period.id}
                        className="border-t border-ink-1000/[0.06] bg-ink-1000/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"
                      >
                        <td
                          colSpan={6}
                          className="px-3 py-2 text-caption text-ink-500"
                        >
                          <span className="font-medium">{period.label}</span>
                          <span className="ml-2 text-ink-400">
                            {period.startTime}–{period.endTime}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={period.id}
                      className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]"
                    >
                      {/* Period label cell */}
                      <td className="sticky left-0 z-10 w-40 min-w-[10rem] bg-surface px-3 py-2 dark:bg-surface-dark">
                        <p className="font-medium text-ink-1000 dark:text-ink-100">
                          {period.label}
                        </p>
                        <p className="text-caption text-ink-400">
                          {period.startTime}–{period.endTime}
                        </p>
                      </td>

                      {/* Day cells */}
                      {DAYS.map((d) => {
                        const day = d.value;
                        const key = cellKey(day, period.id);
                        const isSaving = savingCells.has(key);
                        const clashMsg = cellErrors[key];
                        const entry = timetable.entries.find(
                          (e) => e.dayOfWeek === day && e.periodId === period.id,
                        );
                        const isDropdownOpen =
                          openDropdown?.day === day && openDropdown.periodId === period.id;

                        return (
                          <td
                            key={day}
                            className="px-2 py-2 align-top"
                          >
                            <div className="flex min-h-[3rem] flex-col items-center justify-center">
                              {isSaving ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin text-ink-400"
                                  aria-hidden
                                />
                              ) : entry ? (
                                /* Filled cell */
                                <div className="relative w-full rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5 dark:border-brand-800/50 dark:bg-brand-900/20">
                                  <button
                                    onClick={() => void handleClear(entry.id, day, period.id)}
                                    className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-1000/10 hover:text-ink-700 dark:hover:bg-white/10 dark:hover:text-ink-200"
                                    aria-label={`Remove ${entry.subjectName} on ${d.label}`}
                                  >
                                    <span aria-hidden className="text-[10px] font-bold leading-none">
                                      ×
                                    </span>
                                  </button>
                                  <p className="pr-4 text-[12px] font-semibold text-ink-1000 dark:text-ink-100">
                                    {entry.subjectName}
                                  </p>
                                  <p className="mt-0.5 text-caption text-ink-500 dark:text-ink-400">
                                    {entry.teacherName}
                                  </p>
                                </div>
                              ) : isDropdownOpen ? (
                                /* Dropdown open */
                                <div className="w-full">
                                  <select
                                    autoFocus
                                    defaultValue=""
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val) {
                                        void handleAssignmentSelect(day, period, val);
                                      } else {
                                        setOpenDropdown(null);
                                      }
                                    }}
                                    onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
                                    className="h-9 w-full rounded-input border border-brand-400 bg-surface dark:bg-surface-dark px-2 text-small focus:outline-none"
                                  >
                                    <option value="">Select subject…</option>
                                    {validAssignments.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.subject!.name} — {a.staff!.firstName} {a.staff!.lastName}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                /* Empty cell */
                                <button
                                  onClick={() => setOpenDropdown({ day, periodId: period.id })}
                                  className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-lg border text-lg font-light transition-colors",
                                    "border-brand-300 text-brand-500 hover:border-brand-400 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-900/20",
                                  )}
                                  aria-label={`Add subject for ${d.label} ${period.label}`}
                                >
                                  +
                                </button>
                              )}
                            </div>
                            {clashMsg && (
                              <p className="mt-1 text-caption text-error">{clashMsg}</p>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </PageContainer>
  );
}
