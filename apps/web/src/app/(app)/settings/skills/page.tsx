"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type SkillDomain, type SkillScalePoint } from "@/lib/api";

export default function SkillsConfigPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Skills config"
        description="Manage affective and psychomotor skill domains, items, and the rating scale."
      />
      <div className="flex flex-col gap-6">
        <DomainsPanel />
        <ScalePanel />
      </div>
    </PageContainer>
  );
}

/* ── Domains & Items ─────────────────────────────────────────────────────── */

function DomainsPanel() {
  const [domains, setDomains] = useState<SkillDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDomainName, setNewDomainName] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSkillConfig();
      setDomains(data.domains);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load skill domains.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addDomain = async () => {
    const name = newDomainName.trim();
    if (!name) return;
    setAdding(true);
    setMsg(null);
    try {
      const domain = await api.createSkillDomain({ name, order: domains.length });
      setDomains((prev) => [...prev, { ...domain, items: [] }]);
      setNewDomainName("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not add domain.");
    } finally {
      setAdding(false);
    }
  };

  const renameDomain = async (id: string, name: string) => {
    setMsg(null);
    try {
      const updated = await api.updateSkillDomain(id, { name });
      setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, name: updated.name } : d)));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not rename domain.");
    }
  };

  const deleteDomain = async (id: string) => {
    setMsg(null);
    try {
      await api.deleteSkillDomain(id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not delete domain.");
    }
  };

  const addItem = async (domainId: string, name: string) => {
    setMsg(null);
    const domain = domains.find((d) => d.id === domainId);
    const order = domain ? domain.items.length : 0;
    try {
      const item = await api.createSkillItem({ domainId, name, order });
      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? { ...d, items: [...d.items, item] } : d)),
      );
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not add item.");
    }
  };

  const renameItem = async (domainId: string, itemId: string, name: string) => {
    setMsg(null);
    try {
      const updated = await api.updateSkillItem(itemId, { name });
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId
            ? { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, name: updated.name } : it)) }
            : d,
        ),
      );
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not rename item.");
    }
  };

  const deleteItem = async (domainId: string, itemId: string) => {
    setMsg(null);
    try {
      await api.deleteSkillItem(itemId);
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId ? { ...d, items: d.items.filter((it) => it.id !== itemId) } : d,
        ),
      );
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not delete item.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Domains &amp; Items</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-small text-error">{error}</p>
        ) : domains.length === 0 ? (
          <p className="text-small text-ink-500">No skill domains yet. Add one below.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {domains.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                onRename={renameDomain}
                onDelete={deleteDomain}
                onAddItem={addItem}
                onRenameItem={renameItem}
                onDeleteItem={deleteItem}
              />
            ))}
          </div>
        )}

        {/* Add domain */}
        <div className="mt-4 flex items-center gap-2">
          <input
            aria-label="new domain name"
            value={newDomainName}
            onChange={(e) => setNewDomainName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addDomain();
            }}
            placeholder="New domain name…"
            className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
          />
          <Button onClick={() => void addDomain()} disabled={adding || !newDomainName.trim()}>
            Add domain
          </Button>
        </div>
        {msg && <p className="mt-2 text-caption text-error">{msg}</p>}
      </CardBody>
    </Card>
  );
}

interface DomainRowProps {
  domain: SkillDomain;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddItem: (domainId: string, name: string) => Promise<void>;
  onRenameItem: (domainId: string, itemId: string, name: string) => Promise<void>;
  onDeleteItem: (domainId: string, itemId: string) => Promise<void>;
}

function DomainRow({ domain, onRename, onDelete, onAddItem, onRenameItem, onDeleteItem }: DomainRowProps) {
  const [editName, setEditName] = useState(domain.name);
  const [newItemName, setNewItemName] = useState("");

  useEffect(() => { setEditName(domain.name); }, [domain.name]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== domain.name) void onRename(domain.id, trimmed);
  };

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    void onAddItem(domain.id, name).then(() => setNewItemName(""));
  };

  return (
    <div className="rounded-lg border border-ink-100 dark:border-white/10 p-3">
      {/* Domain header */}
      <div className="flex items-center gap-2 mb-3">
        <input
          aria-label="domain name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
          }}
          className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small font-medium"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onDelete(domain.id)}
          aria-label={`delete domain ${domain.name}`}
        >
          ✕
        </Button>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5 pl-3">
        {domain.items.length === 0 && (
          <p className="text-caption text-ink-400">No items yet.</p>
        )}
        {domain.items.map((item) => (
          <ItemRow
            key={item.id}
            domainId={domain.id}
            item={item}
            onRename={onRenameItem}
            onDelete={onDeleteItem}
          />
        ))}
        {/* Add item row */}
        <div className="flex items-center gap-2 mt-1">
          <input
            aria-label="new item name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddItem();
            }}
            placeholder="New item…"
            className="h-8 flex-1 rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-2 text-caption"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddItem}
            disabled={!newItemName.trim()}
          >
            + Add
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ItemRowProps {
  domainId: string;
  item: { id: string; name: string; order: number };
  onRename: (domainId: string, itemId: string, name: string) => Promise<void>;
  onDelete: (domainId: string, itemId: string) => Promise<void>;
}

function ItemRow({ domainId, item, onRename, onDelete }: ItemRowProps) {
  const [editName, setEditName] = useState(item.name);

  useEffect(() => { setEditName(item.name); }, [item.name]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== item.name) void onRename(domainId, item.id, trimmed);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="item name"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={handleRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRename();
        }}
        className="h-8 flex-1 rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-2 text-caption"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onDelete(domainId, item.id)}
        aria-label={`delete item ${item.name}`}
      >
        ✕
      </Button>
    </div>
  );
}

/* ── Scale labels ────────────────────────────────────────────────────────── */

function ScalePanel() {
  const [points, setPoints] = useState<Array<{ value: number; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSkillScale();
      setPoints(data.map((p: SkillScalePoint) => ({ value: p.value, label: p.label })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load scale.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (i: number, patch: Partial<{ value: number; label: string }>) =>
    setPoints((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const removePoint = (i: number) => setPoints((prev) => prev.filter((_, idx) => idx !== i));

  const addPoint = () =>
    setPoints((prev) => [...prev, { value: prev.length + 1, label: "" }]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.setSkillScale(points);
      setPoints(updated.map((p: SkillScalePoint) => ({ value: p.value, label: p.label })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Rating scale labels</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-small text-error">{error}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {points.length === 0 && (
              <p className="text-small text-ink-500">No scale points yet. Add rows to define the rating scale.</p>
            )}
            {points.map((p, i) => (
              <div key={p.value} className="flex items-center gap-2">
                <input
                  aria-label="scale value"
                  type="number"
                  value={p.value}
                  onChange={(e) => update(i, { value: Number(e.target.value) })}
                  className="h-9 w-20 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="scale label"
                  value={p.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="e.g. Excellent"
                  className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <Button variant="ghost" size="sm" onClick={() => removePoint(i)} aria-label="remove">
                  ✕
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addPoint} className="self-start mt-1">
              + Add point
            </Button>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving || points.length === 0}>
            Save scale
          </Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
