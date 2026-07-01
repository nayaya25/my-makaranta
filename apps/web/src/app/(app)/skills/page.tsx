"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, PageContainer, PageHeader, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type Class,
  type ClassLevel,
  type AcademicYear,
  type SkillsGrid,
} from "@/lib/api";
import { Star } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function SkillsPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");

  // Map of classLevelId → isEarlyYears
  const [levelEyMap, setLevelEyMap] = useState<Map<string, boolean>>(new Map());

  const [grid, setGrid] = useState<SkillsGrid | null>(null);
  // ratings: map of "studentId:skillItemId" -> value
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  // remarks: map of studentId -> formTeacherRemark text
  const [remarks, setRemarks] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Load classes + terms + class levels once
  useEffect(() => {
    void (async () => {
      const [cs, yrs, levels] = await Promise.all([
        api.listClasses(),
        api.listAcademicYears(),
        api.listClassLevels(),
      ]);
      setClasses(cs);
      setYears(yrs);
      // Build EY map
      const eyMap = new Map<string, boolean>();
      for (const level of levels) {
        eyMap.set(level.id, !!level.isEarlyYears);
      }
      setLevelEyMap(eyMap);

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

  // Determine if selected class is Early Years
  const isEarlyYears = useMemo(() => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return false;
    return levelEyMap.get(cls.classLevelId) ?? false;
  }, [classes, classId, levelEyMap]);

  const kind = isEarlyYears ? "early_years" as const : undefined;

  const loadGrid = useCallback(async () => {
    if (!classId || !termId) return;
    setLoading(true);
    setError(null);
    try {
      const g = await api.getSkillsGrid(classId, termId, kind);
      setGrid(g);

      // Populate ratings from server data
      const rm = new Map<string, number>();
      for (const r of g.ratings) {
        rm.set(`${r.studentId}:${r.skillItemId}`, r.value);
      }
      setRatings(rm);

      // Load existing remarks for each student
      const remarkMap = new Map<string, string>();
      await Promise.all(
        g.students.map(async (s) => {
          try {
            const r = await api.getRemarks(s.studentId, termId);
            if (r?.formTeacherRemark) {
              remarkMap.set(s.studentId, r.formTeacherRemark);
            }
          } catch {
            // non-fatal
          }
        }),
      );
      setRemarks(remarkMap);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the skills grid.");
    } finally {
      setLoading(false);
    }
  }, [classId, termId, kind]);

  useEffect(() => { void loadGrid(); }, [loadGrid]);

  const allItems = useMemo(
    () => grid?.domains.flatMap((d) => d.items) ?? [],
    [grid],
  );

  const setRating = (studentId: string, skillItemId: string, value: number) => {
    setRatings((prev) => new Map(prev).set(`${studentId}:${skillItemId}`, value));
  };

  const setRemark = (studentId: string, text: string) => {
    setRemarks((prev) => new Map(prev).set(studentId, text));
  };

  const save = async () => {
    if (!grid) return;
    setSaveState("saving");
    setError(null);
    try {
      // Build ratings payload — only include cells that have a value
      const ratingsList = Array.from(ratings.entries())
        .map(([key, value]) => {
          const [studentId, skillItemId] = key.split(":");
          return { studentId: studentId!, skillItemId: skillItemId!, value };
        })
        .filter((r) => r.value >= 1);

      await api.saveSkillRatings({ classId, termId, ratings: ratingsList, kind });

      // Save form-teacher remarks
      await Promise.all(
        grid.students
          .filter((s) => remarks.has(s.studentId))
          .map((s) =>
            api.putRemarks({
              studentId: s.studentId,
              termId,
              classId,
              formTeacherRemark: remarks.get(s.studentId) ?? "",
            }),
          ),
      );

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof ApiError ? e.message : "Could not save.");
    }
  };

  const selClass = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  const pageTitle = isEarlyYears ? "Skills / Development" : "Skills";
  const pageDesc = isEarlyYears
    ? "Record developmental area ratings and form-teacher remarks for Early Years classes."
    : "Record affective/skills ratings and form-teacher remarks.";

  return (
    <PageContainer>
      <PageHeader title={pageTitle} description={pageDesc} />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-small text-ink-500 flex flex-col gap-1">
          Class
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={selClass}
          >
            {classes.map((c) => {
              const isEy = levelEyMap.get(c.classLevelId) ?? false;
              return (
                <option key={c.id} value={c.id}>
                  {c.name}{isEy ? " (EY)" : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label className="text-small text-ink-500 flex flex-col gap-1">
          Term
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className={selClass}
          >
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {isEarlyYears && (
          <span className="text-caption text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded-full self-end mb-0.5">
            Early Years
          </span>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <Button
            onClick={() => void save()}
            disabled={saveState === "saving" || !grid || grid.locked || grid.students.length === 0}
          >
            Save
          </Button>
          <span
            aria-live="polite"
            className={cn(
              "text-caption tabular-nums",
              saveState === "saved" ? "text-success" : saveState === "error" ? "text-error" : "text-ink-500",
            )}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
          </span>
        </div>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {grid?.locked && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small text-warning-700 dark:text-warning-300">
          <Star size={15} className="shrink-0" aria-hidden />
          <span>
            {isEarlyYears
              ? "Released — locked. Developmental ratings are read-only."
              : "Released — locked. Ratings are read-only."}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !grid || grid.domains.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          title={isEarlyYears ? "No Early Years areas configured" : "No skill domains configured"}
          description={
            isEarlyYears
              ? "Configure Early Years areas in Settings → Skills config (Early Years tab) before recording ratings."
              : "Configure skill domains and items in Settings → Assessment before recording ratings."
          }
        />
      ) : grid.students.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          title="No students"
          description="This class has no enrolled students for the selected term."
        />
      ) : (
        <>
          {/* Scale legend */}
          {grid.scale.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">
              {grid.scale.map((pt) => (
                <span key={pt.value} className="text-caption text-ink-500">
                  <span className="font-semibold text-ink-700 dark:text-ink-300">{pt.value}</span> = {pt.label}
                </span>
              ))}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] text-left dark:border-white/10 dark:bg-white/[0.03]">
                    <th className="px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500">
                      Student
                    </th>
                    {grid.domains.map((domain) =>
                      domain.items.map((item, i) => (
                        <th
                          key={item.id}
                          className="px-2 py-2.5 text-center text-caption font-semibold uppercase tracking-wide text-ink-500"
                          title={`${domain.name} — ${item.name}`}
                        >
                          {i === 0 && (
                            <span className="block text-[9px] font-bold uppercase tracking-widest text-brand-500 mb-0.5">
                              {domain.name}
                            </span>
                          )}
                          <span className="whitespace-nowrap">{item.name}</span>
                        </th>
                      )),
                    )}
                    <th className="px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-ink-500 min-w-[160px]">
                      Form Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grid.students.map((student) => (
                    <tr
                      key={student.studentId}
                      className="border-t border-ink-1000/[0.06] dark:border-white/[0.06]"
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-ink-1000 dark:text-ink-100">
                        {student.name}
                      </td>
                      {allItems.map((item) => {
                        const key = `${student.studentId}:${item.id}`;
                        const val = ratings.get(key) ?? 0;
                        return (
                          <td key={item.id} className="px-2 py-2 text-center">
                            <select
                              aria-label={`${student.name} — ${item.name}`}
                              value={val === 0 ? "" : String(val)}
                              disabled={grid.locked}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setRating(student.studentId, item.id, v);
                              }}
                              className={cn(
                                "h-9 w-20 rounded-input border bg-surface px-1 text-center text-small dark:bg-surface-dark",
                                grid.locked
                                  ? "border-ink-200 dark:border-white/10 opacity-60 cursor-not-allowed"
                                  : "border-ink-300 dark:border-white/15",
                              )}
                            >
                              <option value="">—</option>
                              {grid.scale.map((pt) => (
                                <option key={pt.value} value={pt.value} title={pt.label}>
                                  {pt.value} — {pt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2">
                        <textarea
                          aria-label={`${student.name} form remark`}
                          value={remarks.get(student.studentId) ?? ""}
                          readOnly={grid.locked}
                          onChange={(e) => setRemark(student.studentId, e.target.value)}
                          rows={2}
                          className={cn(
                            "w-full min-w-[140px] rounded-input border bg-surface px-2 py-1 text-small dark:bg-surface-dark resize-none",
                            grid.locked
                              ? "border-ink-200 dark:border-white/10 opacity-60 cursor-not-allowed"
                              : "border-ink-300 dark:border-white/15",
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
