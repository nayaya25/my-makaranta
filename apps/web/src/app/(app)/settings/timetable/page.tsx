"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, Switch } from "@mymakaranta/ui";
import { api, ApiError, type Period } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

/* ── Validation ──────────────────────────────────────────────────────────── */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

function validatePeriod(label: string, startTime: string, endTime: string): string | null {
  if (!label.trim()) return "Label is required.";
  if (!isValidTime(startTime)) return "Start time must be HH:mm (24h).";
  if (!isValidTime(endTime)) return "End time must be HH:mm (24h).";
  if (startTime >= endTime) return "Start time must be before end time.";
  return null;
}

/* ── Types ───────────────────────────────────────────────────────────────── */
interface PeriodRow extends Period {
  /** dirty = local edits not yet saved */
  dirty?: boolean;
}

type DraftPeriod = {
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
};

const EMPTY_DRAFT: DraftPeriod = { label: "", startTime: "", endTime: "", isBreak: false };

/* ── PeriodRow component ─────────────────────────────────────────────────── */
function PeriodRowItem({
  period,
  onUpdated,
  onRemoved,
}: {
  period: PeriodRow;
  onUpdated: (updated: Period) => void;
  onRemoved: (id: string) => void;
}) {
  const [label, setLabel] = useState(period.label);
  const [startTime, setStartTime] = useState(period.startTime);
  const [endTime, setEndTime] = useState(period.endTime);
  const [isBreak, setIsBreak] = useState(period.isBreak);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const dirty =
    label !== period.label ||
    startTime !== period.startTime ||
    endTime !== period.endTime ||
    isBreak !== period.isBreak;

  const save = async () => {
    const validation = validatePeriod(label, startTime, endTime);
    if (validation) { setErr(validation); return; }
    setSaving(true);
    setErr(null);
    setSavedMsg(null);
    try {
      const updated = await api.updatePeriod(period.id, { label, startTime, endTime, isBreak });
      onUpdated(updated);
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save period.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setErr(null);
    try {
      await api.deletePeriod(period.id);
      onRemoved(period.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not remove period.");
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-ink-100 dark:border-white/10 pb-4 last:border-0 last:pb-0">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Order badge */}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-caption font-semibold text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
          {period.order}
        </span>

        {/* Label */}
        <input
          aria-label="Period label"
          value={label}
          onChange={(e) => { setLabel(e.target.value); setErr(null); setSavedMsg(null); }}
          placeholder="e.g. Period 1"
          className="h-9 flex-1 min-w-[120px] rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400"
        />

        {/* Start time */}
        <input
          aria-label="Start time"
          value={startTime}
          onChange={(e) => { setStartTime(e.target.value); setErr(null); setSavedMsg(null); }}
          placeholder="HH:mm"
          className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />

        <span className="text-small text-ink-400">–</span>

        {/* End time */}
        <input
          aria-label="End time"
          value={endTime}
          onChange={(e) => { setEndTime(e.target.value); setErr(null); setSavedMsg(null); }}
          placeholder="HH:mm"
          className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />

        {/* Break toggle */}
        <label className="flex items-center gap-1.5 text-small text-ink-500 dark:text-ink-400 cursor-pointer select-none">
          <Switch
            checked={isBreak}
            onCheckedChange={(v) => { setIsBreak(v); setErr(null); setSavedMsg(null); }}
            aria-label="Mark as break"
          />
          Break
        </label>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          {dirty && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={removing}
            aria-label="Remove period"
          >
            {removing ? "…" : "✕"}
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {err && <p className="text-caption text-error pl-9">{err}</p>}
      {savedMsg && <p className="text-caption text-success pl-9">{savedMsg}</p>}
      {isBreak && (
        <p className="text-caption text-ink-400 pl-9">Break period — cannot be scheduled into.</p>
      )}
    </div>
  );
}

/* ── AddPeriodForm ───────────────────────────────────────────────────────── */
function AddPeriodForm({ nextOrder, onCreated }: { nextOrder: number; onCreated: (p: Period) => void }) {
  const [draft, setDraft] = useState<DraftPeriod>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const patch = (update: Partial<DraftPeriod>) => {
    setDraft((d) => ({ ...d, ...update }));
    setErr(null);
  };

  const submit = async () => {
    const validation = validatePeriod(draft.label, draft.startTime, draft.endTime);
    if (validation) { setErr(validation); return; }
    setAdding(true);
    setErr(null);
    try {
      const created = await api.createPeriod({
        label: draft.label.trim(),
        startTime: draft.startTime,
        endTime: draft.endTime,
        order: nextOrder,
        isBreak: draft.isBreak,
      });
      onCreated(created);
      setDraft(EMPTY_DRAFT);
      labelRef.current?.focus();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add period.");
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void submit();
  };

  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-small font-semibold text-ink-700 dark:text-ink-300">Add period</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={labelRef}
          aria-label="New period label"
          value={draft.label}
          onChange={(e) => patch({ label: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Break"
          className="h-9 flex-1 min-w-[120px] rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400"
        />
        <input
          aria-label="New period start time"
          value={draft.startTime}
          onChange={(e) => patch({ startTime: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="HH:mm"
          className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />
        <span className="text-small text-ink-400">–</span>
        <input
          aria-label="New period end time"
          value={draft.endTime}
          onChange={(e) => patch({ endTime: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="HH:mm"
          className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />
        <label className="flex items-center gap-1.5 text-small text-ink-500 dark:text-ink-400 cursor-pointer select-none">
          <Switch
            checked={draft.isBreak}
            onCheckedChange={(v) => patch({ isBreak: v })}
            aria-label="Mark new period as break"
          />
          Break
        </label>
        <Button
          onClick={submit}
          disabled={adding || !draft.label.trim() || !draft.startTime || !draft.endTime}
        >
          {adding ? "Adding…" : "Add period"}
        </Button>
      </div>
      {err && <p className="text-caption text-error">{err}</p>}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function TimetableSettingsPage() {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await api.listPeriods();
      setPeriods(data);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load periods.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpdated = (updated: Period) => {
    setPeriods((prev) => prev.map((p) => (p.id === updated.id ? { ...updated } : p)));
  };

  const handleRemoved = (id: string) => {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCreated = (created: Period) => {
    setPeriods((prev) => [...prev, created].sort((a, b) => a.order - b.order));
  };

  const nextOrder = periods.length > 0 ? Math.max(...periods.map((p) => p.order)) + 1 : 1;

  return (
    <PageContainer className="max-w-2xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Settings
      </Link>

      <PageHeader
        title="Bell schedule"
        description="Define the school's daily period structure — start/end times and break slots."
      />

      <Card>
        <CardHeader>
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Periods</span>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : loadErr ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-small text-error">{loadErr}</p>
              <Button variant="outline" size="sm" onClick={load}>Retry</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {periods.length === 0 ? (
                <p className="text-small text-ink-500 py-4 text-center">
                  No periods yet. Add your first period below.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {periods.map((p) => (
                    <PeriodRowItem
                      key={p.id}
                      period={p}
                      onUpdated={handleUpdated}
                      onRemoved={handleRemoved}
                    />
                  ))}
                </div>
              )}

              <div className="border-t border-ink-100 dark:border-white/10 pt-4 mt-2">
                <AddPeriodForm nextOrder={nextOrder} onCreated={handleCreated} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <p className="mt-4 text-caption text-ink-400 dark:text-ink-500">
        Times are 24-hour format (HH:mm). Periods are ordered by their order number.
        Break periods cannot be assigned to classes in the timetable builder.
      </p>
    </PageContainer>
  );
}
