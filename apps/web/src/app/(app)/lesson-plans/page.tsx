"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Lock } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageContainer,
  PageHeader,
  Spinner,
  Textarea,
  cn,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type LessonPlan,
  type LessonPlanStatus,
  type MyProfile,
  type Staff,
  type SubjectAssignment,
} from "@/lib/api";

interface TermOpt {
  id: string;
  label: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
}

const STATUS_TONE: Record<LessonPlanStatus, "neutral" | "info" | "success" | "warning"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  RETURNED: "warning",
};

const STATUS_LABEL: Record<LessonPlanStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  RETURNED: "Returned",
};

/** Same rule as the API: ceil(daysBetween / 7), clamped 1..20. */
function weeksInTerm(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  const weeks = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(20, Math.max(1, weeks));
}

interface EditorState {
  topic: string;
  objectives: string;
  activities: string;
  resources: string;
  assessment: string;
  notes: string;
}

const EMPTY_EDITOR: EditorState = {
  topic: "",
  objectives: "",
  activities: "",
  resources: "",
  assessment: "",
  notes: "",
};

function toEditor(plan: LessonPlan | undefined): EditorState {
  if (!plan) return EMPTY_EDITOR;
  return {
    topic: plan.topic ?? "",
    objectives: plan.objectives ?? "",
    activities: plan.activities ?? "",
    resources: plan.resources ?? "",
    assessment: plan.assessment ?? "",
    notes: plan.notes ?? "",
  };
}

