"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Spinner } from "@mymakaranta/ui";
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/announcements" className="text-small text-brand-500">← Announcements</Link>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error || !data ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error ?? "Not found."}</div>
      ) : (
        <>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mt-3">{data.title}</h1>
          <p className="text-small text-ink-700 dark:text-ink-300 mt-1 whitespace-pre-wrap">{data.body}</p>
          <p className="text-caption text-ink-500 mt-2">{new Date(data.sentAt).toLocaleString()} · {data.channels.join(" + ")}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-small text-ink-700 dark:text-ink-300">
            <span><strong className="tabular-nums">{data.aggregates.readCount}</strong>/{data.aggregates.total} read</span>
            <span className="tabular-nums">{data.aggregates.smsCount} SMS</span>
            <span className="tabular-nums">{data.aggregates.emailCount} email</span>
          </div>

          <div className="mt-6 overflow-x-auto rounded-card border border-ink-100 dark:border-white/10">
            <table className="w-full text-small">
              <thead className="bg-surface dark:bg-surface-dark text-ink-500">
                <tr>
                  <th className="py-2 px-3 text-left font-medium">Recipient</th>
                  <th className="py-2 px-3 text-left font-medium">Type</th>
                  <th className="py-2 px-3 text-center font-medium">SMS</th>
                  <th className="py-2 px-3 text-center font-medium">Email</th>
                  <th className="py-2 px-3 text-center font-medium">Read</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map((r) => (
                  <tr key={`${r.recipientType}-${r.recipientId}`} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-2 px-3 text-ink-1000 dark:text-ink-100">{r.name}</td>
                    <td className="py-2 px-3"><Badge tone={r.recipientType === "STAFF" ? "info" : "neutral"}>{r.recipientType}</Badge></td>
                    <td className="py-2 px-3 text-center">{r.smsSent ? "✓" : "—"}</td>
                    <td className="py-2 px-3 text-center">{r.emailSent ? "✓" : "—"}</td>
                    <td className="py-2 px-3 text-center">{r.readAt ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
