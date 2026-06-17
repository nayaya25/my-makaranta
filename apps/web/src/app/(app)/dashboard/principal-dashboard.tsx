"use client";

import { useEffect, useState } from "react";
import { Badge, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type AcademicYear, type PrincipalDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import AlertsPanel from "./alerts-panel";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function PrincipalDashboardView({ onForbidden }: { onForbidden: () => void }) {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<PrincipalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const yrs: AcademicYear[] = await api.listAcademicYears();
        const ts = yrs.flatMap((y) =>
          (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })),
        );
        setTerms(ts);
        const cur = ts.find((t) => t.isCurrent) ?? ts[0];
        if (cur) setTermId(cur.id);
      } catch {
        /* fall through to the load below */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPrincipalDashboard(termId || undefined)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) { onForbidden(); return; }
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const pct = (r: number) => `${Math.round(r * 100)}%`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Today at a glance</h1>
        {terms.length > 0 && (
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
          >
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
      </div>

      <AlertsPanel termId={termId || undefined} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null || data.classes.length === 0 ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No classes this term yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-100 dark:border-white/10">
          <table className="w-full text-small">
            <thead className="bg-surface dark:bg-surface-dark text-ink-500">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Class</th>
                <th className="py-2 px-3 text-left font-medium">Form teacher</th>
                <th className="py-2 px-3 text-right font-medium">Attendance</th>
                <th className="py-2 px-3 text-left font-medium">Results</th>
                <th className="py-2 px-3 text-right font-medium">Fees paid</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => {
                const lowAttendance = c.attendance.totalDays > 0 && c.attendance.rate < 0.85;
                const incomplete = c.results.subjectsScored < c.results.subjectsOffered;
                return (
                  <tr key={c.classId} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-2 px-3 font-medium text-ink-1000 dark:text-ink-100">{c.className}</td>
                    <td className="py-2 px-3 text-ink-700 dark:text-ink-300">{c.formTeacher ?? "—"}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${lowAttendance ? "text-warning font-semibold" : "text-ink-700 dark:text-ink-300"}`}>
                      {c.attendance.totalDays > 0 ? pct(c.attendance.rate) : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${incomplete ? "text-warning font-semibold" : "text-ink-700 dark:text-ink-300"}`}>
                          {c.results.subjectsScored}/{c.results.subjectsOffered}
                        </span>
                        <Badge tone={c.results.released ? "success" : "neutral"}>{c.results.released ? "Released" : "Draft"}</Badge>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
                      {pct(c.fees.paidRate)}
                      <span className="text-caption text-ink-500 ml-1">({formatMoney(c.fees.collectedKobo, "NGN")})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
