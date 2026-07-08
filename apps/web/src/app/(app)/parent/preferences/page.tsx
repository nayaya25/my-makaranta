"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, Switch } from "@mymakaranta/ui";
import { api, ApiError, type NotificationPreference } from "@/lib/api";

const CHANNEL_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: "FEE_REMINDER", label: "Fee reminders", hint: "Upcoming or overdue invoice reminders." },
  { value: "RESULTS_READY", label: "Results ready", hint: "Alerts when a class's results are released." },
  { value: "ANNOUNCEMENT", label: "Announcements", hint: "School-wide or class announcements." },
];

export default function ParentNotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<NotificationPreference | null>(null);
  const [mutedChannels, setMutedChannels] = useState<string[]>([]);
  const [mutedCategories, setMutedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await api.getMyNotificationPreferences();
      setPrefs(data);
      setMutedChannels(data.mutedChannels);
      setMutedCategories(data.mutedCategories);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load your notification preferences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    !!prefs &&
    (mutedChannels.length !== prefs.mutedChannels.length ||
      mutedChannels.some((c) => !prefs.mutedChannels.includes(c)) ||
      mutedCategories.length !== prefs.mutedCategories.length ||
      mutedCategories.some((c) => !prefs.mutedCategories.includes(c)));

  function toggleChannel(value: string, receive: boolean) {
    setMutedChannels((prev) => (receive ? prev.filter((c) => c !== value) : [...new Set([...prev, value])]));
    setSaveErr(null);
    setSavedMsg(null);
  }

  function toggleCategory(value: string, receive: boolean) {
    setMutedCategories((prev) => (receive ? prev.filter((c) => c !== value) : [...new Set([...prev, value])]));
    setSaveErr(null);
    setSavedMsg(null);
  }

  async function save() {
    setSaving(true);
    setSaveErr(null);
    setSavedMsg(null);
    try {
      const updated = await api.setMyNotificationPreferences({ mutedChannels, mutedCategories });
      setPrefs(updated);
      setMutedChannels(updated.mutedChannels);
      setMutedCategories(updated.mutedCategories);
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : "Could not save your preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="Notification preferences"
        description="Choose how and when the school can reach you. Turn a toggle off to stop receiving that type of message."
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : loadErr ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-small text-error">{loadErr}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Channels */}
          <Card>
            <CardHeader>
              <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Channels</span>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {CHANNEL_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer select-none items-center justify-between gap-3">
                  <span>
                    <span className="block text-small font-medium text-ink-1000 dark:text-ink-100">{opt.label}</span>
                    {opt.hint && <span className="block text-caption text-ink-500">{opt.hint}</span>}
                  </span>
                  <Switch
                    checked={!mutedChannels.includes(opt.value)}
                    onCheckedChange={(v) => toggleChannel(opt.value, v)}
                    aria-label={`Receive notifications by ${opt.label}`}
                  />
                </label>
              ))}
            </CardBody>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader>
              <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Message types</span>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {CATEGORY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer select-none items-center justify-between gap-3">
                  <span>
                    <span className="block text-small font-medium text-ink-1000 dark:text-ink-100">{opt.label}</span>
                    {opt.hint && <span className="block text-caption text-ink-500">{opt.hint}</span>}
                  </span>
                  <Switch
                    checked={!mutedCategories.includes(opt.value)}
                    onCheckedChange={(v) => toggleCategory(opt.value, v)}
                    aria-label={`Receive ${opt.label}`}
                  />
                </label>
              ))}
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
