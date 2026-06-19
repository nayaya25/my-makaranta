"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, PageContainer, PageHeader, Spinner } from "@mymakaranta/ui";
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
    <PageContainer className="max-w-2xl">
      <PageHeader title="Inbox" description="Announcements from your school." />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No announcements yet</p>
          <p className="mt-1 text-small text-ink-500">New messages from your school will appear here.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((a) => (
            <button key={a.announcementId} onClick={() => open(a)} className="text-left">
              <Card interactive elevation="xs">
                <CardBody className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                    {!a.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
                  </div>
                  <p className="mt-0.5 text-caption text-ink-500/80">{new Date(a.sentAt).toLocaleString()}</p>
                  {openId === a.announcementId && (
                    <p className="mt-2.5 whitespace-pre-wrap text-small leading-relaxed text-ink-700 dark:text-ink-300">{a.body}</p>
                  )}
                </CardBody>
              </Card>
            </button>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
