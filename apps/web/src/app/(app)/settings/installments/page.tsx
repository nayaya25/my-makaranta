"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, cn } from "@mymakaranta/ui";
import { api, ApiError, type AcademicYear, type ClassLevel } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

/** A schedule row in display units: percent (not bps) and a yyyy-mm-dd date string for <input type="date">. */
interface DraftRow { label: string; percent: string; dueDate: string; }

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

/** ISO datetime → yyyy-mm-dd for a date input. */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function InstallmentsSettingsPage() {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classLevelId, setClassLevelId] = useState("");
  const [termId, setTermId] = useState("");

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [levels, yrs] = await Promise.all([api.listClassLevels(), api.listAcademicYears()]);
      setClassLevels(levels);
      const ts: TermOpt[] = (yrs as AcademicYear[]).flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      if (levels[0]) setClassLevelId(levels[0].id);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!classLevelId || !termId) return;
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const schedule = await api.getInstallmentSchedule(classLevelId, termId);
      setRows(
        schedule
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ label: s.label ?? "", percent: (s.percentBps / 100).toString(), dueDate: toDateInputValue(s.dueDate) })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the installment schedule.");
    } finally {
      setLoading(false);
    }
  }, [classLevelId, termId]);
  useEffect(() => { void load(); }, [load]);

  const totalPercent = rows.reduce((acc, r) => acc + (Number(r.percent) || 0), 0);
  // Guard against float noise (e.g. 33.33 * 3 = 99.99...) with a small epsilon.
  const sumOk = rows.length > 0 && Math.abs(totalPercent - 100) < 0.01;

  const update = (i: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { label: "", percent: "", dueDate: "" }]);

  const save = async () => {
    if (!classLevelId || !termId) return;
    if (rows.length > 0 && !sumOk) { setError("Percentages must sum to exactly 100% before saving."); return; }
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const installments = rows.map((r, i) => ({
        order: i,
        label: r.label.trim() || undefined,
        percentBps: Math.round((Number(r.percent) || 0) * 100),
        dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : new Date().toISOString(),
      }));
      const saved = await api.setInstallmentSchedule({ classLevelId, termId, installments });
      setRows(
        saved
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ label: s.label ?? "", percent: (s.percentBps / 100).toString(), dueDate: toDateInputValue(s.dueDate) })),
      );
      setMsg(rows.length === 0 ? "Schedule cleared." : "Saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the installment schedule.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setRows([]);
    if (!classLevelId || !termId) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await api.setInstallmentSchedule({ classLevelId, termId, installments: [] });
      setMsg("Schedule cleared.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clear the schedule.");
    } finally {
      setSaving(false);
    }
  };

  const ready = !!classLevelId && !!termId;
  const canSave = ready && !saving && !loading && (rows.length === 0 || sumOk);

  return (
    <PageContainer>
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Settings
      </Link>

      <PageHeader
        title="Installment schedule"
        description="Split each class level's per-term invoice into ordered installments by percentage."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Schedule</span>
            {rows.length > 0 && (
              <span
                className={cn(
                  "text-small font-medium tabular-nums",
                  sumOk ? "text-success" : "text-error",
                )}
              >
                Total: {totalPercent.toFixed(2)}%{!sumOk && " (must equal 100%)"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex gap-3 flex-wrap mb-4">
            <label className="text-small text-ink-500 flex flex-col gap-1">
              Class level
              <select value={classLevelId} onChange={(e) => setClassLevelId(e.target.value)} className={cls}>
                {classLevels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-small text-ink-500 flex flex-col gap-1">
              Term
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>

          {!ready ? (
            <p className="text-small text-ink-500">Select a class level and term to edit its installment schedule.</p>
          ) : loading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.length === 0 && (
                <p className="text-small text-ink-500">
                  No installment schedule set. Invoices for this level/term will use a single due date. Add rows to split into installments.
                </p>
              )}
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="w-6 text-small text-ink-400 tabular-nums">{i + 1}.</span>
                  <input
                    aria-label="Installment label" value={r.label} placeholder="e.g. First installment"
                    onChange={(e) => update(i, { label: e.target.value })}
                    className={cn(cls, "flex-1 min-w-[160px]")}
                  />
                  <input
                    aria-label="Percent of total" type="number" min="0" max="100" step="0.01" value={r.percent}
                    placeholder="%"
                    onChange={(e) => update(i, { percent: e.target.value })}
                    className={cn(cls, "w-24 text-right tabular-nums")}
                  />
                  <input
                    aria-label="Due date" type="date" value={r.dueDate}
                    onChange={(e) => update(i, { dueDate: e.target.value })}
                    className={cls}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addRow} className="self-start mt-1">+ Add installment</Button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={!canSave}>
              {saving ? "Saving…" : "Save schedule"}
            </Button>
            {ready && rows.length > 0 && (
              <Button variant="ghost" onClick={clear} disabled={saving || loading}>
                Clear schedule
              </Button>
            )}
            {msg && <span className="text-caption text-success">{msg}</span>}
            {error && <span className="text-caption text-error">{error}</span>}
          </div>
        </CardBody>
      </Card>

      <p className="mt-4 text-caption text-ink-400 dark:text-ink-500">
        Percentages must sum to exactly 100% to save. Installments are applied to the discounted net total the next time
        invoices are generated for this level/term; the last installment absorbs any rounding.
      </p>
    </PageContainer>
  );
}
