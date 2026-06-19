"use client";

import { useEffect, useState } from "react";
import { Badge, Card, PageContainer, PageHeader, Spinner } from "@mymakaranta/ui";
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

  const termSelect =
    terms.length > 0 ? (
      <select
        value={termId}
        onChange={(e) => setTermId(e.target.value)}
        className="rounded-[10px] border border-ink-1000/10 bg-surface px-3.5 py-2 text-small font-medium text-ink-1000 transition-colors hover:border-ink-1000/20 focus-visible:shadow-focus focus-visible:outline-none dark:border-white/15 dark:bg-surface-dark dark:text-ink-100"
      >
        {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    ) : null;

  return (
    <PageContainer>
      <PageHeader title="Today at a glance" description="Class-by-class snapshot for the term." actions={termSelect} />

      <AlertsPanel termId={termId || undefined} />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-[14px] border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null || data.classes.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No classes this term yet</p>
          <p className="mt-1 text-small text-ink-500">Add classes and assign teachers to see them here.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                  <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Class</th>
                  <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Form teacher</th>
                  <th className="px-4 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-ink-500">Attendance</th>
                  <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Results</th>
                  <th className="px-4 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-ink-500">Fees paid</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => {
                  const lowAttendance = c.attendance.totalDays > 0 && c.attendance.rate < 0.85;
                  const incomplete = c.results.subjectsScored < c.results.subjectsOffered;
                  return (
                    <tr key={c.classId} className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]">
                      <td className="px-4 py-2.5 font-medium text-ink-1000 dark:text-ink-100">{c.className}</td>
                      <td className="px-4 py-2.5 text-ink-700 dark:text-ink-300">{c.formTeacher ?? "—"}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${lowAttendance ? "font-semibold text-warning" : "text-ink-700 dark:text-ink-300"}`}>
                        {c.attendance.totalDays > 0 ? pct(c.attendance.rate) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`tabular-nums ${incomplete ? "font-semibold text-warning" : "text-ink-700 dark:text-ink-300"}`}>
                            {c.results.subjectsScored}/{c.results.subjectsOffered}
                          </span>
                          <Badge tone={c.results.released ? "success" : "neutral"}>{c.results.released ? "Released" : "Draft"}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-700 dark:text-ink-300">
                        {pct(c.fees.paidRate)}
                        <span className="ml-1 text-caption text-ink-500">({formatMoney(c.fees.collectedKobo, "NGN")})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
