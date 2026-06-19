"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Card, PageContainer, Spinner } from "@mymakaranta/ui";
import { api, type AnnouncementReceipts } from "@/lib/api";

export default function AnnouncementReceiptsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AnnouncementReceipts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAnnouncementReceipts(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
  }, [id]);

  return (
    <PageContainer className="max-w-3xl">
      <Link
        href="/announcements"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        ← Announcements
      </Link>
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : error || !data ? (
        <div className="mt-4 rounded-[14px] border border-error/40 bg-error/10 p-4 text-small text-error">{error ?? "Not found."}</div>
      ) : (
        <>
          <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">{data.title}</h1>
          <p className="mt-2 whitespace-pre-wrap text-small leading-relaxed text-ink-700 dark:text-ink-300">{data.body}</p>
          <p className="mt-2 text-caption text-ink-500">{new Date(data.sentAt).toLocaleString()} · {data.channels.join(" + ")}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-small text-ink-700 dark:text-ink-300">
            <span><strong className="tabular-nums">{data.aggregates.readCount}</strong>/{data.aggregates.total} read</span>
            <span className="tabular-nums">{data.aggregates.smsCount} SMS</span>
            <span className="tabular-nums">{data.aggregates.emailCount} email</span>
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                    <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Recipient</th>
                    <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Type</th>
                    <th className="px-4 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">SMS</th>
                    <th className="px-4 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">Email</th>
                    <th className="px-4 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recipients.map((r) => (
                    <tr key={`${r.recipientType}-${r.recipientId}`} className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]">
                      <td className="px-4 py-2.5 font-medium text-ink-1000 dark:text-ink-100">{r.name}</td>
                      <td className="px-4 py-2.5"><Badge tone={r.recipientType === "STAFF" ? "info" : "neutral"}>{r.recipientType}</Badge></td>
                      <td className="px-4 py-2.5 text-center text-ink-700 dark:text-ink-300">{r.smsSent ? "✓" : "—"}</td>
                      <td className="px-4 py-2.5 text-center text-ink-700 dark:text-ink-300">{r.emailSent ? "✓" : "—"}</td>
                      <td className="px-4 py-2.5 text-center text-ink-700 dark:text-ink-300">{r.readAt ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
