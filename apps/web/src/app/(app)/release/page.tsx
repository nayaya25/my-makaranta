"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, EmptyState } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type ReleaseStatusRow,
  type ReleasedSheet,
} from "@/lib/api";
import { Lock } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ReleasePage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<ReleaseStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ classId: string; data: ReleasedSheet } | null>(null);

  useEffect(() => {
    void (async () => {
      const yrs = await api.listAcademicYears();
      setYears(yrs);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
    })();
  }, []);

  const loadStatus = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    setSheet(null);
    try {
      setRows(await api.getReleaseStatus(termId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load release status.");
    } finally {
      setLoading(false);
    }
  }, [termId]);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const doRelease = async (classId: string) => {
    if (!window.confirm("Release this class? Scores become locked (immutable) for this term.")) return;
    setBusy(classId);
    setError(null);
    try {
      await api.releaseClass(classId, termId);
      await loadStatus();
      setSheet({ classId, data: await api.getReleasedSheet(classId, termId) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not release.");
    } finally {
      setBusy(null);
    }
  };

  const viewSheet = async (classId: string) => {
    setError(null);
    try {
      setSheet({ classId, data: await api.getReleasedSheet(classId, termId) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the sheet.");
    }
  };

  const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  return (
    <div className="px-4 py-8 mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Release</h1>
        <p className="text-small text-ink-500">Freeze and release a class&apos;s results. Released scores are locked.</p>
      </div>

      <div className="mb-6 flex items-end gap-3">
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Lock size={28} />} title="No classes" description="No classes have enrolments for this term." />
      ) : (
        <div className="flex flex-col gap-2 mb-8">
          {rows.map((r) => (
            <div key={r.classId} className="flex items-center justify-between gap-3 border-b border-ink-100 dark:border-white/10 pb-2">
              <span className="text-body text-ink-1000 dark:text-ink-100">{r.name}</span>
              <div className="flex items-center gap-3">
                {r.released ? (
                  <>
                    <Badge tone="success">Released</Badge>
                    <Button variant="outline" size="sm" onClick={() => viewSheet(r.classId)}>View</Button>
                  </>
                ) : (
                  <Button size="sm" disabled={busy === r.classId} onClick={() => doRelease(r.classId)}>
                    {busy === r.classId ? "Releasing…" : "Release"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <div>
          <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-3">Released sheet</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-small border-collapse">
              <thead><tr className="text-left text-ink-500">
                <th className="py-2 pr-3 font-medium">Pos</th>
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 px-2 font-medium text-center">Average</th>
                <th className="py-2 pl-3 font-medium">Subjects</th>
              </tr></thead>
              <tbody>
                {sheet.data.students.map((st) => (
                  <tr key={st.studentId} className="border-t border-ink-100 dark:border-white/10 align-top">
                    <td className="py-1.5 pr-3 tabular-nums font-medium">{st.position}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{st.name}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{st.average}</td>
                    <td className="py-1.5 pl-3 text-ink-700 dark:text-ink-300">
                      {st.entries.map((e) => `${e.subjectName} ${e.total}${e.grade ? ` (${e.grade})` : ""}`).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
