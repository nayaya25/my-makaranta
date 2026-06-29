"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, PageContainer, PageHeader, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type Class,
  type AcademicYear,
  type ClassMasterSheet,
  type SubjectMasterSheet,
  type SubjectAssignment,
} from "@/lib/api";
import { BarChart3 } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ReviewPage() {
  const [mode, setMode] = useState<"class" | "subject">("class");
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [subjectOpts, setSubjectOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const [classSheet, setClassSheet] = useState<ClassMasterSheet | null>(null);
  const [subjectSheet, setSubjectSheet] = useState<SubjectMasterSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Principal remarks: map of studentId -> remark text
  const [principalRemarks, setPrincipalRemarks] = useState<Map<string, string>>(new Map());
  const [remarkSave, setRemarkSave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    void (async () => {
      const [cs, yrs] = await Promise.all([api.listClasses(), api.listAcademicYears()]);
      setClasses(cs);
      setYears(yrs);
      if (cs[0]) setClassId(cs[0].id);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
    })();
  }, []);

  // Subject options across the whole school (for subject-master) for the term's year.
  useEffect(() => {
    if (!termId) return;
    void (async () => {
      const year = years.find((y) => (y.terms ?? []).some((t) => t.id === termId));
      if (!year) { setSubjectOpts([]); return; }
      // Distinct subjects assigned anywhere this year: gather from all classes' assignments.
      const all: SubjectAssignment[] = (
        await Promise.all(classes.map((c) => api.listSubjectAssignments(c.id, year.id)))
      ).flat();
      const seen = new Map<string, string>();
      for (const a of all) if (a.subject) seen.set(a.subject.id, a.subject.name);
      const opts = [...seen].map(([id, name]) => ({ id, name }));
      setSubjectOpts(opts);
      if (opts[0]) setSubjectId(opts[0].id);
    })();
  }, [termId, years, classes]);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "class") {
        setSubjectSheet(null); // drop the other mode's sheet so it can't flash
        if (!classId) return;
        const sheet = await api.getClassMaster(classId, termId);
        setClassSheet(sheet);
        // Load existing principal remarks for each student
        const rm = new Map<string, string>();
        await Promise.all(
          sheet.students.map(async (s) => {
            try {
              const r = await api.getRemarks(s.studentId, termId);
              if (r?.principalRemark) rm.set(s.studentId, r.principalRemark);
            } catch {
              // non-fatal
            }
          }),
        );
        setPrincipalRemarks(rm);
      } else {
        setClassSheet(null);
        setPrincipalRemarks(new Map());
        if (!subjectId) return;
        setSubjectSheet(await api.getSubjectMaster(subjectId, termId));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the sheet.");
    } finally {
      setLoading(false);
    }
  }, [mode, classId, subjectId, termId]);
  useEffect(() => { void load(); }, [load]);

  const savePrincipalRemarks = async () => {
    if (!classSheet || !classId || !termId) return;
    setRemarkSave("saving");
    try {
      await Promise.all(
        classSheet.students
          .filter((s) => principalRemarks.has(s.studentId))
          .map((s) =>
            api.putRemarks({
              studentId: s.studentId,
              termId,
              classId,
              principalRemark: principalRemarks.get(s.studentId) ?? "",
            }),
          ),
      );
      setRemarkSave("saved");
      setTimeout(() => setRemarkSave("idle"), 2000);
    } catch (e) {
      setRemarkSave("error");
      setError(e instanceof ApiError ? e.message : "Could not save remarks.");
    }
  };

  const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  return (
    <PageContainer>
      <PageHeader title="Review" description="Class-master and subject-master sheets with anomaly flags." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex rounded-input border border-ink-300 dark:border-white/15 overflow-hidden">
          <button onClick={() => setMode("class")} className={cn("px-3 h-9 text-small", mode === "class" ? "bg-brand-500 text-white" : "text-ink-700")}>Class master</button>
          <button onClick={() => setMode("subject")} className={cn("px-3 h-9 text-small", mode === "subject" ? "bg-brand-500 text-white" : "text-ink-700")}>Subject master</button>
        </div>
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {mode === "class" ? (
          <label className="text-small text-ink-500 flex flex-col gap-1">Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={cls}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-small text-ink-500 flex flex-col gap-1">Subject
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cls}>
              {subjectOpts.length === 0 && <option value="">No subjects</option>}
              {subjectOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : mode === "class" ? (
        !classSheet || classSheet.students.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="Nothing to review" description="No students or scores for this class and term." />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-end gap-3">
              <Button
                size="sm"
                onClick={() => void savePrincipalRemarks()}
                disabled={remarkSave === "saving"}
              >
                Save remarks
              </Button>
              <span
                aria-live="polite"
                className={cn(
                  "text-caption tabular-nums",
                  remarkSave === "saved" ? "text-success" : remarkSave === "error" ? "text-error" : "text-ink-500",
                )}
              >
                {remarkSave === "saving" ? "Saving…" : remarkSave === "saved" ? "Saved" : remarkSave === "error" ? "Save failed" : ""}
              </span>
            </div>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] text-left dark:border-white/10 dark:bg-white/[0.03]">
                      <th className="px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500">Student</th>
                      {classSheet.subjects.map((s) => <th key={s.id} className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">{s.name}</th>)}
                      <th className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">Avg</th>
                      <th className="px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500 min-w-[180px]">Principal Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classSheet.students.map((st) => (
                      <tr key={st.studentId} className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-ink-1000 dark:text-ink-100">{st.name}</td>
                        {classSheet.subjects.map((s) => {
                          const cell = st.perSubject[s.id];
                          return (
                            <td key={s.id} className={cn("px-2 py-2 text-center", cell?.anomaly && "bg-warning/15")}>
                              {cell ? <span className="tabular-nums text-ink-700 dark:text-ink-300">{cell.total}{cell.grade ? ` (${cell.grade})` : ""}</span> : <span className="text-ink-500">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center font-semibold tabular-nums text-ink-1000 dark:text-ink-100">{st.average}</td>
                        <td className="px-4 py-2">
                          <textarea
                            aria-label={`${st.name} principal remark`}
                            value={principalRemarks.get(st.studentId) ?? ""}
                            onChange={(e) =>
                              setPrincipalRemarks((prev) => new Map(prev).set(st.studentId, e.target.value))
                            }
                            rows={2}
                            className="w-full min-w-[160px] rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 py-1 text-small resize-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )
      ) : (
        !subjectSheet || subjectSheet.classes.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="Nothing to review" description="No classes or scores for this subject and term." />
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-small text-ink-500 tabular-nums">Subject mean {subjectSheet.subjectMean.toFixed(1)} · σ {subjectSheet.subjectStdDev.toFixed(1)}</p>
            {subjectSheet.classes.map((c) => (
              <div key={c.classId}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">{c.name}</span>
                  <span className="text-caption text-ink-500 tabular-nums">mean {c.mean.toFixed(1)}</span>
                  <Badge tone={c.drift >= 0 ? "success" : "warning"}>{c.drift >= 0 ? "+" : ""}{c.drift.toFixed(1)} vs subject</Badge>
                </div>
                <table className="w-full text-small border-collapse">
                  <thead><tr className="text-left text-ink-500"><th className="py-1 pr-3 font-medium">Student</th><th className="py-1 px-2 font-medium text-center">Total</th><th className="py-1 px-2 font-medium text-center">Grade</th><th className="py-1 px-2 font-medium text-center">z</th></tr></thead>
                  <tbody>
                    {c.students.map((s) => (
                      <tr key={s.studentId} className={cn("border-t border-ink-100 dark:border-white/10", s.anomaly && "bg-warning/15")}>
                        <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{s.name}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{s.total}</td>
                        <td className="py-1.5 px-2 text-center">{s.grade ? <Badge tone="info">{s.grade}</Badge> : <span className="text-ink-500">—</span>}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{s.z.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      )}
    </PageContainer>
  );
}
