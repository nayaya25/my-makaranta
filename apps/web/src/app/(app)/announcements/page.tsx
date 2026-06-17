"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Spinner } from "@mymakaranta/ui";
import { api, type SentAnnouncement } from "@/lib/api";

type Audience = "ALL" | "LEVEL" | "CLASS";
interface Opt { id: string; label: string; }

export default function AnnouncementsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<Audience>("ALL");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(false);
  const [toParents, setToParents] = useState(true);
  const [toStaff, setToStaff] = useState(false);
  const [levels, setLevels] = useState<Opt[]>([]);
  const [classes, setClasses] = useState<Opt[]>([]);
  const [sent, setSent] = useState<SentAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function loadSent() {
    api.listAnnouncements().then(setSent).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => {
    loadSent();
    api.listClassLevels().then((ls) => setLevels(ls.map((l) => ({ id: l.id, label: l.name })))).catch(() => {});
    api.listClasses().then((cs) => setClasses(cs.map((c) => ({ id: c.id, label: c.name })))).catch(() => {});
  }, []);

  const options = audienceType === "LEVEL" ? levels : audienceType === "CLASS" ? classes : [];

  function toggleId(id: string) {
    setAudienceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send() {
    setError(null); setMsg(null);
    if (!title.trim() || !body.trim()) { setError("Title and message are required."); return; }
    if (audienceType !== "ALL" && audienceIds.length === 0) { setError("Pick at least one target."); return; }
    const roles: ("PARENT" | "STAFF")[] = [];
    if (toParents) roles.push("PARENT");
    if (toStaff) roles.push("STAFF");
    if (roles.length === 0) { setError("Pick at least one recipient group."); return; }
    setBusy(true);
    try {
      const channels: ("SMS" | "EMAIL")[] = [];
      if (sms) channels.push("SMS");
      if (email) channels.push("EMAIL");
      const r = await api.createAnnouncement({ title: title.trim(), body: body.trim(), audienceType, audienceIds: audienceType === "ALL" ? [] : audienceIds, channels, roles });
      setMsg(`Sent to ${r.recipientCount} parent${r.recipientCount === 1 ? "" : "s"}.`);
      setTitle(""); setBody(""); setAudienceIds([]);
      loadSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">Announcements</h1>

      <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 flex flex-col gap-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select value={audienceType} onChange={(e) => { setAudienceType(e.target.value as Audience); setAudienceIds([]); }} className="rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100">
            <option value="ALL">Everyone</option>
            <option value="LEVEL">By class level</option>
            <option value="CLASS">By class</option>
          </select>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toParents} onChange={(e) => setToParents(e.target.checked)} /> Parents</label>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toStaff} onChange={(e) => setToStaff(e.target.checked)} /> Staff</label>
        </div>
        {audienceType !== "ALL" && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => toggleId(o.id)} className={`rounded-input border px-2.5 py-1 text-caption ${audienceIds.includes(o.id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 dark:border-white/10 text-ink-700 dark:text-ink-300"}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-caption text-error">{error}</p>}
        {msg && <p className="text-caption text-success">{msg}</p>}
        <div><Button onClick={send} disabled={busy}>{busy ? <Spinner size="sm" /> : "Send announcement"}</Button></div>
      </div>

      <h2 className="text-small font-semibold text-ink-700 dark:text-ink-300 mt-8 mb-3">Sent</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : sent.length === 0 ? (
        <p className="text-small text-ink-500">No announcements yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sent.map((a) => (
            <Link key={a.id} href={`/announcements/${a.id}`} className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                <span className="text-caption text-ink-500 tabular-nums">{a.readCount}/{a.recipientCount} read</span>
              </div>
              <p className="text-small text-ink-500 line-clamp-2">{a.body}</p>
              <p className="text-caption text-ink-300 mt-1">{a.audienceType.toLowerCase()} · {new Date(a.sentAt).toLocaleString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