export default function LessonPlansPage() {
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);

  const [assignmentId, setAssignmentId] = useState("");
  const [termId, setTermId] = useState("");

  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

  const [initLoading, setInitLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"idle" | "draft" | "submit">("idle");
  const [error, setError] = useState<string | null>(null);
  const [noStaffRecord, setNoStaffRecord] = useState(false);

  // ── Bootstrap: resolve my staff, my assignments, academic years/terms ──────
  useEffect(() => {
    void (async () => {
      setInitLoading(true);
      setError(null);
      try {
        const [profile, staffList, classes, yearList] = await Promise.all([
          api.getMyProfile().catch((): MyProfile | null => null),
          api.listStaff(),
          api.listClasses(),
          api.listAcademicYears(),
        ]);

        setYears(yearList);
        const ts: TermOpt[] = yearList.flatMap((y) =>
          (y.terms ?? [])
            .filter((t) => t.id)
            .map((t) => ({
              id: t.id!,
              label: `${y.name} · Term ${t.number}`,
              isCurrent: !!t.isCurrent,
              startDate: t.startDate,
              endDate: t.endDate,
            })),
        );
        setTerms(ts);
        const currentTerm = ts.find((t) => t.isCurrent) ?? ts[0];
        if (currentTerm) setTermId(currentTerm.id);

        const mine = profile?.staffNo
          ? staffList.find((s: Staff) => s.staffNo === profile.staffNo)
          : undefined;

        if (!mine) {
          setNoStaffRecord(true);
          return;
        }
        setMyStaffId(mine.id);

        // Gather this staff member's subject-assignments across all classes,
        // for every academic year (assignments are scoped per class+year).
        const perClassPerYear = await Promise.all(
          classes.flatMap((c) =>
            yearList.map((y) =>
              api.listSubjectAssignments(c.id, y.id).catch(() => [] as SubjectAssignment[]),
            ),
          ),
        );
        const mineAssignments = perClassPerYear
          .flat()
          .filter((a) => a.staffId === mine.id);
        setAssignments(mineAssignments);
        if (mineAssignments[0]) setAssignmentId(mineAssignments[0].id);
      } catch {
        setError("Could not load your teaching assignments.");
      } finally {
        setInitLoading(false);
      }
    })();
  }, []);

  const selectedTerm = terms.find((t) => t.id === termId);
  const selectedAssignment = assignments.find((a) => a.id === assignmentId);

  const totalWeeks = selectedTerm ? weeksInTerm(selectedTerm.startDate, selectedTerm.endDate) : 0;

  const loadPlans = useCallback(async (aId: string, tId: string) => {
    if (!aId || !tId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.getLessonPlans(aId, tId);
      setPlans(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load lesson plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (assignmentId && termId && !initLoading) {
      setSelectedWeek(null);
      void loadPlans(assignmentId, termId);
    }
  }, [assignmentId, termId, initLoading, loadPlans]);

  const planForWeek = useCallback(
    (week: number) => plans.find((p) => p.weekNumber === week),
    [plans],
  );

  const openWeek = (week: number) => {
    setSelectedWeek(week);
    setEditor(toEditor(planForWeek(week)));
    setError(null);
  };

  const closeWeek = () => {
    setSelectedWeek(null);
    setEditor(EMPTY_EDITOR);
  };

  const currentPlan = selectedWeek !== null ? planForWeek(selectedWeek) : undefined;
  const isLocked = currentPlan?.status === "APPROVED" || currentPlan?.status === "SUBMITTED";
  const isReadOnly = currentPlan?.status === "APPROVED";

  const saveDraft = async () => {
    if (selectedWeek === null || !assignmentId || !termId) return;
    setSaving("draft");
    setError(null);
    try {
      const saved = await api.putLessonPlan({
        subjectAssignmentId: assignmentId,
        termId,
        weekNumber: selectedWeek,
        topic: editor.topic || undefined,
        objectives: editor.objectives || undefined,
        activities: editor.activities || undefined,
        resources: editor.resources || undefined,
        assessment: editor.assessment || undefined,
        notes: editor.notes || undefined,
      });
      setPlans((prev) => {
        const next = prev.filter((p) => p.weekNumber !== saved.weekNumber);
        next.push(saved);
        return next.sort((a, b) => a.weekNumber - b.weekNumber);
      });
      setEditor(toEditor(saved));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the draft.");
    } finally {
      setSaving("idle");
    }
  };

  const submit = async () => {
    if (!currentPlan) return;
    setSaving("submit");
    setError(null);
    try {
      const saved = await api.submitLessonPlan(currentPlan.id);
      setPlans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setEditor(toEditor(saved));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit the plan.");
    } finally {
      setSaving("idle");
    }
  };

  const selClass =
    "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  const weeks = useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => i + 1),
    [totalWeeks],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (initLoading) {
    return (
      <PageContainer>
        <PageHeader title="Lesson Plans" description="Author and submit your weekly lesson plans." />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (noStaffRecord) {
    return (
      <PageContainer>
        <PageHeader title="Lesson Plans" description="Author and submit your weekly lesson plans." />
        <EmptyState
          icon={<BookOpen size={28} />}
          title="No staff record found"
          description="Your account isn't linked to a staff record, so lesson plans can't be resolved."
        />
      </PageContainer>
    );
  }

  if (assignments.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Lesson Plans" description="Author and submit your weekly lesson plans." />
        <EmptyState
          icon={<BookOpen size={28} />}
          title="No subject assignments"
          description="You have no subject assignments yet. Ask an administrator to assign you to a class and subject."
        />
      </PageContainer>
    );
  }

  // Editor view for a selected week
  if (selectedWeek !== null) {
    return (
      <PageContainer>
        <PageHeader
          title={`Week ${selectedWeek}`}
          description={
            selectedAssignment
              ? `${selectedAssignment.subject?.name ?? "Subject"} · ${selectedAssignment.class?.name ?? "Class"} · ${selectedTerm?.label ?? ""}`
              : undefined
          }
          actions={
            <Button variant="outline" size="sm" onClick={closeWeek}>
              <ChevronLeft size={16} className="mr-1" />
              Back to weeks
            </Button>
          }
        />

        {error && <p className="mb-4 text-small text-error">{error}</p>}

        <div className="mb-4 flex items-center gap-3">
          <Badge tone={STATUS_TONE[currentPlan?.status ?? "DRAFT"]}>
            {STATUS_LABEL[currentPlan?.status ?? "DRAFT"]}
          </Badge>
          {isReadOnly && (
            <span className="flex items-center gap-1 text-caption text-ink-500">
              <Lock size={13} /> Approved — read-only.
            </span>
          )}
          {currentPlan?.status === "SUBMITTED" && (
            <span className="flex items-center gap-1 text-caption text-ink-500">
              <Lock size={13} /> Submitted — awaiting review.
            </span>
          )}
        </div>

        {currentPlan?.status === "RETURNED" && currentPlan.reviewNote && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small text-warning-700 dark:text-warning-300">
            <p className="font-semibold">Returned for changes</p>
            <p className="mt-1">{currentPlan.reviewNote}</p>
          </div>
        )}

        <Card className="p-5">
          <div className="grid gap-4">
            <Field label="Topic">
              <Textarea
                value={editor.topic}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, topic: e.target.value }))}
                rows={2}
              />
            </Field>
            <Field label="Objectives">
              <Textarea
                value={editor.objectives}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, objectives: e.target.value }))}
                rows={3}
              />
            </Field>
            <Field label="Activities">
              <Textarea
                value={editor.activities}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, activities: e.target.value }))}
                rows={3}
              />
            </Field>
            <Field label="Resources">
              <Textarea
                value={editor.resources}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, resources: e.target.value }))}
                rows={2}
              />
            </Field>
            <Field label="Assessment">
              <Textarea
                value={editor.assessment}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, assessment: e.target.value }))}
                rows={2}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={editor.notes}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => setEditor((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </Field>
          </div>

          {!isLocked && (
            <div className="mt-5 flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => void saveDraft()}
                disabled={saving !== "idle"}
              >
                {saving === "draft" ? "Saving…" : "Save draft"}
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={saving !== "idle" || !currentPlan}
              >
                {saving === "submit" ? "Submitting…" : "Submit"}
              </Button>
              {!currentPlan && (
                <span className="text-caption text-ink-500">Save a draft before submitting.</span>
              )}
            </div>
          )}
        </Card>
      </PageContainer>
    );
  }

  // Week list view
  return (
    <PageContainer>
      <PageHeader title="Lesson Plans" description="Author and submit your weekly lesson plans." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Class · Subject
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            className={selClass}
          >
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.class?.name ?? "Class"} · {a.subject?.name ?? "Subject"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Term
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className={selClass}
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !selectedTerm ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="No terms configured"
          description="Create an academic year with terms in Settings before authoring lesson plans."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-ink-1000/[0.06] dark:divide-white/[0.06]">
            {weeks.map((week) => {
              const plan = planForWeek(week);
              const status = plan?.status ?? "DRAFT";
              return (
                <button
                  key={week}
                  type="button"
                  onClick={() => openWeek(week)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-left text-small transition-colors",
                    "hover:bg-ink-1000/[0.03] dark:hover:bg-white/[0.04]",
                  )}
                >
                  <span className="font-medium text-ink-1000 dark:text-ink-100">
                    Week {week}
                    {plan?.topic ? (
                      <span className="ml-2 font-normal text-ink-500">{plan.topic}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {plan?.status === "RETURNED" && (
                      <span className="text-caption text-warning-700 dark:text-warning-300">
                        Needs changes
                      </span>
                    )}
                    <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
