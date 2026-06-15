"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, EmptyState } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type CorrectableComponent,
  type ReleaseStatusRow,
  type ReleasedSheet,
} from "@/lib/api";
import { session } from "@/lib/auth";
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

  // Correction config + modal
  const [requireOtp, setRequireOtp] = useState(true);
  const [correcting, setCorrecting] = useState<{ studentId: string; name: string } | null>(null);
  const [cSubjectId, setCSubjectId] = useState("");
  const [comps, setComps] = useState<CorrectableComponent[]>([]);
  const [cTypeId, setCTypeId] = useState("");
  const [cNewValue, setCNewValue] = useState("");
  const [cReason, setCReason] = useState("");
  const [cOtp, setCOtp] = useState("");
  const [cOtpSent, setCOtpSent] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const [cBusy, setCBusy] = useState(false);

  useEffect(() => {
    void api.getCorrectionConfig().then((c) => setRequireOtp(c.requireCorrectionOtp)).catch(() => {});
  }, []);

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

  const openCorrect = (studentId: string, name: string) => {
    setCorrecting({ studentId, name });
    setCSubjectId("");
    setComps([]);
    setCTypeId("");
    setCNewValue("");
    setCReason("");
    setCOtp("");
    setCOtpSent(false);
    setCErr(null);
  };
  const closeCorrect = () => setCorrecting(null);

  // Subject options come from the corrected student's frozen entries.
  const correctingStudent = correcting
    ? sheet?.data.students.find((s) => s.studentId === correcting.studentId)
    : undefined;
  const subjectOpts = correctingStudent
    ? correctingStudent.entries.map((e) => ({ subjectId: e.subjectId, subjectName: e.subjectName }))
    : [];

  // Load components when a subject is picked.
  useEffect(() => {
    if (!sheet || !correcting || !cSubjectId) {
      setComps([]);
      setCTypeId("");
      return;
    }
    void api
      .getCorrectableScores(sheet.classId, termId, correcting.studentId, cSubjectId)
      .then(setComps)
      .catch(() => setComps([]));
  }, [sheet, correcting, cSubjectId, termId]);

  const sendOtp = async () => {
    setCErr(null);
    const phone = session.user()?.phone;
    if (!phone) {
      setCErr("No phone on your account. Ask an admin to set one before requesting a code.");
      return;
    }
    try {
      await api.requestCorrectionOtp(phone);
      setCOtpSent(true);
    } catch (e) {
      setCErr(e instanceof ApiError ? e.message : "Could not send code.");
    }
  };

  const submitCorrection = async () => {
    if (!sheet || !correcting) return;
    setCBusy(true);
    setCErr(null);
    try {
      await api.correctScore({
        classId: sheet.classId,
        termId,
        studentId: correcting.studentId,
        subjectId: cSubjectId,
        assessmentTypeId: cTypeId,
        newValue: Number(cNewValue),
        reason: cReason,
        otpCode: requireOtp ? cOtp : undefined,
      });
      setCorrecting(null);
      setSheet({ classId: sheet.classId, data: await api.getReleasedSheet(sheet.classId, termId) });
    } catch (e) {
      setCErr(e instanceof ApiError ? e.message : "Correction failed.");
    } finally {
      setCBusy(false);
    }
  };

  const correctReady =
    !!cSubjectId && !!cTypeId && cNewValue !== "" && cReason.trim() !== "" && (!requireOtp || cOtp.trim() !== "");

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
                <th className="py-2 pl-3 font-medium text-right">Action</th>
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
                    <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                      <Button variant="outline" size="sm" onClick={() => openCorrect(st.studentId, st.name)}>Correct</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {correcting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1000/40 p-4" onClick={closeCorrect}>
          <div
            className="w-full max-w-md rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-1">Correct result</h2>
            <p className="text-small text-ink-500 mb-4">{correcting.name}</p>

            <div className="flex flex-col gap-3">
              <label className="text-small text-ink-500 flex flex-col gap-1">Subject
                <select value={cSubjectId} onChange={(e) => setCSubjectId(e.target.value)} className={cls}>
                  <option value="">Select…</option>
                  {subjectOpts.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}
                </select>
              </label>

              <label className="text-small text-ink-500 flex flex-col gap-1">Component
                <select value={cTypeId} onChange={(e) => setCTypeId(e.target.value)} className={cls} disabled={!cSubjectId}>
                  <option value="">Select…</option>
                  {comps.map((c) => (
                    <option key={c.assessmentTypeId} value={c.assessmentTypeId}>
                      {c.name} (current: {c.value ?? "—"})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-small text-ink-500 flex flex-col gap-1">New value
                <input type="number" value={cNewValue} onChange={(e) => setCNewValue(e.target.value)} className={cls} />
              </label>

              <label className="text-small text-ink-500 flex flex-col gap-1">Reason
                <input value={cReason} onChange={(e) => setCReason(e.target.value)} className={cls} placeholder="Why is this being corrected?" />
              </label>

              {requireOtp && (
                <label className="text-small text-ink-500 flex flex-col gap-1">One-time code
                  <div className="flex items-center gap-2">
                    <input value={cOtp} onChange={(e) => setCOtp(e.target.value)} className={`${cls} flex-1`} placeholder="6-digit code" />
                    <Button variant="outline" size="sm" onClick={sendOtp}>{cOtpSent ? "Resend" : "Send code"}</Button>
                  </div>
                </label>
              )}

              {cErr && <p className="text-small text-error">{cErr}</p>}

              <div className="flex items-center justify-end gap-2 mt-1">
                <Button variant="ghost" size="sm" onClick={closeCorrect} disabled={cBusy}>Cancel</Button>
                <Button size="sm" onClick={submitCorrection} disabled={cBusy || !correctReady}>
                  {cBusy ? "Saving…" : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
