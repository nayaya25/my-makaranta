"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  cn,
} from "@mymakaranta/ui";
import { api, ApiError, type AttendanceSummary } from "@/lib/api";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 13);
  return { from: isoDate(from), to: isoDate(to) };
}

function rateColor(rate: number): string {
  if (rate >= 90) return "bg-success";
  if (rate >= 75) return "bg-warning";
  return "bg-error";
}

function rateTextColor(rate: number): string {
  if (rate >= 90) return "text-success";
  if (rate >= 75) return "text-warning";
  return "text-error";
}

export default function AttendanceOverviewPage() {
  const [from, setFrom] = useState(defaultRange().from);
  const [to, setTo] = useState(defaultRange().to);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getAttendanceSummary(f, t);
      setSummary(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(from, to);
  }, [load, from, to]);

  const anomalies = summary?.anomalies.filter((a) => a.absences >= 3) ?? [];

  return (
    <div className="px-4 py-8 mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Attendance Overview
          </h1>
          <p className="text-small text-ink-500">Class-level summary across the selected period.</p>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="mb-1 block text-caption font-medium text-ink-700 dark:text-ink-300">
              From
            </label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={cn(
                "flex h-9 rounded-input border border-ink-300 bg-surface px-3 text-small text-ink-1000",
                "dark:bg-surface-dark dark:border-white/15 dark:text-ink-100",
                "transition-shadow duration-micro focus:outline-none focus:shadow-focus",
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-ink-700 dark:text-ink-300">
              To
            </label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={cn(
                "flex h-9 rounded-input border border-ink-300 bg-surface px-3 text-small text-ink-1000",
                "dark:bg-surface-dark dark:border-white/15 dark:text-ink-100",
                "transition-shadow duration-micro focus:outline-none focus:shadow-focus",
              )}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(from, to)}
            aria-label="Refresh"
            className="h-9 w-9 p-0 shrink-0"
          >
            <RefreshCw size={15} aria-hidden />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && (
        <ErrorState description={loadError} onRetry={() => load(from, to)} />
      )}

      {!loading && !loadError && summary && (
        <>
          {/* Classes summary */}
          {summary.classes.length === 0 ? (
            <EmptyState
              icon={<BarChart3 size={28} />}
              title="No data yet"
              description="No attendance records found for the selected date range."
            />
          ) : (
            <div className="flex flex-col gap-3 mb-8">
              {summary.classes.map((cls) => {
                // API returns rate as a 0–1 fraction; the display + thresholds + bar all expect a percentage.
                const pct = cls.rate * 100;
                return (
                <Card key={cls.classId}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">
                        {cls.className}
                      </span>
                      <span
                        className={cn(
                          "text-h3 font-bold tabular-nums",
                          rateTextColor(pct),
                        )}
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </CardHeader>
                  <CardBody>
                    {/* Rate bar */}
                    <div className="mb-3 h-2 w-full rounded-pill bg-ink-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className={cn("h-full rounded-pill transition-all duration-standard ease-expo", rateColor(pct))}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {/* Counts */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-h3 font-bold tabular-nums text-success">{cls.present}</p>
                        <p className="text-caption text-ink-500">Present</p>
                      </div>
                      <div>
                        <p className="text-h3 font-bold tabular-nums text-error">{cls.absent}</p>
                        <p className="text-caption text-ink-500">Absent</p>
                      </div>
                      <div>
                        <p className="text-h3 font-bold tabular-nums text-warning">{cls.late}</p>
                        <p className="text-caption text-ink-500">Late</p>
                      </div>
                      <div>
                        <p className="text-h3 font-bold tabular-nums text-info">{cls.excused}</p>
                        <p className="text-caption text-ink-500">Excused</p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
                );
              })}
            </div>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-warning" aria-hidden />
                <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">
                  Attention needed
                </h2>
                <span className="text-caption text-ink-500 tabular-nums">
                  ({anomalies.length} student{anomalies.length !== 1 ? "s" : ""} with ≥3 absences)
                </span>
              </div>
              <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-hidden">
                {anomalies.map((a, i) => (
                  <div
                    key={a.studentId}
                    className={cn(
                      "flex items-center justify-between gap-4 px-4 py-3",
                      i < anomalies.length - 1 && "border-b border-ink-200 dark:border-white/10",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertTriangle size={14} className="text-warning shrink-0" aria-hidden />
                      <span className="text-small font-medium text-ink-1000 dark:text-ink-100 truncate">
                        {a.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-small tabular-nums text-error font-semibold">
                        {a.absences} absent
                      </span>
                      <Link
                        href={`/students/${a.studentId}`}
                        className="text-caption font-medium text-brand-500 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
