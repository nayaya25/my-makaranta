"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Input, Spinner } from "@mymakaranta/ui";
import { api, type ParentInvoice } from "@/lib/api";
import { session } from "@/lib/auth";
import { formatMoney } from "@/lib/money";

type Tone = "success" | "warning" | "error" | "neutral";

const STATUS_TONE: Record<ParentInvoice["status"], Tone> = {
  OVERDUE: "error",
  PARTIAL: "warning",
  PAID: "success",
  UNPAID: "neutral",
};

interface PayState {
  open: boolean;
  amount: string;
  email: string;
  busy: boolean;
  reference: string | null;
  receiptCode: string | null;
  error: string | null;
}

function freshPayState(invoice: ParentInvoice, defaultEmail: string): PayState {
  return {
    open: false,
    amount: String(invoice.balanceKobo / 100),
    email: defaultEmail,
    busy: false,
    reference: null,
    receiptCode: null,
    error: null,
  };
}

export default function ParentPortalPage() {
  const [invoices, setInvoices] = useState<ParentInvoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<Record<string, PayState>>({});

  const defaultEmail =
    (session.user() as { email?: string } | null)?.email ?? "";

  function load() {
    setLoading(true);
    setError(null);
    api
      .getParentInvoices()
      .then((data) => {
        setInvoices(data);
        setPay((prev) => {
          const next: Record<string, PayState> = {};
          for (const inv of data) {
            // preserve any in-flight state (reference/receipt) for the same invoice
            const existing = prev[inv.invoiceId];
            next[inv.invoiceId] = existing
              ? { ...existing, amount: String(inv.balanceKobo / 100) }
              : freshPayState(inv, defaultEmail);
          }
          return next;
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load fees"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(id: string, p: Partial<PayState>) {
    setPay((prev) => {
      const base = prev[id] ?? freshPayState({ balanceKobo: 0 } as ParentInvoice, defaultEmail);
      return { ...prev, [id]: { ...base, ...p } };
    });
  }

  async function handlePay(inv: ParentInvoice) {
    const st = pay[inv.invoiceId];
    if (!st) return;
    const amountKobo = Math.round(Number(st.amount) * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      patch(inv.invoiceId, { error: "Enter a valid amount" });
      return;
    }
    if (!st.email) {
      patch(inv.invoiceId, { error: "Enter an email for the receipt" });
      return;
    }
    patch(inv.invoiceId, { busy: true, error: null });
    try {
      const { reference, authorizationUrl } = await api.parentPay(inv.invoiceId, amountKobo, st.email);
      patch(inv.invoiceId, { busy: false, reference });
      window.open(authorizationUrl, "_blank");
    } catch (e) {
      patch(inv.invoiceId, { busy: false, error: e instanceof Error ? e.message : "Payment failed to start" });
    }
  }

  async function handleVerify(inv: ParentInvoice) {
    const st = pay[inv.invoiceId];
    if (!st?.reference) return;
    patch(inv.invoiceId, { busy: true, error: null });
    try {
      const res = await api.parentPayVerify(st.reference);
      if (res.applied) {
        patch(inv.invoiceId, { busy: false, receiptCode: res.receiptCode ?? null, reference: null });
        load();
      } else {
        patch(inv.invoiceId, { busy: false, error: `Payment ${res.status.toLowerCase()} — not yet confirmed` });
      }
    } catch (e) {
      patch(inv.invoiceId, { busy: false, error: e instanceof Error ? e.message : "Could not confirm payment" });
    }
  }

  const grouped = (() => {
    const map = new Map<string, ParentInvoice[]>();
    for (const inv of invoices ?? []) {
      const list = map.get(inv.studentName) ?? [];
      list.push(inv);
      map.set(inv.studentName, list);
    }
    return [...map.entries()];
  })();

  const hasOutstanding = (invoices ?? []).some((i) => i.balanceKobo > 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Fees</h1>
        <p className="text-small text-ink-500">Your children&apos;s invoices and balances. Pay in one tap.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : grouped.length === 0 || !hasOutstanding ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No outstanding fees 🎉</p>
          <p className="text-small text-ink-500 mt-1">Everything is paid up. Thank you.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([studentName, list]) => (
            <section key={studentName} className="flex flex-col gap-3">
              <h2 className="text-small font-semibold text-ink-700 dark:text-ink-300">{studentName}</h2>
              {list.map((inv) => {
                const st = pay[inv.invoiceId];
                const paid = inv.balanceKobo <= 0;
                return (
                  <div
                    key={inv.invoiceId}
                    className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{inv.termLabel}</p>
                        <p className="text-caption text-ink-500 tabular-nums">
                          {formatMoney(inv.paidKobo, "NGN")} paid of {formatMoney(inv.totalKobo, "NGN")}
                          {inv.dueDate ? ` · due ${new Date(inv.dueDate).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-small text-ink-500">Balance</span>
                      <span
                        className={`text-body font-semibold tabular-nums ${
                          paid ? "text-success" : "text-ink-1000 dark:text-ink-100"
                        }`}
                      >
                        {formatMoney(inv.balanceKobo, "NGN")}
                      </span>
                    </div>

                    {!paid && st && (
                      <div className="mt-3 border-t border-ink-100 dark:border-white/10 pt-3">
                        {st.receiptCode ? (
                          <a
                            href={`/receipt/${st.receiptCode}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex"
                          >
                            <Button variant="secondary" size="sm">
                              View receipt
                            </Button>
                          </a>
                        ) : st.reference ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-caption text-ink-500">
                              Complete the payment in the new tab, then confirm here.
                            </p>
                            <Button size="sm" onClick={() => handleVerify(inv)} disabled={st.busy}>
                              {st.busy ? <Spinner size="sm" /> : "I've paid — confirm"}
                            </Button>
                          </div>
                        ) : st.open ? (
                          <div className="flex flex-col gap-2">
                            <label className="text-caption text-ink-500" htmlFor={`amt-${inv.invoiceId}`}>
                              Amount (₦)
                            </label>
                            <Input
                              id={`amt-${inv.invoiceId}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              value={st.amount}
                              onChange={(e) => patch(inv.invoiceId, { amount: e.target.value })}
                            />
                            {!defaultEmail && (
                              <Input
                                type="email"
                                placeholder="Email for receipt"
                                value={st.email}
                                onChange={(e) => patch(inv.invoiceId, { email: e.target.value })}
                              />
                            )}
                            <Button size="sm" onClick={() => handlePay(inv)} disabled={st.busy}>
                              {st.busy ? <Spinner size="sm" /> : "Pay now"}
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => patch(inv.invoiceId, { open: true })}>
                            Pay
                          </Button>
                        )}
                        {st.error && <p className="mt-2 text-caption text-error">{st.error}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
