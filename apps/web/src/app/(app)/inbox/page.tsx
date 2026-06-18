"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@mymakaranta/ui";
import { api, type ParentAnnouncement } from "@/lib/api";

export default function InboxPage() {
  const [items, setItems] = useState<ParentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.getMyAnnouncements().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function open(a: ParentAnnouncement) {
    setOpenId(a.announcementId === openId ? null : a.announcementId);
    if (!a.readAt) {
      try {
        await api.markMyAnnouncementRead(a.announcementId);
        setItems((prev) => prev.map((x) => (x.announcementId === a.announcementId ? { ...x, readAt: new Date().toISOString() } : x)));
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Inbox</h1>
        <p className="text-small text-ink-500">Announcements from your school.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No announcements yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((a) => (
            <button
              key={a.announcementId}
              onClick={() => open(a)}
              className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                {!a.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
              </div>
              <p className="text-caption text-ink-300 mt-0.5">{new Date(a.sentAt).toLocaleString()}</p>
              {openId === a.announcementId && <p className="text-small text-ink-700 dark:text-ink-300 mt-2 whitespace-pre-wrap">{a.body}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
