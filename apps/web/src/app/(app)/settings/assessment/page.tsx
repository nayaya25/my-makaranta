"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, Spinner, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type SubjectAssignment,
  type Class,
} from "@/lib/api";
import { resolveGrade } from "@/lib/grade";

export default function AssessmentSettingsPage() {
  return (
    <div className="px-4 py-8 mx-auto max-w-4xl flex flex-col gap-8">
      <header>
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
          Assessment &amp; Grading
        </h1>
        <p className="text-small text-ink-500">
          Configure score components, grade boundaries, and teacher–subject assignments.
        </p>
      </header>
      <GradeBoundariesPanel />
      <AssessmentTypesPanel />
      <CorrectionsPanel />
      <SubjectAssignmentsPanel />
    </div>
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
function GradeBoundariesPanel() {
  const [rows, setRows] = useState<Array<{ grade: string; minScore: number; remark: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getGradeBoundaries();
      setRows(data.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const applyTemplate = async (template: "WAEC" | "NECO") => {
    setMsg(null);
    try {
      const data = await api.applyGradeTemplate(template);
      setRows(data.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not apply template.");
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putGradeBoundaries(rows.map((r, i) => ({ ...r, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<{ grade: string; minScore: number; remark: string }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { grade: "", minScore: 0, remark: "" }]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Grade boundaries</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => applyTemplate("WAEC")}>Apply WAEC</Button>
            <Button variant="outline" size="sm" onClick={() => applyTemplate("NECO")}>Apply NECO</Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-small text-ink-500">No grade boundaries yet. Apply WAEC to start, then edit.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label="grade" value={r.grade} onChange={(e) => update(i, { grade: e.target.value })}
                  className="h-9 w-20 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="min score" type="number" value={r.minScore}
                  onChange={(e) => update(i, { minScore: Number(e.target.value) })}
                  className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="remark" value={r.remark} onChange={(e) => update(i, { remark: e.target.value })}
                  className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
              </div>
            ))}
            <div className="flex items-center justify-between mt-2">
              <Button variant="ghost" size="sm" onClick={addRow}>+ Add band</Button>
              <span className="text-caption text-ink-500">
                Preview: 82 → {resolveGrade(82, rows)?.grade ?? "—"} · 58 → {resolveGrade(58, rows)?.grade ?? "—"}
              </span>
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={saving || rows.length === 0}>Save boundaries</Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------------- Assessment types ---------------- */
function AssessmentTypesPanel() {
  const [rows, setRows] = useState<Array<{ name: string; maxScore: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAssessmentTypes();
      setRows(data.map((t) => ({ name: t.name, maxScore: t.maxScore })));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((acc, r) => acc + (Number(r.maxScore) || 0), 0);
  const valid = total === 100 && rows.length > 0;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putAssessmentTypes(rows.map((r, i) => ({ ...r, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<{ name: string; maxScore: number }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { name: "", maxScore: 0 }]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Assessment components</span>
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
              <p className="text-small text-ink-500">No components yet. Add CA1, CA2, CA3, Exam… summing to 100.</p>
            )}
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label="component name" value={r.name} placeholder="e.g. CA1"
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="max score" type="number" value={r.maxScore}
                  onChange={(e) => update(i, { maxScore: Number(e.target.value) })}
                  className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRow} className="self-start mt-1">+ Add component</Button>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={!valid || saving}>Save components</Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
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
