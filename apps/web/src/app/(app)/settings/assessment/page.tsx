"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AssessmentType,
  type GradeBoundary,
  type ClassLevel,
  type SubjectAssignment,
  type Class,
} from "@/lib/api";
import { resolveGrade } from "@/lib/grade";

export default function AssessmentSettingsPage() {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(true);

  useEffect(() => {
    void api.listClassLevels()
      .then((levels) => {
        setClassLevels(levels);
      })
      .catch(() => {})
      .finally(() => setLevelsLoading(false));
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Assessment & Grading"
        description="Configure score components, grade boundaries, and teacher–subject assignments."
      />
      <div className="flex flex-col gap-6">
        {/* Level selector */}
        <Card>
          <CardBody>
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold text-ink-700 dark:text-ink-300">
                Editing format for
              </span>
              {levelsLoading ? (
                <Spinner />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLevelId(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-small border transition-colors",
                      selectedLevelId === null
                        ? "bg-brand-600 text-white border-brand-600"
                        : "border-ink-300 dark:border-white/15 text-ink-700 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-white/5",
                    )}
                  >
                    Default (all levels)
                  </button>
                  {classLevels.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setSelectedLevelId(level.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-small border transition-colors",
                        selectedLevelId === level.id
                          ? "bg-brand-600 text-white border-brand-600"
                          : "border-ink-300 dark:border-white/15 text-ink-700 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-white/5",
                      )}
                    >
                      {level.name}
                    </button>
                  ))}
                </div>
              )}
              {selectedLevelId !== null && (
                <p className="text-caption text-ink-500">
                  Rows marked &ldquo;Default&rdquo; are inherited from the school-wide format. Click &ldquo;Override for this level&rdquo; to create a level-specific row.
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <GradeBoundariesPanel classLevelId={selectedLevelId} classLevels={classLevels} />
        <AssessmentTypesPanel classLevelId={selectedLevelId} classLevels={classLevels} />
        <ApplyToLevelsPanel classLevelId={selectedLevelId} classLevels={classLevels} />
        <CorrectionsPanel />
        <SubjectAssignmentsPanel />
      </div>
    </PageContainer>
  );
}

