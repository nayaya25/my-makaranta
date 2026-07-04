"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ClipboardList, XCircle } from "lucide-react";
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
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AcademicYear,
  type LessonPlan,
  type LessonPlanQueueItem,
} from "@/lib/api";

interface TermOpt {
  id: string;
  label: string;
  isCurrent: boolean;
}

export default function LessonPlanReviewPage() {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState<string>("");

  const [queue, setQueue] = useState<LessonPlanQueueItem[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [returnNote, setReturnNote] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [acting, setActing] = useState<"idle" | "approve" | "return">("idle");

  const loadQueue = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.lessonPlanReviewQueue(t || undefined);
      setQueue(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Bootstrap: academic years/terms + the initial (unfiltered) queue ───────
  useEffect(() => {
    void (async () => {
      setInitLoading(true);
      setError(null);
      try {
        const yearList = await api.listAcademicYears();
        const ts: TermOpt[] = yearList.flatMap((y: AcademicYear) =>
          (y.terms ?? [])
            .filter((t) => t.id)
            .map((t) => ({
              id: t.id!,
              label: `${y.name} · Term ${t.number}`,
              isCurrent: !!t.isCurrent,
            })),
        );
        setTerms(ts);
        await loadQueue("");
      } catch {
        setError("Could not load the review queue.");
      } finally {
        setInitLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initLoading) void loadQueue(termId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, initLoading]);

  const openPlan = async (id: string) => {
    setSelectedId(id);
    setSelectedPlan(null);
    setPlanError(null);
    setShowReturnForm(false);
    setReturnNote("");
    setPlanLoading(true);
    try {
      const plan = await api.getLessonPlan(id);
      setSelectedPlan(plan);
    } catch (e) {
      setPlanError(e instanceof ApiError ? e.message : "Could not load the lesson plan.");
    } finally {
      setPlanLoading(false);
    }
  };

  const closePlan = () => {
    setSelectedId(null);
    setSelectedPlan(null);
    setPlanError(null);
    setShowReturnForm(false);
    setReturnNote("");
  };

  const approve = async () => {
    if (!selectedId) return;
    setActing("approve");
    setPlanError(null);
    try {
      await api.reviewLessonPlan(selectedId, { decision: "APPROVED" });
      closePlan();
      await loadQueue(termId);
    } catch (e) {
      setPlanError(e instanceof ApiError ? e.message : "Could not approve the plan.");
    } finally {
      setActing("idle");
    }
  };

  const submitReturn = async () => {
    if (!selectedId) return;
    if (!returnNote.trim()) {
      setPlanError("A note is required when returning a plan.");
      return;
    }
    setActing("return");
    setPlanError(null);
    try {
      await api.reviewLessonPlan(selectedId, { decision: "RETURNED", note: returnNote.trim() });
      closePlan();
      await loadQueue(termId);
    } catch (e) {
      setPlanError(e instanceof ApiError ? e.message : "Could not return the plan.");
    } finally {
      setActing("idle");
    }
  };

  const selClass =
    "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  // ── Render ──────────────────────────────────────────────────────────────

  if (initLoading) {
    return (
      <PageContainer>
        <PageHeader title="Review Plans" description="Approve or return submitted lesson plans." />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  // Plan detail view
  if (selectedId) {
    const plan = selectedPlan;
    const queueItem = queue.find((q) => q.id === selectedId);
    return (
      <PageContainer>
        <PageHeader
          title={queueItem ? `Week ${queueItem.weekNumber}` : "Lesson plan"}
          description={
            queueItem
              ? `${queueItem.subjectName} · ${queueItem.className} · ${queueItem.teacherName}`
              : undefined
          }
          actions={
            <Button variant="outline" size="sm" onClick={closePlan}>
              <ChevronLeft size={16} className="mr-1" />
              Back to queue
            </Button>
          }
        />

        {planError && <p className="mb-4 text-small text-error">{planError}</p>}

        {planLoading || !plan ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <Badge tone="info">Submitted</Badge>
            </div>

            <Card className="p-5">
              <div className="grid gap-4">
                <Field label="Topic">
                  <Textarea value={plan.topic ?? ""} readOnly disabled rows={2} />
                </Field>
                <Field label="Objectives">
                  <Textarea value={plan.objectives ?? ""} readOnly disabled rows={3} />
                </Field>
                <Field label="Activities">
                  <Textarea value={plan.activities ?? ""} readOnly disabled rows={3} />
                </Field>
                <Field label="Resources">
                  <Textarea value={plan.resources ?? ""} readOnly disabled rows={2} />
                </Field>
                <Field label="Assessment">
                  <Textarea value={plan.assessment ?? ""} readOnly disabled rows={2} />
                </Field>
                <Field label="Notes">
                  <Textarea value={plan.notes ?? ""} readOnly disabled rows={2} />
                </Field>
              </div>

              {showReturnForm ? (
                <div className="mt-5 border-t border-ink-1000/[0.06] pt-5 dark:border-white/[0.06]">
                  <Field label="Return note (required)">
                    <Textarea
                      value={returnNote}
                      onChange={(e) => setReturnNote(e.target.value)}
                      rows={3}
                      placeholder="Explain what needs to change…"
                    />
                  </Field>
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowReturnForm(false);
                        setReturnNote("");
                        setPlanError(null);
                      }}
                      disabled={acting !== "idle"}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void submitReturn()}
                      disabled={acting !== "idle" || !returnNote.trim()}
                    >
                      {acting === "return" ? "Returning…" : "Confirm return"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowReturnForm(true)}
                    disabled={acting !== "idle"}
                  >
                    <XCircle size={16} className="mr-1" />
                    Return
                  </Button>
                  <Button onClick={() => void approve()} disabled={acting !== "idle"}>
                    <CheckCircle2 size={16} className="mr-1" />
                    {acting === "approve" ? "Approving…" : "Approve"}
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </PageContainer>
    );
  }

  // Queue list view
  return (
    <PageContainer>
      <PageHeader title="Review Plans" description="Approve or return submitted lesson plans." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small text-ink-500">
          Term
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className={selClass}
          >
            <option value="">All terms</option>
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
      ) : queue.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="Nothing to review"
          description="No submitted lesson plans are waiting for review."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-ink-1000/[0.06] dark:divide-white/[0.06]">
            {queue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openPlan(item.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-small transition-colors hover:bg-ink-1000/[0.03] dark:hover:bg-white/[0.04]"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-ink-1000 dark:text-ink-100">
                    {item.subjectName} · {item.className}
                  </span>
                  <span className="text-caption text-ink-500">
                    {item.teacherName} · Week {item.weekNumber}
                  </span>
                </span>
                <Badge tone="info">Submitted</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
