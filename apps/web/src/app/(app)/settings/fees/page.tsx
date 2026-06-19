"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, cn } from "@mymakaranta/ui";
import { api, ApiError, type ClassLevel } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface TermOpt { id: string; label: string; isCurrent: boolean; }
interface ItemRow { name: string; naira: string; }

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

export default function FeesSettingsPage() {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classLevelId, setClassLevelId] = useState("");
  const [termId, setTermId] = useState("");
  const [currency, setCurrency] = useState("NGN");

  const [rows, setRows] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cls, yrs] = await Promise.all([api.listClassLevels(), api.listAcademicYears()]);
      setClassLevels(cls);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      if (cls[0]) setClassLevelId(cls[0].id);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
      try {
        const school = await api.getMySchool();
        if (school.currency) setCurrency(school.currency);
      } catch {
        /* default NGN */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!classLevelId || !termId) return;
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const items = await api.getFeeItems(classLevelId, termId);
      setRows(
        items
          .sort((a, b) => a.order - b.order)
          .map((i) => ({ name: i.name, naira: (i.amountKobo / 100).toFixed(2) })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load fee items.");
    } finally {
      setLoading(false);
    }
  }, [classLevelId, termId]);
  useEffect(() => { void load(); }, [load]);

  const totalKobo = rows.reduce((acc, r) => acc + Math.round((Number(r.naira) || 0) * 100), 0);

  const update = (i: number, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { name: "", naira: "0.00" }]);

  const save = async () => {
    if (!classLevelId || !termId) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const items = rows.map((r, i) => ({
        name: r.name.trim(),
        amountKobo: Math.round((Number(r.naira) || 0) * 100),
        order: i,
      }));
      const saved = await api.setFeeItems(classLevelId, termId, items);
      setRows(
        saved
          .sort((a, b) => a.order - b.order)
          .map((i) => ({ name: i.name, naira: (i.amountKobo / 100).toFixed(2) })),
      );
      setMsg("Saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const ready = !!classLevelId && !!termId;

  return (
    <PageContainer>
      <PageHeader
        title="Fee structure"
        description="Set the fee structure for a class level in a given term. Invoices are generated from this structure."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Fee structure</span>
            <span className="text-small font-medium tabular-nums text-ink-700 dark:text-ink-300">
              Total: {formatMoney(totalKobo, currency)}
            </span>
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
            <p className="text-small text-ink-500">Select a class level and term to edit its fee structure.</p>
          ) : loading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.length === 0 && (
                <p className="text-small text-ink-500">No fee items yet. Add lines like Tuition, PTA levy, Books…</p>
              )}
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    aria-label="fee name" value={r.name} placeholder="e.g. Tuition"
                    onChange={(e) => update(i, { name: e.target.value })}
                    className={cn(cls, "flex-1")}
                  />
                  <input
                    aria-label="amount in naira" type="number" min="0" step="0.01" value={r.naira}
                    onChange={(e) => update(i, { naira: e.target.value })}
                    className={cn(cls, "w-32 text-right tabular-nums")}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addRow} className="self-start mt-1">+ Add item</Button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={!ready || saving || loading}>
              {saving ? "Saving…" : "Save fee structure"}
            </Button>
            {msg && <span className="text-caption text-success">{msg}</span>}
            {error && <span className="text-caption text-error">{error}</span>}
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
