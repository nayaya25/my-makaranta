"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeader,
  Spinner,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type MyProfile,
  type Staff,
  type TeacherTimetable,
} from "@/lib/api";

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
] as const;

type DayOfWeek = (typeof DAYS)[number]["value"];

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body > *:not(#__next):not([data-nextjs-scroll-focus-boundary]) { display: none !important; }
  #__next > * { display: none !important; }
  #teacher-timetable-printable { display: block !important; }
  #teacher-timetable-printable * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  @page {
    size: A4 landscape;
    margin: 10mm 14mm;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-size: 10pt;
    background: white !important;
    color: black !important;
  }

  #teacher-timetable-printable { page-break-inside: avoid; }
}
`;

export default function TeacherTimetablePage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [staffId, setStaffId] = useState("");
  const [yearId, setYearId] = useState("");

  const [timetable, setTimetable] = useState<TeacherTimetable | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track whether default was set from "My timetable"
  const isMyTimetableRef = useRef(false);

  // Inject print CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "teacher-tt-print-css";
    style.textContent = PRINT_CSS;
    if (!document.getElementById("teacher-tt-print-css")) {
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById("teacher-tt-print-css")?.remove();
    };
  }, []);

  // Load staff + years, auto-select signed-in user's staff record
  useEffect(() => {
    void (async () => {
      setInitLoading(true);
      try {
        const [staffList, yearList, profile] = await Promise.all([
          api.listStaff(),
          api.listAcademicYears(),
          api.getMyProfile().catch((): MyProfile | null => null),
        ]);

        setStaff(staffList);
        setYears(yearList);

        if (yearList[0]) setYearId(yearList[0].id);

        // Auto-select the signed-in user's own staff record by matching staffNo
        if (profile?.staffNo) {
          const mine = staffList.find((s) => s.staffNo === profile.staffNo);
          if (mine) {
            setStaffId(mine.id);
            isMyTimetableRef.current = true;
          } else if (staffList[0]) {
            setStaffId(staffList[0].id);
          }
        } else if (staffList[0]) {
          setStaffId(staffList[0].id);
        }
      } catch {
        setError("Could not load staff or academic years.");
      } finally {
        setInitLoading(false);
      }
    })();
  }, []);

  const fetchTimetable = useCallback(async (sId: string, yId: string) => {
    if (!sId || !yId) return;
    setLoading(true);
    setError(null);
    try {
      const tt = await api.getTeacherTimetable(sId, yId);
      setTimetable(tt);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load timetable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (staffId && yearId && !initLoading) {
      void fetchTimetable(staffId, yearId);
    }
  }, [staffId, yearId, initLoading, fetchTimetable]);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedYear = years.find((y) => y.id === yearId);
  const periods = timetable ? [...timetable.periods].sort((a, b) => a.order - b.order) : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title="Teacher Timetable"
        description="View a teacher's weekly schedule across all classes."
        actions={
          timetable && periods.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print
            </Button>
          ) : undefined
        }
      />

      {/* Selects row */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Teacher
          <select
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              isMyTimetableRef.current = false;
            }}
            className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
                {s.id === staffId && isMyTimetableRef.current ? " (Me)" : ""}
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

      {initLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : staff.length === 0 || years.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="Nothing to show"
          description={
            staff.length === 0
              ? "No staff found. Add staff members first."
              : "No academic years found. Create an academic year first."
          }
        />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : timetable && periods.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="No bell schedule"
          description="Configure periods in Settings → Timetable before viewing a timetable."
        />
      ) : timetable && timetable.entries.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="No timetable configured"
          description={`${selectedStaff ? `${selectedStaff.firstName} ${selectedStaff.lastName}` : "This teacher"} has no lessons assigned for this year.`}
        />
      ) : timetable ? (
        <>
          {/* Screen grid */}
          <Card className="overflow-hidden print:hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] text-left dark:border-white/10 dark:bg-white/[0.03]">
                    <th className="sticky left-0 z-10 w-40 min-w-[10rem] bg-ink-1000/[0.02] px-3 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500 dark:bg-white/[0.03]">
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
                          <td colSpan={6} className="px-3 py-2 text-caption text-ink-500">
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
                          const day = d.value as DayOfWeek;
                          const entry = timetable.entries.find(
                            (e) => e.dayOfWeek === day && e.periodId === period.id,
                          );

                          return (
                            <td key={day} className="px-2 py-2 align-top">
                              {entry ? (
                                <div className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5 dark:border-brand-800/50 dark:bg-brand-900/20">
                                  <p className="text-[12px] font-semibold text-ink-1000 dark:text-ink-100">
                                    {entry.className}
                                  </p>
                                  <p className="mt-0.5 text-caption text-ink-500 dark:text-ink-400">
                                    {entry.subjectName}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex h-10 items-center justify-center">
                                  <span className="text-caption text-ink-300 dark:text-ink-600">—</span>
                                </div>
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

          {/* Print-only layout */}
          <div id="teacher-timetable-printable" className="hidden print:block">
            <div className="mb-4 border-b-2 pb-3" style={{ borderColor: "#066666" }}>
              <h1 className="text-[1.1rem] font-bold uppercase tracking-wide text-black">
                Teacher Timetable
              </h1>
              <p className="mt-0.5 text-[0.8rem] text-gray-600">
                {selectedStaff
                  ? `${selectedStaff.firstName} ${selectedStaff.lastName}`
                  : ""}
                {selectedYear ? ` — ${selectedYear.name}` : ""}
              </p>
            </div>

            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr style={{ backgroundColor: "#f0fafa" }}>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-gray-700">
                    Period
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d.value}
                      className="border border-gray-300 px-2 py-1.5 text-center font-semibold text-gray-700"
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
                      <tr key={period.id} style={{ backgroundColor: "#f9f9f9" }}>
                        <td
                          colSpan={6}
                          className="border border-gray-300 px-2 py-1 text-left text-gray-500"
                        >
                          <span className="font-medium">{period.label}</span>
                          <span className="ml-2 text-gray-400">
                            {period.startTime}–{period.endTime}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={period.id}>
                      <td className="border border-gray-300 px-2 py-1.5 align-top">
                        <p className="font-semibold text-gray-800">{period.label}</p>
                        <p className="text-[0.65rem] text-gray-500">
                          {period.startTime}–{period.endTime}
                        </p>
                      </td>
                      {DAYS.map((d) => {
                        const day = d.value as DayOfWeek;
                        const entry = timetable.entries.find(
                          (e) => e.dayOfWeek === day && e.periodId === period.id,
                        );
                        return (
                          <td
                            key={day}
                            className="border border-gray-300 px-2 py-1.5 align-top text-center"
                          >
                            {entry ? (
                              <>
                                <p className="font-semibold text-gray-800">{entry.className}</p>
                                <p className="text-[0.65rem] text-gray-500">{entry.subjectName}</p>
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
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
        </>
      ) : null}
    </PageContainer>
  );
}
