"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, Input, PageContainer, PageHeader, Spinner, Textarea } from "@mymakaranta/ui";
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
  const [whatsapp, setWhatsapp] = useState(false);
  const [toParents, setToParents] = useState(true);
  const [toStaff, setToStaff] = useState(false);
  const [sendLater, setSendLater] = useState("");
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
    let scheduledFor: string | undefined;
    if (sendLater) {
      const d = new Date(sendLater);
      if (Number.isNaN(d.getTime())) { setError("Invalid send-later date/time."); return; }
      if (d.getTime() <= Date.now()) { setError("Send-later time must be in the future."); return; }
      scheduledFor = d.toISOString();
    }
    setBusy(true);
    try {
      const channels: ("SMS" | "EMAIL" | "WHATSAPP")[] = [];
      if (sms) channels.push("SMS");
      if (email) channels.push("EMAIL");
      if (whatsapp) channels.push("WHATSAPP");
      const r = await api.createAnnouncement({ title: title.trim(), body: body.trim(), audienceType, audienceIds: audienceType === "ALL" ? [] : audienceIds, channels, roles, ...(scheduledFor ? { scheduledFor } : {}) });
      setMsg(
        scheduledFor
          ? `Scheduled for ${r.recipientCount} parent${r.recipientCount === 1 ? "" : "s"}.`
          : `Sent to ${r.recipientCount} parent${r.recipientCount === 1 ? "" : "s"}.`,
      );
      setTitle(""); setBody(""); setAudienceIds([]); setSendLater("");
      loadSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Announcements" description="Broadcast a message to parents and staff over SMS, email, or WhatsApp." />

      <Card>
        <CardBody className="flex flex-col gap-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={audienceType}
              onChange={(e) => { setAudienceType(e.target.value as Audience); setAudienceIds([]); }}
              className="rounded-[10px] border border-ink-300 bg-surface px-3 py-2 text-small text-ink-1000 dark:border-white/15 dark:bg-surface-dark dark:text-ink-100"
            >
              <option value="ALL">Everyone</option>
              <option value="LEVEL">By class level</option>
              <option value="CLASS">By class</option>
            </select>
            <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
            <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
            <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> WhatsApp</label>
            <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toParents} onChange={(e) => setToParents(e.target.checked)} /> Parents</label>
            <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toStaff} onChange={(e) => setToStaff(e.target.checked)} /> Staff</label>
          </div>
          {whatsapp && (
            <p className="text-caption text-ink-500">Requires WhatsApp provider setup + approved template.</p>
          )}
          {audienceType !== "ALL" && (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleId(o.id)}
                  className={`rounded-full border px-3 py-1 text-caption font-medium transition-colors ${audienceIds.includes(o.id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 text-ink-700 hover:bg-ink-1000/[0.03] dark:border-white/15 dark:text-ink-300"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1 text-small text-ink-700 dark:text-ink-300">
            <span>Send later (optional)</span>
            <input
              type="datetime-local"
              value={sendLater}
              onChange={(e) => setSendLater(e.target.value)}
              className="h-9 w-64 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 tabular-nums"
              aria-label="Send later date and time"
            />
            <span className="text-caption text-ink-500">Leave blank to send immediately.</span>
          </label>
          {error && <p className="text-caption text-error">{error}</p>}
          {msg && <p className="text-caption text-success">{msg}</p>}
          <div>
            <Button onClick={send} disabled={busy}>
              {busy ? <Spinner size="sm" /> : sendLater ? "Schedule announcement" : "Send announcement"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <h2 className="mb-3 mt-8 text-caption font-semibold uppercase tracking-wide text-ink-500">Sent</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : sent.length === 0 ? (
        <p className="text-small text-ink-500">No announcements yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sent.map((a) => (
            <Link key={a.id} href={`/announcements/${a.id}`} className="group">
              <Card interactive elevation="xs">
                <CardBody className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                      <Badge tone={a.status === "SCHEDULED" ? "info" : "success"}>
                        {a.status === "SCHEDULED" ? "Scheduled" : "Sent"}
                      </Badge>
                    </div>
                    <span className="shrink-0 text-caption tabular-nums text-ink-500">{a.readCount}/{a.recipientCount} read</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-small text-ink-500">{a.body}</p>
                  <p className="mt-1.5 text-caption text-ink-500/80">
                    {a.audienceType.toLowerCase()} ·{" "}
                    {a.status === "SCHEDULED" && a.scheduledFor
                      ? `scheduled for ${new Date(a.scheduledFor).toLocaleString()}`
                      : new Date(a.sentAt).toLocaleString()}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
