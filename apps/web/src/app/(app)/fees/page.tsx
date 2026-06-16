"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, EmptyState, Badge } from "@mymakaranta/ui";
import { api, ApiError, type AcademicYear, type CollectionRow, type InvoiceDetail, type BankRow, type ProposedMatch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { Wallet } from "lucide-react";

const CONFIDENCE_TONE = { high: "success", low: "warning", none: "neutral" } as const;

interface TermOpt { id: string; label: string; isCurrent: boolean; }

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

const STATUS_TONE = {
  OVERDUE: "error",
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "neutral",
} as const;
const STATUS_LABEL = { OVERDUE: "Overdue", PAID: "Paid", PARTIAL: "Partial", UNPAID: "Unpaid" } as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FeesPage() {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [currency, setCurrency] = useState("NGN");

  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Collections controls
  const [dueDateInput, setDueDateInput] = useState("");
  const [settingDueDate, setSettingDueDate] = useState(false);
  const [remindingAll, setRemindingAll] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Record payment form
  const [channel, setChannel] = useState<"CASH" | "BANK_TRANSFER">("CASH");
  const [amountNaira, setAmountNaira] = useState("");
  const [reference, setReference] = useState("");
  const [recording, setRecording] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [receiptCode, setReceiptCode] = useState<string | null>(null);

  // Online payment
  const [email, setEmail] = useState("");
  const [onlineRef, setOnlineRef] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Bank-statement reconciliation
  const reconcileFileRef = useRef<HTMLInputElement>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ProposedMatch[] | null>(null);
  // per-row overrides keyed by reference: selected invoiceId ("" = skip) + naira amount
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reconcileResult, setReconcileResult] = useState<{ recorded: number; skipped: number; errors: Array<{ reference: string; message: string }> } | null>(null);

  const handleReconcileFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReconcileError(null);
    setMatches(null);
    setReconcileResult(null);
    setParsing(true);
    try {
      const Papa = (await import("papaparse")).default;
      const parsed = await new Promise<{ data: Record<string, string>[]; fields: string[] }>((resolve, reject) => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => resolve({ data: res.data, fields: res.meta.fields ?? [] }),
          error: (err) => reject(new Error(err.message)),
        });
      });
      const find = (re: RegExp) => parsed.fields.find((f) => re.test(f));
      const amtCol = find(/amount|credit|deposit/i);
      const narrCol = find(/narration|description|details|particulars/i);
      const refCol = find(/reference|ref|teller/i);
      const dateCol = find(/date/i);
      if (!amtCol || !narrCol) {
        setReconcileError("Couldn't find an amount/description column.");
        return;
      }
      const rows: BankRow[] = parsed.data
        .map((row, i) => {
          const amountKobo = Math.round(parseFloat(String(row[amtCol]).replace(/[^0-9.]/g, "")) * 100);
          return {
            reference: String(row[refCol!] ?? "").trim() || `ROW-${i + 1}`,
            amountKobo,
            narration: String(row[narrCol] ?? ""),
            ...(dateCol ? { date: String(row[dateCol] ?? "").trim() || undefined } : {}),
          };
        })
        .filter((r) => !Number.isNaN(r.amountKobo) && r.amountKobo > 0);
      if (rows.length === 0) {
        setReconcileError("No valid rows with a positive amount were found.");
        return;
      }
      await proposeReconcile(rows);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : "Could not parse the file.");
    } finally {
      setParsing(false);
      if (reconcileFileRef.current) reconcileFileRef.current.value = "";
    }
  };

  const proposeReconcile = async (rows: BankRow[]) => {
    if (!termId) return;
    setProposing(true);
    setReconcileError(null);
    try {
      const res = await api.proposeMatches(termId, rows);
      setMatches(res);
      const sel: Record<string, string> = {};
      const amt: Record<string, string> = {};
      for (const m of res) {
        sel[m.row.reference] = m.suggestedInvoiceId ?? "";
        amt[m.row.reference] = String(m.row.amountKobo / 100);
      }
      setSelections(sel);
      setAmounts(amt);
    } catch (e) {
      setReconcileError(e instanceof ApiError ? e.message : "Could not propose matches.");
    } finally {
      setProposing(false);
    }
  };

  const confirmReconcile = async () => {
    if (!matches) return;
    const confirmations = matches
      .filter((m) => selections[m.row.reference])
      .map((m) => ({
        reference: m.row.reference,
        amountKobo: Math.round(Number(amounts[m.row.reference] ?? m.row.amountKobo / 100) * 100),
        invoiceId: selections[m.row.reference] ?? "",
      }))
      .filter((c) => c.invoiceId && c.amountKobo > 0);
    if (confirmations.length === 0) {
      setReconcileError("Select at least one match to confirm.");
      return;
    }
    setConfirming(true);
    setReconcileError(null);
    setReconcileResult(null);
    try {
      const res = await api.confirmMatches(confirmations);
      setReconcileResult(res);
      setMatches(null);
      await loadInvoices();
    } catch (e) {
      setReconcileError(e instanceof ApiError ? e.message : "Could not confirm reconciliation.");
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const yrs: AcademicYear[] = await api.listAcademicYears();
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
      try {
        const school = await api.getMySchool();
        if (school.currency) setCurrency(school.currency);
      } catch {
        /* default NGN */
      }
    })();
  }, []);

  const loadInvoices = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await api.getCollections(termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load collections.");
    } finally {
      setLoading(false);
    }
  }, [termId]);
  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  const setDueDate = async () => {
    if (!termId || !dueDateInput) return;
    setSettingDueDate(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.setDueDate(termId, new Date(dueDateInput).toISOString());
      setMsg(`Due date set on ${res.updated} invoice(s).`);
      await loadInvoices();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not set the due date.");
    } finally {
      setSettingDueDate(false);
    }
  };

  const remindAll = async () => {
    if (!termId) return;
    if (!window.confirm("Send reminders to all overdue invoices in this term?")) return;
    setRemindingAll(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.remindAllOverdue(termId);
      setMsg(`${res.remindersSent} reminders, ${res.totalRecipients} recipients`);
      await loadInvoices();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send reminders.");
    } finally {
      setRemindingAll(false);
    }
  };

  const remindOne = async (invoiceId: string) => {
    setRemindingId(invoiceId);
    setError(null);
    setMsg(null);
    try {
      const res = await api.remindInvoice(invoiceId);
      setMsg(`Reminded ${res.recipientCount} recipient(s)`);
      await loadInvoices();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the reminder.");
    } finally {
      setRemindingId(null);
    }
  };

  const generate = async () => {
    if (!termId) return;
    if (!window.confirm("Generate invoices for all enrolled students in this term?")) return;
    setGenerating(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.generateInvoices(termId);
      setMsg(`Created ${res.created} · Refreshed ${res.refreshed} · Skipped ${res.skipped}`);
      await loadInvoices();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate invoices.");
    } finally {
      setGenerating(false);
    }
  };

  const resetPayForm = () => {
    setChannel("CASH");
    setAmountNaira("");
    setReference("");
    setPayError(null);
    setReceiptCode(null);
    setEmail("");
    setOnlineRef(null);
  };

  const openDetail = async (studentId: string) => {
    setDetail(null);
    setSelectedStudentId(studentId);
    setDetailLoading(true);
    resetPayForm();
    try {
      setDetail(await api.getInvoiceDetail(studentId, termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the invoice.");
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetail = () => { setDetail(null); setDetailLoading(false); setSelectedStudentId(null); resetPayForm(); };

  const reloadDetail = async () => {
    if (!selectedStudentId) return;
    try {
      setDetail(await api.getInvoiceDetail(selectedStudentId, termId));
    } catch {
      /* keep current detail */
    }
    await loadInvoices();
  };

  const recordPayment = async () => {
    if (!detail) return;
    const kobo = Math.round(Number(amountNaira) * 100);
    if (!kobo || kobo <= 0) { setPayError("Enter a valid amount."); return; }
    setRecording(true);
    setPayError(null);
    setReceiptCode(null);
    try {
      const res = await api.recordPayment(detail.id, kobo, channel, reference || undefined);
      setReceiptCode(res.receiptCode);
      setAmountNaira("");
      setReference("");
      await reloadDetail();
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "Could not record the payment.");
    } finally {
      setRecording(false);
    }
  };

  const payOnline = async () => {
    if (!detail) return;
    const kobo = Math.round(Number(amountNaira) * 100);
    if (!kobo || kobo <= 0) { setPayError("Enter a valid amount."); return; }
    if (!email) { setPayError("Enter an email for the online payment."); return; }
    setInitializing(true);
    setPayError(null);
    setReceiptCode(null);
    try {
      const res = await api.initializeOnline(detail.id, kobo, email);
      setOnlineRef(res.reference);
      window.open(res.authorizationUrl, "_blank");
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "Could not start the online payment.");
    } finally {
      setInitializing(false);
    }
  };

  const verifyOnline = async () => {
    if (!onlineRef) return;
    setVerifying(true);
    setPayError(null);
    try {
      const res = await api.verifyPayment(onlineRef);
      if (res.applied) {
        if (res.receiptCode) setReceiptCode(res.receiptCode);
        setOnlineRef(null);
        setAmountNaira("");
        await reloadDetail();
      } else {
        setPayError(`Payment not applied yet (status: ${res.status}).`);
      }
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "Could not verify the payment.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="px-4 py-8 mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Fees</h1>
        <p className="text-small text-ink-500">Generate invoices and track balances by student.</p>
      </div>

      <div className="mb-6 flex items-end gap-3 flex-wrap">
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <Button onClick={generate} disabled={!termId || generating}>
          {generating ? "Generating…" : "Generate invoices"}
        </Button>
        {msg && <span className="text-caption text-success">{msg}</span>}
      </div>

      <div className="mb-6 flex items-end gap-3 flex-wrap">
        <label className="text-small text-ink-500 flex flex-col gap-1">Due date
          <input type="date" value={dueDateInput} onChange={(e) => setDueDateInput(e.target.value)} className={cls} />
        </label>
        <Button variant="secondary" onClick={setDueDate} disabled={!termId || !dueDateInput || settingDueDate}>
          {settingDueDate ? "Setting…" : "Set"}
        </Button>
        <Button variant="secondary" onClick={remindAll} disabled={!termId || remindingAll}>
          {remindingAll ? "Reminding…" : "Remind all overdue"}
        </Button>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="No invoices"
          description="No invoices for this term yet. Generate invoices to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small border-collapse">
            <thead><tr className="text-left text-ink-500">
              <th className="py-2 pr-3 font-medium">Student</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium">Due date</th>
              <th className="py-2 px-3 font-medium text-right">Total</th>
              <th className="py-2 px-3 font-medium text-right">Paid</th>
              <th className="py-2 px-3 font-medium text-right">Balance</th>
              <th className="py-2 px-3 font-medium">Last reminded</th>
              <th className="py-2 pl-3 font-medium text-right">Remind</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.invoiceId}
                  className="border-t border-ink-100 dark:border-white/10 cursor-pointer hover:bg-ink-100/50 dark:hover:bg-white/5"
                  onClick={() => openDetail(r.studentId)}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{r.name}</td>
                  <td className="py-1.5 px-3"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                  <td className="py-1.5 px-3 whitespace-nowrap text-ink-700 dark:text-ink-300">{formatDate(r.dueDate)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{formatMoney(r.totalKobo, currency)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{formatMoney(r.paidKobo, currency)}</td>
                  <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${r.balanceKobo > 0 ? "text-error" : "text-success"}`}>
                    {formatMoney(r.balanceKobo, currency)}
                  </td>
                  <td className="py-1.5 px-3 whitespace-nowrap text-ink-700 dark:text-ink-300">{formatDate(r.lastRemindedAt)}</td>
                  <td className="py-1.5 pl-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {r.balanceKobo > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => remindOne(r.invoiceId)} disabled={remindingId === r.invoiceId}>
                        {remindingId === r.invoiceId ? "Reminding…" : "Remind"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bank-statement reconciliation */}
      <div className="mt-10 border-t border-ink-100 dark:border-white/10 pt-6">
        <button
          type="button"
          onClick={() => setReconcileOpen((o) => !o)}
          className="flex items-center gap-2 text-small font-medium text-ink-1000 dark:text-ink-100"
        >
          <span className="text-brand-500">{reconcileOpen ? "▾" : "▸"}</span>
          Reconcile bank statement
        </button>

        {reconcileOpen && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-caption text-ink-500">
              Upload a bank-statement CSV to match credit transfers against outstanding invoices, review the matches, then confirm to record payments.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={reconcileFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleReconcileFile}
                disabled={!termId || parsing || proposing}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => reconcileFileRef.current?.click()}
                disabled={!termId || parsing || proposing}
              >
                {parsing ? "Parsing…" : proposing ? "Matching…" : "Upload CSV"}
              </Button>
              {(parsing || proposing) && <Spinner size="sm" />}
            </div>

            {reconcileError && <p className="text-caption text-error">{reconcileError}</p>}

            {reconcileResult && (
              <div className="rounded-card border border-ink-100 dark:border-white/10 bg-paper dark:bg-surface-dark p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="success">{reconcileResult.recorded} recorded</Badge>
                  {reconcileResult.skipped > 0 && <Badge tone="neutral">{reconcileResult.skipped} skipped</Badge>}
                  {reconcileResult.errors.length > 0 && <Badge tone="error">{reconcileResult.errors.length} errors</Badge>}
                </div>
                {reconcileResult.errors.length > 0 && (
                  <ul className="text-caption text-error list-disc pl-5">
                    {reconcileResult.errors.map((e, i) => (
                      <li key={i}><span className="font-medium">{e.reference}</span>: {e.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {matches && matches.length === 0 && (
              <p className="text-caption text-ink-500">No transfer rows to reconcile.</p>
            )}

            {matches && matches.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-small border-collapse">
                    <thead><tr className="text-left text-ink-500">
                      <th className="py-2 pr-3 font-medium">Narration</th>
                      <th className="py-2 px-3 font-medium text-right">Amount</th>
                      <th className="py-2 px-3 font-medium">Reference</th>
                      <th className="py-2 px-3 font-medium">Match</th>
                      <th className="py-2 pl-3 font-medium text-right">Apply (₦)</th>
                    </tr></thead>
                    <tbody>
                      {matches.map((m) => {
                        const ref = m.row.reference;
                        const selected = m.candidates.find((c) => c.invoiceId === selections[ref]);
                        return (
                          <tr key={ref} className="border-t border-ink-100 dark:border-white/10 align-top">
                            <td className="py-2 pr-3 text-ink-1000 dark:text-ink-100 max-w-[16rem] truncate" title={m.row.narration}>{m.row.narration || "—"}</td>
                            <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-ink-700 dark:text-ink-300">{formatMoney(m.row.amountKobo, currency)}</td>
                            <td className="py-2 px-3 whitespace-nowrap text-ink-700 dark:text-ink-300">{ref}</td>
                            <td className="py-2 px-3">
                              <div className="flex flex-col gap-1">
                                <select
                                  value={selections[ref] ?? ""}
                                  onChange={(e) => setSelections((s) => ({ ...s, [ref]: e.target.value }))}
                                  className={cls}
                                >
                                  <option value="">— Skip —</option>
                                  {m.candidates.map((c) => (
                                    <option key={c.invoiceId} value={c.invoiceId}>
                                      {c.studentName} ({c.admissionNo}) · {formatMoney(c.balanceKobo, currency)}
                                    </option>
                                  ))}
                                </select>
                                {selected && (
                                  <Badge tone={CONFIDENCE_TONE[selected.confidence]}>
                                    {selected.confidence === "high" ? "High confidence" : selected.confidence === "low" ? "Low confidence" : "No match"}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amounts[ref] ?? ""}
                                onChange={(e) => setAmounts((a) => ({ ...a, [ref]: e.target.value }))}
                                className={`${cls} w-28 text-right`}
                                disabled={!selections[ref]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <Button onClick={confirmReconcile} disabled={confirming}>
                    {confirming ? "Confirming…" : "Confirm reconciliation"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1000/40 p-4" onClick={closeDetail}>
          <div
            className="w-full max-w-md rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : (
              <>
                <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">{detail.student.name}</h2>
                <p className="text-small text-ink-500 mb-4">
                  {detail.student.admissionNo} · {detail.classLevelName} · {detail.term.label}
                </p>

                <div className="flex flex-col gap-1.5 mb-4">
                  {detail.lines.length === 0 ? (
                    <p className="text-small text-ink-500">No fee items on this invoice.</p>
                  ) : (
                    detail.lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-small">
                        <span className="text-ink-700 dark:text-ink-300">{l.name}</span>
                        <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(l.amountKobo, currency)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-ink-100 dark:border-white/10 pt-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-small">
                    <span className="text-ink-500">Total</span>
                    <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(detail.totalKobo, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-small">
                    <span className="text-ink-500">Paid</span>
                    <span className="tabular-nums text-ink-1000 dark:text-ink-100">{formatMoney(detail.paidKobo, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-small font-medium">
                    <span className="text-ink-500">Balance</span>
                    <span className={`tabular-nums ${detail.balanceKobo > 0 ? "text-error" : "text-success"}`}>
                      {formatMoney(detail.balanceKobo, currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 border-t border-ink-100 dark:border-white/10 pt-4">
                  <h3 className="text-small font-medium text-ink-1000 dark:text-ink-100 mb-3">Record payment</h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <label className="text-caption text-ink-500 flex flex-col gap-1 flex-1">Channel
                        <select value={channel} onChange={(e) => setChannel(e.target.value as "CASH" | "BANK_TRANSFER")} className={cls}>
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                        </select>
                      </label>
                      <label className="text-caption text-ink-500 flex flex-col gap-1 flex-1">Amount (₦)
                        <input type="number" min="0" step="0.01" value={amountNaira} onChange={(e) => setAmountNaira(e.target.value)} placeholder="0.00" className={cls} />
                      </label>
                    </div>
                    <label className="text-caption text-ink-500 flex flex-col gap-1">Reference (optional)
                      <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. teller no." className={cls} />
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={recordPayment} disabled={recording}>
                        {recording ? "Recording…" : "Record"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-ink-100 dark:border-white/10 pt-4">
                    <h3 className="text-small font-medium text-ink-1000 dark:text-ink-100 mb-3">Pay online</h3>
                    <div className="flex flex-col gap-2">
                      <label className="text-caption text-ink-500 flex flex-col gap-1">Payer email
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="payer@example.com" className={cls} />
                      </label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={payOnline} disabled={initializing}>
                          {initializing ? "Starting…" : "Pay online"}
                        </Button>
                        {onlineRef && (
                          <Button size="sm" onClick={verifyOnline} disabled={verifying}>
                            {verifying ? "Verifying…" : "I've paid — verify"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {payError && <p className="mt-3 text-caption text-error">{payError}</p>}
                  {receiptCode && (
                    <p className="mt-3 text-caption text-success">
                      Recorded. <a href={`/receipt/${receiptCode}`} target="_blank" rel="noreferrer" className="underline font-medium">View receipt</a>
                    </p>
                  )}
                </div>

                <div className="mt-5 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={closeDetail}>Close</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