/* ---------------- Apply-to-levels panel ---------------- */
function ApplyToLevelsPanel({
  classLevelId,
  classLevels,
}: {
  classLevelId: string | null;
  classLevels: ClassLevel[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggleLevel = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const applyAll = async () => {
    if (selected.length === 0) return;
    setApplying(true);
    setMsg(null);
    try {
      const [at, gb] = await Promise.all([
        api.applyAssessmentFormat({ sourceClassLevelId: classLevelId, targetClassLevelIds: selected }),
        api.applyGradeFormat({ sourceClassLevelId: classLevelId, targetClassLevelIds: selected }),
      ]);
      setMsg(`Applied: ${at.applied} assessment type(s) and ${gb.applied} grade boundary/ies.`);
      setSelected([]);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not apply format.");
    } finally {
      setApplying(false);
    }
  };

  const availableLevels = classLevels.filter((l) => l.id !== classLevelId);
  if (availableLevels.length === 0) return null;

  const sourceLabel = classLevelId
    ? (classLevels.find((l) => l.id === classLevelId)?.name ?? "selected level")
    : "Default";

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Apply format to other levels</span>
      </CardHeader>
      <CardBody>
        <p className="text-small text-ink-500 mb-3">
          Copy the <strong>{sourceLabel}</strong> format (assessment components + grade boundaries) to the selected levels, replacing their existing rows.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {availableLevels.map((level) => (
            <label key={level.id} className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(level.id)}
                onChange={() => toggleLevel(level.id)}
                className="h-4 w-4"
              />
              {level.name}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={applyAll} disabled={selected.length === 0 || applying}>
            {applying ? "Applying…" : `Apply to ${selected.length > 0 ? selected.length : ""} selected level${selected.length !== 1 ? "s" : ""}`}
          </Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------------- Result corrections ---------------- */
function CorrectionsPanel() {
  const [requireOtp, setRequireOtp] = useState<boolean | null>(null);

  useEffect(() => {
    void api.getCorrectionConfig().then((c) => setRequireOtp(c.requireCorrectionOtp)).catch(() => {});
  }, []);

  const toggleOtp = async () => {
    if (requireOtp === null) return;
    const next = !requireOtp;
    setRequireOtp(next);
    try {
      await api.setCorrectionConfig(next);
    } catch {
      setRequireOtp(!next);
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Result corrections</span>
      </CardHeader>
      <CardBody>
        <label className="flex items-center gap-2 text-small text-ink-700 dark:text-ink-300">
          <input
            type="checkbox"
            checked={requireOtp ?? true}
            onChange={toggleOtp}
            disabled={requireOtp === null}
            className="h-4 w-4"
          />
          Require OTP for result corrections
        </label>
        <p className="mt-2 text-caption text-ink-500">
          When enabled, correcting a released score requires a one-time code sent to the staff member&apos;s phone.
        </p>
      </CardBody>
    </Card>
  );
}

/* ---------------- Grade boundaries ---------------- */
function GradeBoundariesPanel({
  classLevelId,
  classLevels,
}: {
  classLevelId: string | null;
  classLevels: ClassLevel[];
}) {
  const [rows, setRows] = useState<GradeBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const data = classLevelId
        ? await api.listGradeBoundaries(classLevelId)
        : await api.getGradeBoundaries();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [classLevelId]);

  useEffect(() => { void load(); }, [load]);

  const applyTemplate = async (template: "WAEC" | "NECO") => {
    setMsg(null);
    try {
      const data = await api.applyGradeTemplate(template);
      setRows(data);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not apply template.");
    }
  };

  // Default view: bulk-replace via PUT
  const saveDefault = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putGradeBoundaries(rows.map((r, i) => ({ grade: r.grade, minScore: r.minScore, remark: r.remark, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const overrideRow = async (row: GradeBoundary) => {
    if (!classLevelId) return;
    setMsg(null);
    try {
      await api.createGradeBoundary({
        grade: row.grade,
        minScore: row.minScore,
        remark: row.remark,
        order: row.order,
        classLevelId,
      });
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not create override.");
    }
  };

  const addRow = () => {
    if (!classLevelId) {
      setRows((prev) => [...prev, { id: `new-${Date.now()}`, grade: "", minScore: 0, remark: "", order: prev.length }]);
    }
  };

  const updateLocal = (i: number, patch: Partial<GradeBoundary>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeLocalRow = (i: number) =>
    setRows((prev) => prev.filter((_, idx) => idx !== i));

  const levelName = classLevelId
    ? (classLevels.find((l) => l.id === classLevelId)?.name ?? "level")
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Grade boundaries</span>
            {levelName && (
              <span className="text-caption text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full">
                {levelName}
              </span>
            )}
          </div>
          {!classLevelId && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => applyTemplate("WAEC")}>Apply WAEC</Button>
              <Button variant="outline" size="sm" onClick={() => applyTemplate("NECO")}>Apply NECO</Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-small text-ink-500">
            {classLevelId
              ? "No boundaries for this level. Add one below or apply a template on Default then copy down."
              : "No grade boundaries yet. Apply WAEC to start, then edit."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const isInherited = classLevelId !== null && r.isDefault === true;
              return (
                <div key={r.id} className={cn("flex items-center gap-2", isInherited && "opacity-60")}>
                  <input
                    aria-label="grade"
                    value={r.grade}
                    disabled={!!classLevelId}
                    onChange={(e) => updateLocal(i, { grade: e.target.value })}
                    className="h-9 w-20 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small disabled:cursor-not-allowed"
                  />
                  <input
                    aria-label="min score"
                    type="number"
                    value={r.minScore}
                    disabled={!!classLevelId}
                    onChange={(e) => updateLocal(i, { minScore: Number(e.target.value) })}
                    className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small disabled:cursor-not-allowed"
                  />
                  <input
                    aria-label="remark"
                    value={r.remark}
                    disabled={!!classLevelId}
                    onChange={(e) => updateLocal(i, { remark: e.target.value })}
                    className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small disabled:cursor-not-allowed"
                  />
                  {isInherited ? (
                    <Button variant="outline" size="sm" onClick={() => overrideRow(r)}>
                      Override for this level
                    </Button>
                  ) : classLevelId ? null : (
                    <Button variant="ghost" size="sm" onClick={() => removeLocalRow(i)} aria-label="remove">✕</Button>
                  )}
                </div>
              );
            })}
            {!classLevelId && (
              <div className="flex items-center justify-between mt-2">
                <Button variant="ghost" size="sm" onClick={addRow}>+ Add band</Button>
                <span className="text-caption text-ink-500">
                  Preview: 82 → {resolveGrade(82, rows)?.grade ?? "—"} · 58 → {resolveGrade(58, rows)?.grade ?? "—"}
                </span>
              </div>
            )}
            {classLevelId && (
              <p className="text-caption text-ink-500 mt-2">
                To modify this level&apos;s format, use &apos;Apply to levels&apos; below to copy from another level.
              </p>
            )}
          </div>
        )}
        {!classLevelId && (
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={saveDefault} disabled={saving || rows.length === 0}>Save boundaries</Button>
            {msg && <span className="text-caption text-ink-500">{msg}</span>}
          </div>
        )}
        {classLevelId && msg && (
          <div className="mt-3">
            <span className="text-caption text-ink-500">{msg}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------------- Assessment types ---------------- */
function AssessmentTypesPanel({
  classLevelId,
  classLevels,
}: {
  classLevelId: string | null;
  classLevels: ClassLevel[];
}) {
  const [rows, setRows] = useState<AssessmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const data = classLevelId
        ? await api.listAssessmentTypes(classLevelId)
        : await api.getAssessmentTypes();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [classLevelId]);

  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((acc, r) => acc + (Number(r.maxScore) || 0), 0);
  const valid = total === 100 && rows.length > 0;

  // Default view: bulk PUT
  const saveDefault = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putAssessmentTypes(rows.map((r, i) => ({ name: r.name, maxScore: r.maxScore, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const overrideRow = async (row: AssessmentType) => {
    if (!classLevelId) return;
    setMsg(null);
    try {
      await api.createAssessmentType({
        name: row.name,
        maxScore: row.maxScore,
        order: row.order,
        classLevelId,
      });
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not create override.");
    }
  };

  const addRow = () => {
    if (!classLevelId) {
      setRows((prev) => [...prev, { id: `new-${Date.now()}`, name: "", maxScore: 0, order: prev.length }]);
    }
  };

  const updateLocal = (i: number, patch: Partial<AssessmentType>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeLocalRow = (i: number) =>
    setRows((prev) => prev.filter((_, idx) => idx !== i));

  const levelName = classLevelId
    ? (classLevels.find((l) => l.id === classLevelId)?.name ?? "level")
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Assessment components</span>
            {levelName && (
              <span className="text-caption text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full">
                {levelName}
              </span>
            )}
          </div>
          <span className={cn("text-small font-medium tabular-nums", valid ? "text-success" : "text-error")}>
            Total: {total} {valid ? "✓" : "✗ must equal 100"}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.length === 0 && (
              <p className="text-small text-ink-500">
                {classLevelId
                  ? "No components for this level. Add one or copy from Default."
                  : "No components yet. Add CA1, CA2, CA3, Exam… summing to 100."}
              </p>
            )}
            {rows.map((r, i) => {
              const isInherited = classLevelId !== null && r.isDefault === true;
              return (
                <div key={r.id} className={cn("flex items-center gap-2", isInherited && "opacity-60")}>
                  <input
                    aria-label="component name"
                    value={r.name}
                    placeholder="e.g. CA1"
                    disabled={!!classLevelId}
                    onChange={(e) => updateLocal(i, { name: e.target.value })}
                    className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small disabled:cursor-not-allowed"
                  />
                  <input
                    aria-label="max score"
                    type="number"
                    value={r.maxScore}
                    disabled={!!classLevelId}
                    onChange={(e) => updateLocal(i, { maxScore: Number(e.target.value) })}
                    className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small disabled:cursor-not-allowed"
                  />
                  {isInherited ? (
                    <Button variant="outline" size="sm" onClick={() => overrideRow(r)}>
                      Override for this level
                    </Button>
                  ) : classLevelId ? null : (
                    <Button variant="ghost" size="sm" onClick={() => removeLocalRow(i)} aria-label="remove">✕</Button>
                  )}
                </div>
              );
            })}
            {!classLevelId && (
              <Button variant="ghost" size="sm" onClick={addRow} className="self-start mt-1">+ Add component</Button>
            )}
            {classLevelId && (
              <p className="text-caption text-ink-500 mt-2">
                To modify this level&apos;s format, use &apos;Apply to levels&apos; below to copy from another level.
              </p>
            )}
          </div>
        )}
        {!classLevelId && (
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={saveDefault} disabled={!valid || saving}>Save components</Button>
            {msg && <span className="text-caption text-ink-500">{msg}</span>}
          </div>
        )}
        {classLevelId && msg && (
          <div className="mt-3">
            <span className="text-caption text-ink-500">{msg}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------------- Subject assignments ---------------- */
function SubjectAssignmentsPanel() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [classId, setClassId] = useState("");
  const [yearId, setYearId] = useState("");
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cs, ys, ss, st] = await Promise.all([
        api.listClasses(), api.listAcademicYears(), api.listSubjects(), api.listStaff(),
      ]);
      setClasses(cs);
      setYears(ys.map((y) => ({ id: y.id, name: y.name })));
      setSubjects(ss.map((s) => ({ id: s.id, name: s.name })));
      setStaff(st);
      if (cs[0]) setClassId(cs[0].id);
      if (ys[0]) setYearId(ys[0].id);
    })();
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!classId || !yearId) return;
    setAssignments(await api.listSubjectAssignments(classId, yearId));
  }, [classId, yearId]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const add = async () => {
    setMsg(null);
    if (!subjectId || !staffId) return;
    try {
      await api.createSubjectAssignment({ subjectId, classId, staffId, academicYearId: yearId });
      setSubjectId(""); setStaffId("");
      await loadAssignments();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not assign.");
    }
  };
  const remove = async (id: string) => {
    setMsg(null);
    try {
      await api.deleteSubjectAssignment(id);
      await loadAssignments();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not remove assignment.");
    }
  };
  const reassign = async (id: string, newStaffId: string) => {
    setMsg(null);
    try {
      await api.updateSubjectAssignment(id, newStaffId);
      await loadAssignments();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not reassign teacher.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Subject assignments</span>
      </CardHeader>
      <CardBody>
        <div className="flex gap-3 flex-wrap mb-4">
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Academic year
            <select value={yearId} onChange={(e) => setYearId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          {assignments.length === 0 && (
            <p className="text-small text-ink-500">No subjects assigned to this class for the selected year.</p>
          )}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border-b border-ink-100 dark:border-white/10 pb-2">
              <span className="text-small text-ink-1000 dark:text-ink-100">{a.subject?.name}</span>
              <div className="flex items-center gap-3">
                <select
                  aria-label={`teacher for ${a.subject?.name ?? "subject"}`}
                  value={a.staffId}
                  onChange={(e) => reassign(a.id, e.target.value)}
                  className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" onClick={() => remove(a.id)} aria-label="remove">✕</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end gap-2 flex-wrap">
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Subject
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              <option value="">Select…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Teacher
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              <option value="">Select…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
          </label>
          <Button onClick={add} disabled={!subjectId || !staffId}>Assign</Button>
          {msg && <span className="text-caption text-error">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
