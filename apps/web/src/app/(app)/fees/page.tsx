"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Spinner, EmptyState } from "@mymakaranta/ui";
import { api, ApiError, type AcademicYear, type InvoiceRow, type InvoiceDetail } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { Wallet } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

export default function FeesPage() {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [currency, setCurrency] = useState("NGN");

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      setRows(await api.getInvoices(termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [termId]);
  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

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

  const openDetail = async (studentId: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await api.getInvoiceDetail(studentId, termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the invoice.");
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetail = () => { setDetail(null); setDetailLoading(false); };

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
              <th className="py-2 px-3 font-medium">Class level</th>
              <th className="py-2 px-3 font-medium text-right">Total</th>
              <th className="py-2 px-3 font-medium text-right">Paid</th>
              <th className="py-2 pl-3 font-medium text-right">Balance</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.studentId}
                  className="border-t border-ink-100 dark:border-white/10 cursor-pointer hover:bg-ink-100/50 dark:hover:bg-white/5"
                  onClick={() => openDetail(r.studentId)}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{r.name}</td>
                  <td className="py-1.5 px-3 text-ink-700 dark:text-ink-300">{r.classLevelName}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{formatMoney(r.totalKobo, currency)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{formatMoney(r.paidKobo, currency)}</td>
                  <td className={`py-1.5 pl-3 text-right tabular-nums font-medium ${r.balanceKobo > 0 ? "text-error" : "text-success"}`}>
                    {formatMoney(r.balanceKobo, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
