"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, type PermissionCatalog, type Staff } from "@/lib/api";

export default function StaffPermissionsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listStaff(), api.getPermissionsCatalog()])
      .then(([s, c]) => { setStaff(s); setCatalog(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function pick(id: string) {
    setSelected(id); setMsg(null);
    if (!id) { setKeys(new Set()); return; }
    const r = await api.getStaffPermissions(id).catch(() => ({ keys: [] as string[] }));
    setKeys(new Set(r.keys));
  }

  function toggle(key: string) {
    setKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function applyPreset(role: string) {
    if (catalog) setKeys(new Set(catalog.presets[role] ?? []));
  }

  async function save() {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.setStaffPermissions(selected, [...keys]);
      setKeys(new Set(r.keys));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">Staff permissions</h1>

      <select value={selected} onChange={(e) => pick(e.target.value)} className="mb-4 w-full rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100">
        <option value="">Select a staff member…</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.staffNo}</option>)}
      </select>

      {selected && catalog && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.keys(catalog.presets).map((role) => (
              <button key={role} type="button" onClick={() => applyPreset(role)} className="rounded-input border border-ink-200 dark:border-white/10 px-2.5 py-1 text-caption text-ink-700 dark:text-ink-300">
                {role.replace(/_/g, " ").toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4">
            {catalog.catalog.map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-small text-ink-700 dark:text-ink-300">
                <input type="checkbox" checked={keys.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5" />
                <span><span className="font-medium text-ink-1000 dark:text-ink-100">{p.key}</span> — {p.description}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={busy}>{busy ? <Spinner size="sm" /> : "Save"}</Button>
            {msg && <span className="text-small text-ink-500">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
