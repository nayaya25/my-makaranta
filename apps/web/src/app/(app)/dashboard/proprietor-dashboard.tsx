"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, Spinner } from "@mymakaranta/ui";
import { api, type AcademicYear, type ProprietorDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ProprietorDashboardView() {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ProprietorDashboard | null>(null);
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
        /* fall through to the no-term load below */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getProprietorDashboard(termId || undefined)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [termId]);

  const pct = data ? Math.round(data.attendance.rate * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Dashboard</h1>
        {terms.length > 0 && (
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No active term yet</p>
          <p className="text-small text-ink-500 mt-1">Set a current term to see your school at a glance.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Hero: collected this week */}
          <Card elevation="sm">
            <CardBody>
              <p className="text-caption text-ink-500">Collected this week</p>
              <p className="text-h1 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">
                {formatMoney(data.fees.collectedThisWeekKobo, "NGN")}
              </p>
            </CardBody>
          </Card>

          {/* Fees row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Expected", kobo: data.fees.expectedKobo },
              { label: "Collected", kobo: data.fees.collectedKobo },
              { label: "Outstanding", kobo: data.fees.outstandingKobo },
              { label: "Overdue", kobo: data.fees.overdueKobo, tone: "text-error" },
            ].map((k) => (
              <Card key={k.label} elevation="sm">
                <CardBody>
                  <p className="text-caption text-ink-500">{k.label}</p>
                  <p className={`text-body font-semibold tabular-nums ${k.tone ?? "text-ink-1000 dark:text-ink-100"}`}>
                    {formatMoney(k.kobo, "NGN")}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Attendance + Results */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card elevation="sm">
              <CardBody>
                <p className="text-caption text-ink-500">Attendance rate</p>
                <p className="text-h2 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">{pct}%</p>
                <p className="text-caption text-ink-500 mt-1">
                  {data.attendance.presentDays} of {data.attendance.totalDays} marks (term to date)
                </p>
              </CardBody>
            </Card>
            <Card elevation="sm">
              <CardBody>
                <p className="text-caption text-ink-500">Results released</p>
                <p className="text-h2 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">
                  {data.results.classesReleased} of {data.results.classesTotal}
                </p>
                <p className="text-caption text-ink-500 mt-1">
                  {data.results.topClass
                    ? `Top class: ${data.results.topClass.name} (${data.results.topClass.average}%)`
                    : "No classes released yet"}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
