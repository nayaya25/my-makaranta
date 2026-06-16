"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@mymakaranta/ui";
import { api, type PublicReceipt } from "@/lib/api";
import { formatMoney } from "@/lib/money";

export default function ReceiptPage() {
  const params = useParams<{ code: string }>();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .getPublicReceipt(params.code)
      .then(setReceipt)
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [params.code]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper dark:bg-paper-dark p-6 print:p-0 print:bg-white">
      <div className="w-full max-w-md print:max-w-full">
        {loading ? (
          <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 text-center">
            <p className="text-small text-ink-500">Loading receipt…</p>
          </div>
        ) : !receipt ? (
          <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 text-center">
            <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-1">Receipt not found</h1>
            <p className="text-small text-ink-500">This receipt code does not match any payment.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-end print:hidden">
              <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            </div>
            <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 print:border-0 print:rounded-none">
              <header className="text-center mb-4">
                <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">{receipt.school}</h1>
                <p className="text-small text-ink-500">Payment Receipt</p>
                <p className="text-caption text-ink-500 font-mono mt-1">{receipt.receiptNo}</p>
              </header>

              <dl className="grid grid-cols-3 gap-y-2 text-small">
                <dt className="text-ink-500">Student</dt>
                <dd className="col-span-2 text-ink-1000 dark:text-ink-100">{receipt.student}</dd>
                <dt className="text-ink-500">Term</dt>
                <dd className="col-span-2 text-ink-1000 dark:text-ink-100">{receipt.term}</dd>
                <dt className="text-ink-500">Channel</dt>
                <dd className="col-span-2 text-ink-1000 dark:text-ink-100">{receipt.channel}</dd>
                <dt className="text-ink-500">Paid</dt>
                <dd className="col-span-2 text-ink-1000 dark:text-ink-100">{new Date(receipt.paidAt).toLocaleString()}</dd>
              </dl>

              <div className="mt-4 border-t border-ink-100 dark:border-white/10 pt-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-small font-medium">
                  <span className="text-ink-500">Amount paid</span>
                  <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(receipt.amountKobo, "NGN")}</span>
                </div>
                <div className="flex items-center justify-between text-small">
                  <span className="text-ink-500">Balance after</span>
                  <span className={`tabular-nums ${receipt.balanceAfterKobo > 0 ? "text-error" : "text-success"}`}>
                    {formatMoney(receipt.balanceAfterKobo, "NGN")}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
