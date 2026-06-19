"use client";

import { useEffect, useState } from "react";
import { Card, PageContainer, PageHeader, Spinner, StatCard } from "@mymakaranta/ui";
import { api, type AcademicYear, type ProprietorDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { BarChart3, CalendarCheck } from "lucide-react";
import AlertsPanel from "./alerts-panel";

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

  const termSelect =
    terms.length > 0 ? (
      <select
        value={termId}
        onChange={(e) => setTermId(e.target.value)}
        className="rounded-[10px] border border-ink-1000/10 bg-surface px-3.5 py-2 text-small font-medium text-ink-1000 transition-colors hover:border-ink-1000/20 focus-visible:shadow-focus focus-visible:outline-none dark:border-white/15 dark:bg-surface-dark dark:text-ink-100"
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    ) : null;

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="Your school at a glance this term." actions={termSelect} />

      <AlertsPanel termId={termId || undefined} />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-[14px] border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null ? (
        <Card className="p-10 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No active term yet</p>
          <p className="mt-1 text-small text-ink-500">Set a current term to see your school at a glance.</p>
        </Card>
      ) : (
        <div className="mt-2 flex flex-col gap-5">
          {/* Featured: collected this week */}
          <Card elevation="xs" className="p-6">
            <p className="text-small font-medium text-ink-500">Collected this week</p>
            <p className="mt-2 font-display text-h1 font-bold tabular-nums text-brand-700 dark:text-brand-300">
              {formatMoney(data.fees.collectedThisWeekKobo, "NGN")}
            </p>
          </Card>

          {/* Fee KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Expected" value={formatMoney(data.fees.expectedKobo, "NGN")} />
            <StatCard label="Collected" value={formatMoney(data.fees.collectedKobo, "NGN")} tone="success" />
            <StatCard label="Outstanding" value={formatMoney(data.fees.outstandingKobo, "NGN")} tone="warning" />
            <StatCard label="Overdue" value={formatMoney(data.fees.overdueKobo, "NGN")} tone="error" />
          </div>

          {/* Attendance + Results */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Attendance rate"
              value={`${pct}%`}
              icon={<CalendarCheck size={16} aria-hidden />}
              hint={`${data.attendance.presentDays} of ${data.attendance.totalDays} marks (term to date)`}
            />
            <StatCard
              label="Results released"
              value={`${data.results.classesReleased} of ${data.results.classesTotal}`}
              icon={<BarChart3 size={16} aria-hidden />}
              hint={
                data.results.topClass
                  ? `Top class: ${data.results.topClass.name} (${data.results.topClass.average}%)`
                  : "No classes released yet"
              }
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
