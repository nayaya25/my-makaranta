"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Dialog,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@mymakaranta/ui";
import { Wallet } from "lucide-react";
import {
  api,
  ApiError,
  type InstallmentStatus,
  type ParentInvoice,
  type ParentInvoiceDetail,
  type ParentReceipt,
} from "@/lib/api";
import { session } from "@/lib/auth";
import { formatMoney } from "@/lib/money";

type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
type Tone = "success" | "warning" | "error" | "neutral";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  OVERDUE: "error",
  PARTIAL: "warning",
  PAID: "success",
  UNPAID: "neutral",
};
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  OVERDUE: "Overdue",
  PARTIAL: "Partial",
  PAID: "Paid",
  UNPAID: "Unpaid",
};

const INSTALLMENT_STATUS_TONE: Record<InstallmentStatus, Tone> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "neutral",
  OVERDUE: "error",
};
const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  PAID: "Paid",
  PARTIAL: "Partial",
  DUE: "Due",
  OVERDUE: "Overdue",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

type PayPreset = "installment" | "balance" | "custom";

export default function ParentFeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [invoices, setInvoices] = useState<ParentInvoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipts, setReceipts] = useState<ParentReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);

  const [activeChild, setActiveChild] = useState<string | null>(null);

  // Invoice detail dialog
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParentInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Pay dialog
  const [payOpen, setPayOpen] = useState(false);
  const [preset, setPreset] = useState<PayPreset>("installment");
  const [customAmount, setCustomAmount] = useState("");
  const [email, setEmail] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  // Statement download
  const [downloadingStudentId, setDownloadingStudentId] = useState<string | null>(null);

  const defaultEmail = (session.user() as { email?: string } | null)?.email ?? "";

  const loadInvoices = useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .getParentInvoices()
      .then((data) => {
        setInvoices(data);
        setActiveChild((prev) => {
          if (prev && data.some((i) => i.studentId === prev)) return prev;
          return data[0]?.studentId ?? null;
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load fees"))
      .finally(() => setLoading(false));
  }, []);

  const loadReceipts = useCallback(() => {
    setReceiptsLoading(true);
    return api
      .getParentReceipts()
      .then(setReceipts)
      .catch(() => setReceipts([]))
      .finally(() => setReceiptsLoading(false));
  }, []);

  useEffect(() => {
    void loadInvoices();
    void loadReceipts();
  }, [loadInvoices, loadReceipts]);

  const openDetail = useCallback((invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setPayOpen(false);
    setPendingReference(null);
    setVerifyMsg(null);
    api
      .getParentInvoiceDetail(invoiceId)
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "Could not load the invoice."))
      .finally(() => setDetailLoading(false));
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedInvoiceId(null);
    setDetail(null);
    setDetailError(null);
    setPayOpen(false);
    setPendingReference(null);
    setVerifyMsg(null);
  }, []);

  const refreshDetail = useCallback(async (invoiceId: string) => {
    try {
      setDetail(await api.getParentInvoiceDetail(invoiceId));
    } catch {
      /* keep current detail */
    }
    await loadInvoices();
  }, [loadInvoices]);

  // Detect a Paystack return (?reference=...) on mount and verify it.
  useEffect(() => {
    const reference = searchParams.get("reference");
    if (!reference) return;
    setVerifying(true);
    api
      .parentPayVerify(reference)
      .then((res) => {
        if (res.applied) {
          setVerifyMsg(res.receiptCode ? `Payment confirmed. Receipt ${res.receiptCode}.` : "Payment confirmed.");
        } else {
          setVerifyMsg(`Payment ${res.status.toLowerCase()} — not yet confirmed.`);
        }
        return loadInvoices().then(() => loadReceipts());
      })
      .catch((e) => setVerifyMsg(e instanceof Error ? e.message : "Could not confirm payment."))
      .finally(() => {
        setVerifying(false);
        // Strip the reference param so a refresh doesn't re-verify.
        router.replace("/parent/fees");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPayDialog() {
    if (!detail) return;
    setPreset(detail.installments.some((i) => i.status !== "PAID") ? "installment" : "balance");
    setCustomAmount(String(detail.balanceKobo / 100));
    setEmail(defaultEmail);
    setPayError(null);
    setPayOpen(true);
  }

  const nextInstallmentKobo = useMemo(() => {
    if (!detail) return 0;
    const inv = invoices?.find((i) => i.invoiceId === detail.invoiceId);
    if (inv) return inv.nextInstallmentKobo;
    const next = detail.installments.find((i) => i.status !== "PAID");
    return next ? next.amountKobo - next.paidKobo : detail.balanceKobo;
  }, [detail, invoices]);

  const presetAmountKobo = useMemo(() => {
    if (!detail) return 0;
    if (preset === "installment") return nextInstallmentKobo;
    if (preset === "balance") return detail.balanceKobo;
    return Math.round(Number(customAmount) * 100);
  }, [detail, preset, nextInstallmentKobo, customAmount]);

  async function handlePay() {
    if (!detail) return;
    const amountKobo = presetAmountKobo;
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      setPayError("Enter a valid amount.");
      return;
    }
    if (amountKobo > detail.balanceKobo) {
      setPayError("Amount cannot exceed the balance.");
      return;
    }
    if (!email) {
      setPayError("Enter an email for the receipt.");
      return;
    }
    setPayBusy(true);
    setPayError(null);
    try {
      const { authorizationUrl } = await api.parentPay(detail.invoiceId, amountKobo, email);
      window.location.href = authorizationUrl;
    } catch (e) {
      setPayBusy(false);
      setPayError(e instanceof ApiError ? e.message : "Could not start the payment.");
    }
  }

  async function handleDownloadStatement(studentId: string) {
    setDownloadingStudentId(studentId);
    try {
      await api.downloadParentStatementPdf(studentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the statement.");
    } finally {
      setDownloadingStudentId(null);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { studentName: string; invoices: ParentInvoice[] }>();
    for (const inv of invoices ?? []) {
      const entry = map.get(inv.studentId) ?? { studentName: inv.studentName, invoices: [] };
      entry.invoices.push(inv);
      map.set(inv.studentId, entry);
    }
    return [...map.entries()].map(([studentId, v]) => ({ studentId, ...v }));
  }, [invoices]);

  const activeGroup = grouped.find((g) => g.studentId === activeChild) ?? grouped[0] ?? null;
  const activeReceipts = receipts.filter(
    (r) => !activeGroup || r.childName === activeGroup.studentName,
  );

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Fees" description="Invoices, installments, receipts, and statements for your children." />

      {verifying && (
        <div className="mb-5 flex items-center gap-2 rounded-[12px] border border-ink-1000/10 bg-surface px-4 py-2.5 text-small text-ink-500 dark:border-white/10 dark:bg-surface-dark">
          <Spinner size="sm" /> Confirming your payment…
        </div>
      )}
      {!verifying && verifyMsg && (
        <div className="mb-5 rounded-[12px] border border-success/30 bg-success/10 px-4 py-2.5 text-small font-medium text-success">
          {verifyMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-[14px] border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Wallet size={26} />}
          title="No children linked"
          description="Once a child is linked to your account, their invoices will appear here."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Child selector */}
          {grouped.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {grouped.map((g) => (
                <button
                  key={g.studentId}
                  onClick={() => setActiveChild(g.studentId)}
                  className={`rounded-pill border px-3.5 py-1.5 text-small font-medium transition-colors ${
                    activeChild === g.studentId
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "border-ink-1000/10 text-ink-500 hover:text-ink-1000 dark:border-white/10 dark:hover:text-ink-100"
                  }`}
                >
                  {g.studentName}
                </button>
              ))}
            </div>
          )}

          {activeGroup && (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-caption font-semibold uppercase tracking-wide text-ink-500">
                  {activeGroup.studentName}
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadStatement(activeGroup.studentId)}
                  disabled={downloadingStudentId === activeGroup.studentId}
                >
                  {downloadingStudentId === activeGroup.studentId ? "Preparing…" : "Download statement"}
                </Button>
              </div>

              {activeGroup.invoices.length === 0 ? (
                <Card className="p-10 text-center">
                  <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No invoices yet</p>
                  <p className="mt-1 text-small text-ink-500">Invoices for this child will show up here.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {activeGroup.invoices.map((inv) => {
                    const overdue = inv.status === "OVERDUE";
                    return (
                      <button key={inv.invoiceId} onClick={() => openDetail(inv.invoiceId)} className="text-left">
                        <Card
                          interactive
                          elevation="xs"
                          className={overdue ? "border-error/40" : undefined}
                        >
                          <CardBody>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{inv.termLabel}</p>
                                <p className="text-caption text-ink-500 tabular-nums">
                                  {formatMoney(inv.paidKobo, "NGN")} paid of {formatMoney(inv.totalKobo, "NGN")}
                                  {inv.nextDueDate ? ` · next due ${formatDate(inv.nextDueDate)}` : ""}
                                </p>
                              </div>
                              <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-small text-ink-500">Balance</span>
                              <span
                                className={`text-body font-semibold tabular-nums ${
                                  inv.balanceKobo <= 0 ? "text-success" : overdue ? "text-error" : "text-ink-1000 dark:text-ink-100"
                                }`}
                              >
                                {formatMoney(inv.balanceKobo, "NGN")}
                              </span>
                            </div>
                          </CardBody>
                        </Card>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Receipts */}
              <div className="mt-2 flex flex-col gap-3">
                <h2 className="text-caption font-semibold uppercase tracking-wide text-ink-500">Receipts</h2>
                {receiptsLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : activeReceipts.length === 0 ? (
                  <p className="text-small text-ink-500">No receipts yet.</p>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="divide-y divide-ink-1000/[0.06] dark:divide-white/[0.06]">
                      {activeReceipts.map((r, i) => (
                        <a
                          key={i}
                          href={r.receiptCode ? `/receipt/${r.receiptCode}` : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center justify-between gap-3 px-4 py-3 text-small ${
                            r.receiptCode ? "hover:bg-ink-1000/[0.02] dark:hover:bg-white/[0.03]" : "pointer-events-none opacity-60"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-ink-1000 dark:text-ink-100">{r.termLabel}</p>
                            <p className="text-caption text-ink-500">{formatDate(r.paidAt)}</p>
                          </div>
                          <span className="tabular-nums font-medium text-ink-1000 dark:text-ink-100">
                            {formatMoney(r.amountKobo, "NGN")}
                          </span>
                        </a>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Invoice detail dialog */}
      <Dialog.Root open={!!selectedInvoiceId} onOpenChange={(open) => !open && closeDetail()}>
        <Dialog.Content className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="flex justify-center py-10">
              {detailError ? <p className="text-small text-error">{detailError}</p> : <Spinner size="lg" />}
            </div>
          ) : (
            <>
              <Dialog.Header>
                <Dialog.Title>{detail.termLabel}</Dialog.Title>
                <Dialog.Description>
                  {detail.student.name} · {detail.student.admissionNo}
                </Dialog.Description>
              </Dialog.Header>

              <div className="flex flex-col gap-1.5">
                {detail.lines.length === 0 ? (
                  <p className="text-small text-ink-500">No fee items on this invoice.</p>
                ) : (
                  detail.lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-small">
                      <span className="text-ink-700 dark:text-ink-300">{l.name}</span>
                      <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(l.amountKobo, "NGN")}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 flex flex-col gap-1.5 border-t border-ink-100 pt-3 dark:border-white/10">
                <div className="flex items-center justify-between text-small">
                  <span className="text-ink-500">Gross</span>
                  <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(detail.grossKobo, "NGN")}</span>
                </div>
                {detail.discounts.length > 0 && (
                  <>
                    {detail.discounts.map((d, i) => (
                      <div key={i} className="flex items-center justify-between pl-3 text-small">
                        <span className="text-ink-500">− {d.name}</span>
                        <span className="tabular-nums text-success">−{formatMoney(d.amountKobo, "NGN")}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-small">
                      <span className="text-ink-500">Total discount</span>
                      <span className="tabular-nums text-success">−{formatMoney(detail.discountKobo, "NGN")}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-small font-medium">
                  <span className="text-ink-500">Net total</span>
                  <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(detail.totalKobo, "NGN")}</span>
                </div>
                <div className="flex items-center justify-between text-small">
                  <span className="text-ink-500">Paid</span>
                  <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(detail.paidKobo, "NGN")}</span>
                </div>
                <div className="flex items-center justify-between text-small font-medium">
                  <span className="text-ink-500">Balance</span>
                  <span className={`tabular-nums ${detail.balanceKobo > 0 ? "text-error" : "text-success"}`}>
                    {formatMoney(detail.balanceKobo, "NGN")}
                  </span>
                </div>
              </div>

              {detail.installments.length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-3 dark:border-white/10">
                  <h3 className="mb-2 text-small font-medium text-ink-1000 dark:text-ink-100">Installments</h3>
                  <div className="flex flex-col gap-2">
                    {detail.installments.map((inst) => (
                      <div
                        key={inst.order}
                        className={`flex items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-small ${
                          inst.status === "OVERDUE"
                            ? "border-error/30 bg-error/5"
                            : "border-ink-100 dark:border-white/10"
                        }`}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-ink-1000 dark:text-ink-100">
                            {inst.label || `Installment ${inst.order + 1}`}
                          </span>
                          <span className="text-caption text-ink-500">
                            Due {formatDate(inst.dueDate)} · Paid {formatMoney(inst.paidKobo, "NGN")}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(inst.amountKobo, "NGN")}</span>
                          <Badge tone={INSTALLMENT_STATUS_TONE[inst.status]}>{INSTALLMENT_STATUS_LABEL[inst.status]}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.payments.length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-3 dark:border-white/10">
                  <h3 className="mb-2 text-small font-medium text-ink-1000 dark:text-ink-100">Payment history</h3>
                  <div className="flex flex-col gap-1.5">
                    {detail.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-small">
                        <div className="min-w-0">
                          <span className="text-ink-700 dark:text-ink-300">{formatDate(p.paidAt)}</span>
                          <span className="text-ink-500"> · {p.channel}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(p.amountKobo, "NGN")}</span>
                          {p.receiptCode && (
                            <a href={`/receipt/${p.receiptCode}`} target="_blank" rel="noreferrer" className="text-caption font-medium text-brand-600 underline dark:text-brand-300">
                              Receipt
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.balanceKobo > 0 && !payOpen && (
                <div className="mt-5 border-t border-ink-100 pt-4 dark:border-white/10">
                  <Button onClick={openPayDialog}>Pay</Button>
                </div>
              )}

              {payOpen && (
                <div className="mt-5 border-t border-ink-100 pt-4 dark:border-white/10">
                  <h3 className="mb-3 text-small font-medium text-ink-1000 dark:text-ink-100">Pay</h3>
                  <RadioGroup value={preset} onValueChange={(v) => setPreset(v as PayPreset)} className="mb-3">
                    {nextInstallmentKobo > 0 && nextInstallmentKobo < detail.balanceKobo && (
                      <label className="flex items-center gap-2.5 text-small text-ink-700 dark:text-ink-300">
                        <RadioGroupItem value="installment" id="preset-installment" />
                        Next installment ({formatMoney(nextInstallmentKobo, "NGN")})
                      </label>
                    )}
                    <label className="flex items-center gap-2.5 text-small text-ink-700 dark:text-ink-300">
                      <RadioGroupItem value="balance" id="preset-balance" />
                      Full balance ({formatMoney(detail.balanceKobo, "NGN")})
                    </label>
                    <label className="flex items-center gap-2.5 text-small text-ink-700 dark:text-ink-300">
                      <RadioGroupItem value="custom" id="preset-custom" />
                      Custom amount
                    </label>
                  </RadioGroup>

                  {preset === "custom" && (
                    <div className="mb-3">
                      <label className="mb-1 block text-caption text-ink-500" htmlFor="custom-amount">
                        Amount (₦)
                      </label>
                      <Input
                        id="custom-amount"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={detail.balanceKobo / 100}
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="mb-1 block text-caption text-ink-500" htmlFor="pay-email">
                      Email (for receipt)
                    </label>
                    <Input id="pay-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>

                  {payError && <p className="mb-3 text-caption text-error">{payError}</p>}

                  <div className="flex gap-2">
                    <Button onClick={handlePay} disabled={payBusy}>
                      {payBusy ? <Spinner size="sm" /> : `Pay ${formatMoney(Math.max(presetAmountKobo, 0), "NGN")}`}
                    </Button>
                    <Button variant="ghost" onClick={() => setPayOpen(false)} disabled={payBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {pendingReference && (
                <p className="mt-3 text-caption text-ink-500">
                  Complete the payment in the Paystack window, then return here — we&apos;ll confirm automatically.
                </p>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </PageContainer>
  );
}
