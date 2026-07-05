"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, Switch } from "@mymakaranta/ui";
import { api, ApiError, type DiscountMethod, type DiscountScheme } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

/* ── Validation ──────────────────────────────────────────────────────────── */
function validateScheme(name: string, method: DiscountMethod, value: number): string | null {
  if (!name.trim()) return "Name is required.";
  if (!Number.isFinite(value)) return "Value must be a number.";
  if (method === "PERCENT" && (value < 1 || value > 100)) return "Percent value must be between 1 and 100.";
  if (method === "FIXED" && value <= 0) return "Fixed value must be greater than 0.";
  return null;
}

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

type DraftScheme = { name: string; method: DiscountMethod; value: string };

const EMPTY_DRAFT: DraftScheme = { name: "", method: "PERCENT", value: "" };

/* ── SchemeRow ───────────────────────────────────────────────────────────── */
function SchemeRowItem({
  scheme,
  onUpdated,
  onDeleted,
}: {
  scheme: DiscountScheme;
  onUpdated: (updated: DiscountScheme) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(scheme.name);
  const [method, setMethod] = useState<DiscountMethod>(scheme.method);
  const [value, setValue] = useState(String(scheme.value));
  const [active, setActive] = useState(scheme.active);
  const [saving, setSaving] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const dirty = name !== scheme.name || method !== scheme.method || value !== String(scheme.value);

  const save = async () => {
    const numeric = Number(value);
    const validation = validateScheme(name, method, numeric);
    if (validation) { setErr(validation); return; }
    setSaving(true);
    setErr(null);
    setSavedMsg(null);
    try {
      const updated = await api.updateDiscountScheme(scheme.id, { name: name.trim(), method, value: numeric });
      onUpdated(updated);
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save scheme.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (next: boolean) => {
    setActive(next);
    setRetiring(true);
    setErr(null);
    try {
      const updated = await api.updateDiscountScheme(scheme.id, { active: next });
      onUpdated(updated);
    } catch (e) {
      setActive(!next);
      setErr(e instanceof ApiError ? e.message : "Could not update scheme.");
    } finally {
      setRetiring(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await api.deleteDiscountScheme(scheme.id);
      onDeleted(scheme.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not delete scheme.");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-ink-100 dark:border-white/10 pb-4 last:border-0 last:pb-0">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Name */}
        <input
          aria-label="Scheme name"
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); setSavedMsg(null); }}
          placeholder="e.g. Staff ward discount"
          className="h-9 flex-1 min-w-[140px] rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400"
        />

        {/* Method toggle */}
        <select
          aria-label="Discount method"
          value={method}
          onChange={(e) => { setMethod(e.target.value as DiscountMethod); setErr(null); setSavedMsg(null); }}
          className={cls}
        >
          <option value="PERCENT">%</option>
          <option value="FIXED">Fixed</option>
        </select>

        {/* Value */}
        <input
          aria-label="Scheme value"
          type="number"
          min="0"
          step={method === "PERCENT" ? "1" : "0.01"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(null); setSavedMsg(null); }}
          placeholder={method === "PERCENT" ? "1–100" : "amount (₦)"}
          className="h-9 w-28 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />

        {/* Active toggle */}
        <label className="flex items-center gap-1.5 text-small text-ink-500 dark:text-ink-400 cursor-pointer select-none">
          <Switch checked={active} onCheckedChange={toggleActive} disabled={retiring} aria-label="Active" />
          {active ? "Active" : "Retired"}
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
            disabled={deleting}
            aria-label="Delete scheme"
          >
            {deleting ? "…" : "✕"}
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {err && <p className="text-caption text-error pl-0.5">{err}</p>}
      {savedMsg && <p className="text-caption text-success pl-0.5">{savedMsg}</p>}
    </div>
  );
}

/* ── AddSchemeForm ───────────────────────────────────────────────────────── */
function AddSchemeForm({ onCreated }: { onCreated: (s: DiscountScheme) => void }) {
  const [draft, setDraft] = useState<DraftScheme>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const patch = (update: Partial<DraftScheme>) => {
    setDraft((d) => ({ ...d, ...update }));
    setErr(null);
  };

  const submit = async () => {
    const numeric = Number(draft.value);
    const validation = validateScheme(draft.name, draft.method, numeric);
    if (validation) { setErr(validation); return; }
    setAdding(true);
    setErr(null);
    try {
      const created = await api.createDiscountScheme({ name: draft.name.trim(), method: draft.method, value: numeric });
      onCreated(created);
      setDraft(EMPTY_DRAFT);
      nameRef.current?.focus();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add scheme.");
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void submit();
  };

  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-small font-semibold text-ink-700 dark:text-ink-300">Add scheme</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={nameRef}
          aria-label="New scheme name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Scholarship"
          className="h-9 flex-1 min-w-[140px] rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400"
        />
        <select
          aria-label="New scheme method"
          value={draft.method}
          onChange={(e) => patch({ method: e.target.value as DiscountMethod })}
          className={cls}
        >
          <option value="PERCENT">%</option>
          <option value="FIXED">Fixed</option>
        </select>
        <input
          aria-label="New scheme value"
          type="number"
          min="0"
          step={draft.method === "PERCENT" ? "1" : "0.01"}
          value={draft.value}
          onChange={(e) => patch({ value: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={draft.method === "PERCENT" ? "1–100" : "amount (₦)"}
          className="h-9 w-28 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
        />
        <Button onClick={submit} disabled={adding || !draft.name.trim() || !draft.value}>
          {adding ? "Adding…" : "Add scheme"}
        </Button>
      </div>
      {err && <p className="text-caption text-error">{err}</p>}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DiscountsSettingsPage() {
  const [schemes, setSchemes] = useState<DiscountScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await api.listDiscountSchemes();
      setSchemes(data);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load discount schemes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpdated = (updated: DiscountScheme) => {
    setSchemes((prev) => prev.map((s) => (s.id === updated.id ? { ...updated } : s)));
  };

  const handleDeleted = (id: string) => {
    setSchemes((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCreated = (created: DiscountScheme) => {
    setSchemes((prev) => [...prev, created]);
  };

  return (
    <PageContainer className="max-w-2xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Settings
      </Link>

      <PageHeader
        title="Discount schemes"
        description="Define reusable discount and scholarship schemes to assign to students."
      />

      <Card>
        <CardHeader>
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Schemes</span>
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
              {schemes.length === 0 ? (
                <p className="text-small text-ink-500 py-4 text-center">
                  No discount schemes yet. Add your first scheme below.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {schemes.map((s) => (
                    <SchemeRowItem
                      key={s.id}
                      scheme={s}
                      onUpdated={handleUpdated}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </div>
              )}

              <div className="border-t border-ink-100 dark:border-white/10 pt-4 mt-2">
                <AddSchemeForm onCreated={handleCreated} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <p className="mt-4 text-caption text-ink-400 dark:text-ink-500">
        Percent schemes apply 1–100% of the invoice gross; fixed schemes deduct a flat naira amount.
        Retiring a scheme (turning it off) stops it from applying to future invoice generation, but keeps existing
        assignments and past invoice breakdowns intact.
      </p>
    </PageContainer>
  );
}
