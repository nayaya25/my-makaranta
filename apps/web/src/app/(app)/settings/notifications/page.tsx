"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, Checkbox, PageContainer, PageHeader, Spinner, Switch } from "@mymakaranta/ui";
import { api, ApiError, type NotificationSettings } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

/* ── Validation ──────────────────────────────────────────────────────────── */
const MIN_OFFSET = -30;
const MAX_OFFSET = 30;

function validateOffset(raw: string): string | null {
  if (raw.trim() === "") return "Enter a number of days.";
  const n = Number(raw);
  if (!Number.isInteger(n)) return "Offset must be a whole number.";
  if (n < MIN_OFFSET || n > MAX_OFFSET) return `Offset must be between ${MIN_OFFSET} and ${MAX_OFFSET}.`;
  return null;
}

const CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
];

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [feeRemindersEnabled, setFeeRemindersEnabled] = useState(true);
  const [resultsReadyEnabled, setResultsReadyEnabled] = useState(true);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [newOffset, setNewOffset] = useState("");
  const [offsetErr, setOffsetErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const offsetInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await api.getNotificationSettings();
      setSettings(data);
      setFeeRemindersEnabled(data.feeRemindersEnabled);
      setResultsReadyEnabled(data.resultsReadyEnabled);
      setOffsets([...data.reminderOffsetDays].sort((a, b) => a - b));
      setChannels(data.channels);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load notification settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty =
    !!settings &&
    (feeRemindersEnabled !== settings.feeRemindersEnabled ||
      resultsReadyEnabled !== settings.resultsReadyEnabled ||
      channels.length !== settings.channels.length ||
      channels.some((c) => !settings.channels.includes(c)) ||
      offsets.length !== settings.reminderOffsetDays.length ||
      offsets.some((o) => !settings.reminderOffsetDays.includes(o)));

  const toggleChannel = (value: string, checked: boolean) => {
    setChannels((prev) => (checked ? [...new Set([...prev, value])] : prev.filter((c) => c !== value)));
    setSaveErr(null);
    setSavedMsg(null);
  };

  const addOffset = () => {
    const validation = validateOffset(newOffset);
    if (validation) { setOffsetErr(validation); return; }
    const n = Number(newOffset);
    if (offsets.includes(n)) { setOffsetErr("That offset is already in the list."); return; }
    setOffsets((prev) => [...prev, n].sort((a, b) => a - b));
    setNewOffset("");
    setOffsetErr(null);
    setSaveErr(null);
    setSavedMsg(null);
    offsetInputRef.current?.focus();
  };

  const removeOffset = (n: number) => {
    setOffsets((prev) => prev.filter((o) => o !== n));
    setSaveErr(null);
    setSavedMsg(null);
  };

  const handleOffsetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addOffset(); }
  };

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    setSavedMsg(null);
    try {
      const updated = await api.updateNotificationSettings({
        feeRemindersEnabled,
        resultsReadyEnabled,
        reminderOffsetDays: offsets,
        channels,
      });
      setSettings(updated);
      setOffsets([...updated.reminderOffsetDays].sort((a, b) => a - b));
      setChannels(updated.channels);
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : "Could not save notification settings.");
    } finally {
      setSaving(false);
    }
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
        title="Notifications"
        description="Automate fee reminders and results-ready alerts to parents over SMS and email."
      />

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
          {/* Toggles */}
          <Card>
            <CardHeader>
              <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Automated alerts</span>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <span>
                  <span className="block text-small font-medium text-ink-1000 dark:text-ink-100">Fee reminders</span>
                  <span className="block text-caption text-ink-500">
                    Remind parents of upcoming or overdue installments on the offset days below.
                  </span>
                </span>
                <Switch
                  checked={feeRemindersEnabled}
                  onCheckedChange={(v) => { setFeeRemindersEnabled(v); setSaveErr(null); setSavedMsg(null); }}
                  aria-label="Enable fee reminders"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <span>
                  <span className="block text-small font-medium text-ink-1000 dark:text-ink-100">Results ready</span>
                  <span className="block text-caption text-ink-500">
                    Notify parents automatically when a class&apos;s results are released.
                  </span>
                </span>
                <Switch
                  checked={resultsReadyEnabled}
                  onCheckedChange={(v) => { setResultsReadyEnabled(v); setSaveErr(null); setSavedMsg(null); }}
                  aria-label="Enable results-ready alerts"
                />
              </label>
            </CardBody>
          </Card>

          {/* Offsets */}
          <Card>
            <CardHeader>
              <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Fee reminder days</span>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <p className="text-caption text-ink-500">
                Negative = before due date, positive = after due date. E.g. −3 reminds 3 days before, 3 reminds 3 days after.
              </p>

              {offsets.length === 0 ? (
                <p className="text-small text-ink-500 py-2">No reminder days set.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {offsets.map((o) => (
                    <span
                      key={o}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 dark:border-white/15 px-3 py-1 text-small font-medium tabular-nums text-ink-700 dark:text-ink-300"
                    >
                      {o > 0 ? `+${o}` : o}
                      <button
                        type="button"
                        onClick={() => removeOffset(o)}
                        aria-label={`Remove offset ${o}`}
                        className="text-ink-400 transition-colors hover:text-error"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  ref={offsetInputRef}
                  aria-label="New reminder offset (days)"
                  type="number"
                  step="1"
                  min={MIN_OFFSET}
                  max={MAX_OFFSET}
                  value={newOffset}
                  onChange={(e) => { setNewOffset(e.target.value); setOffsetErr(null); }}
                  onKeyDown={handleOffsetKeyDown}
                  placeholder="e.g. -3"
                  className="h-9 w-28 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100 placeholder:text-ink-400 tabular-nums"
                />
                <Button size="sm" onClick={addOffset} disabled={!newOffset.trim()}>
                  Add day
                </Button>
              </div>
              {offsetErr && <p className="text-caption text-error">{offsetErr}</p>}
            </CardBody>
          </Card>

          {/* Channels */}
          <Card>
            <CardHeader>
              <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Channels</span>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-4">
                {CHANNEL_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none text-small text-ink-700 dark:text-ink-300">
                    <Checkbox
                      checked={channels.includes(opt.value)}
                      onCheckedChange={(v) => toggleChannel(opt.value, v === true)}
                      aria-label={opt.label}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {saveErr && <p className="text-caption text-error">{saveErr}</p>}
            {savedMsg && <p className="text-caption text-success">{savedMsg}</p>}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
