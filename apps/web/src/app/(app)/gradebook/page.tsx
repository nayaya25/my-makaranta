"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, PageContainer, PageHeader, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AssessmentType,
  type GradeBoundary,
  type Class,
  type ClassLevel,
  type SubjectAssignment,
} from "@/lib/api";
import { type AcademicYear } from "@/lib/api";
import { computeRow } from "@/lib/gradebook";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function GradebookPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [subjectOpts, setSubjectOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectId, setSubjectId] = useState("");

  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>([]);
  const [rows, setRows] = useState<Array<{ studentId: string; name: string; values: Record<string, number> }>>([]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cs, yrs, lvls] = await Promise.all([api.listClasses(), api.listAcademicYears(), api.listClassLevels()]);
      setClasses(cs);
      setYears(yrs);
      setClassLevels(lvls);
      if (cs[0]) setClassId(cs[0].id);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? [])
          .filter((t) => t.id)
          .map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })),
      );
      setTerms(ts);
      const current = ts.find((t) => t.isCurrent) ?? ts[0];
      if (current) setTermId(current.id);
    })();
  }, []);

  useEffect(() => {
    if (!classId || !termId) return;
    // Reset subject immediately so loadGradebook skips a stale fetch with the old
    // subject before the cascade below resolves the new class's offered subjects.
    setSubjectId("");
    const year = years.find((y) => (y.terms ?? []).some((t) => t.id === termId));
    if (!year) { setSubjectOpts([]); return; }
    void (async () => {
      const assignments: SubjectAssignment[] = await api.listSubjectAssignments(classId, year.id);
      const seen = new Map<string, string>();
      for (const a of assignments) if (a.subject) seen.set(a.subject.id, a.subject.name);
      const opts = [...seen].map(([id, name]) => ({ id, name }));
      setSubjectOpts(opts);
      setSubjectId(opts[0]?.id ?? "");
    })();
  }, [classId, termId, years]);

  const loadGradebook = useCallback(async () => {
    if (!classId || !subjectId || !termId) return;
    setLoading(true);
    setError(null);
    try {
      const gb = await api.getScores(classId, subjectId, termId);
      setTypes(gb.assessmentTypes);
      setBoundaries(gb.gradeBoundaries);
      setRows(gb.students.map((s) => ({
        studentId: s.studentId,
        name: `${s.firstName} ${s.lastName}`,
        values: { ...s.scores },
      })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the gradebook.");
    } finally {
      setLoading(false);
    }
  }, [classId, subjectId, termId]);
  useEffect(() => { void loadGradebook(); }, [loadGradebook]);

  const levelEyMap = useMemo(() => new Map(classLevels.map((l) => [l.id, !!l.isEarlyYears])), [classLevels]);
  const isEarlyYears = useMemo(() => {
    const classLevelId = classes.find((c) => c.id === classId)?.classLevelId ?? "";
    return levelEyMap.get(classLevelId) ?? false;
  }, [classes, classId, levelEyMap]);

  const maxById = useMemo(() => new Map(types.map((t) => [t.id, t.maxScore])), [types]);
  const overMax = (typeId: string, v: number) => {
    const m = maxById.get(typeId);
    return m !== undefined && (v < 0 || v > m);
  };
  const hasError = rows.some((r) => Object.entries(r.values).some(([tid, v]) => Number.isFinite(v) && overMax(tid, v)));

  const setCell = (studentId: string, typeId: string, raw: string) => {
    const v = raw === "" ? NaN : Number(raw);
    setRows((prev) => prev.map((r) =>
      r.studentId === studentId ? { ...r, values: { ...r.values, [typeId]: v } } : r));
  };

  const save = async () => {
    setSaveState("saving");
    setError(null);
    const payload = {
      classId, subjectId, termId,
      scores: rows.flatMap((r) =>
        types
          .filter((t) => Number.isFinite(r.values[t.id]))
          .map((t) => ({ studentId: r.studentId, assessmentTypeId: t.id, value: r.values[t.id]! }))),
    };
    try {
      await api.saveScores(payload);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof ApiError ? e.message : "Could not save scores.");
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Gradebook" description="Record assessment scores for a class and subject." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-small text-ink-500 flex flex-col gap-1">Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {!isEarlyYears && (
          <>
            <label className="text-small text-ink-500 flex flex-col gap-1">Subject
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
                {subjectOpts.length === 0 && <option value="">No subjects assigned</option>}
                {subjectOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-3 ml-auto">
              <Button onClick={() => void save()} disabled={saveState === "saving" || hasError || rows.length === 0}>Save scores</Button>
              <span aria-live="polite" className={cn("text-caption tabular-nums",
                saveState === "saved" ? "text-success" : saveState === "error" ? "text-error" : "text-ink-500")}>
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
              </span>
            </div>
          </>
        )}
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {isEarlyYears ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState icon={<ClipboardList size={28} />} title="Early Years class"
            description="This class uses developmental assessment. Use the Skills page to record EY ratings." />
          <Link href="/skills">
            <Button variant="outline" size="sm">Go to Skills page</Button>
          </Link>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : types.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState icon={<ClipboardList size={28} />} title="No assessment structure"
            description="Configure assessment components before recording scores." />
          <Link href="/settings/assessment">
            <Button variant="outline" size="sm">Go to Settings → Assessment</Button>
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="No students"
          description="This class has no enrolled students for the selected term." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] text-left dark:border-white/10 dark:bg-white/[0.03]">
                  <th className="px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500">Student</th>
                  {types.map((t) => <th key={t.id} className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">{t.name}<span className="ml-0.5 normal-case text-ink-500/70">/{t.maxScore}</span></th>)}
                  <th className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">Total</th>
                  <th className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500">Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const res = computeRow(r.values, boundaries);
                  return (
                    <tr key={r.studentId} className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]">
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-ink-1000 dark:text-ink-100">{r.name}</td>
                      {types.map((t) => {
                        const v = r.values[t.id];
                        const bad = Number.isFinite(v) && overMax(t.id, v as number);
                        return (
                          <td key={t.id} className="px-2 py-2 text-center">
                            <input type="number" min={0} max={t.maxScore}
                              aria-label={`${r.name} ${t.name}`}
                              value={Number.isFinite(v) ? String(v) : ""}
                              onChange={(e) => setCell(r.studentId, t.id, e.target.value)}
                              className={cn("h-9 w-16 rounded-input border bg-surface px-2 text-center tabular-nums dark:bg-surface-dark",
                                bad ? "border-error" : "border-ink-300 dark:border-white/15")} />
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-semibold tabular-nums text-ink-1000 dark:text-ink-100">{res.total}</td>
                      <td className="px-2 py-2 text-center">{res.grade ? <Badge tone="info">{res.grade}</Badge> : <span className="text-ink-500">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
