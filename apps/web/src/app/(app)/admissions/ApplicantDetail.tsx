"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Badge,
  Field,
  Input,
  Select,
  Sheet,
  Spinner,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type Applicant,
  type ApplicationStatus,
  type AcademicYear,
  type Class,
} from "@/lib/api";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_TONE: Record<ApplicationStatus, "neutral" | "info" | "warning" | "brand" | "success" | "error"> = {
  APPLIED: "neutral",
  UNDER_REVIEW: "info",
  WAITLISTED: "warning",
  OFFERED: "brand",
  ACCEPTED: "success",
  ENROLLED: "success",
  REJECTED: "error",
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  UNDER_REVIEW: "Under Review",
  WAITLISTED: "Waitlisted",
  OFFERED: "Offered",
  ACCEPTED: "Accepted",
  ENROLLED: "Enrolled",
  REJECTED: "Rejected",
};

const TRANSITION_LABEL: Partial<Record<ApplicationStatus, string>> = {
  UNDER_REVIEW: "Mark Under Review",
  OFFERED: "Make Offer",
  ACCEPTED: "Accept",
  WAITLISTED: "Waitlist",
  REJECTED: "Reject",
};

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ["UNDER_REVIEW", "REJECTED", "WAITLISTED"],
  UNDER_REVIEW: ["OFFERED", "REJECTED", "WAITLISTED"],
  WAITLISTED: ["UNDER_REVIEW", "OFFERED", "REJECTED"],
  OFFERED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  ENROLLED: [],
  REJECTED: [],
};

// ─── Enroll panel ─────────────────────────────────────────────────────────────

interface EnrollPanelProps {
  applicant: Applicant;
  academicYears: AcademicYear[];
  onEnrolled: (applicant: Applicant) => void;
}

interface FlatTerm {
  termId: string;
  label: string;
}

function EnrollPanel({ applicant, academicYears, onEnrolled }: EnrollPanelProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ studentId: string; admissionNo: string } | null>(null);

  useEffect(() => {
    api
      .listClasses()
      .then(setClasses)
      .catch(() => {})
      .finally(() => setClassesLoading(false));
  }, []);

  const flatTerms: FlatTerm[] = academicYears.flatMap((ay) =>
    ay.terms
      .filter((t) => !!t.id)
      .map((t) => ({ termId: t.id!, label: `Term ${t.number} – ${ay.name}` })),
  );

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.enrollApplicant(applicant.id, {
        classId,
        termId,
        admissionNo: admissionNo || undefined,
      });
      setResult(res);
      onEnrolled({ ...applicant, status: "ENROLLED", convertedStudentId: res.studentId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enrolment failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-small text-success">
        <p className="font-semibold">Enrolled successfully!</p>
        <p className="mt-1 text-ink-600 dark:text-ink-400">
          Admission no: <span className="font-mono font-semibold">{result.admissionNo}</span>
        </p>
        <Link
          href={`/students/${result.studentId}`}
          className="mt-2 inline-block font-semibold text-brand-700 underline hover:no-underline dark:text-brand-300"
        >
          View student profile →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleEnroll} className="flex flex-col gap-3">
      <p className="text-caption font-semibold uppercase tracking-wider text-ink-500">Enrol applicant</p>

      {error && (
        <p className="text-small text-error" role="alert">
          {error}
        </p>
      )}

      <Field label="Class" htmlFor="enr-class">
        {classesLoading ? (
          <div className="flex h-9 items-center">
            <Spinner size="sm" />
          </div>
        ) : (
          <Select.Root value={classId} onValueChange={setClassId}>
            <Select.Trigger id="enr-class">
              <Select.Value placeholder="Select class" />
            </Select.Trigger>
            <Select.Content>
              {classes.map((c) => (
                <Select.Item key={c.id} value={c.id}>
                  {c.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      </Field>

      <Field label="Term" htmlFor="enr-term">
        <Select.Root value={termId} onValueChange={setTermId}>
          <Select.Trigger id="enr-term">
            <Select.Value placeholder="Select term" />
          </Select.Trigger>
          <Select.Content>
            {flatTerms.map((ft) => (
              <Select.Item key={ft.termId} value={ft.termId}>
                {ft.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field>

      <Field label="Admission no. (optional override)" htmlFor="enr-admno">
        <Input
          id="enr-admno"
          value={admissionNo}
          onChange={(e) => setAdmissionNo(e.target.value)}
          placeholder="Auto-generated if blank"
          className="tabular-nums"
        />
      </Field>

      <Button
        type="submit"
        disabled={busy || !classId || !termId}
        className="mt-1 w-full"
      >
        {busy ? "Enrolling…" : "Confirm enrolment"}
      </Button>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  applicantId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  academicYears: AcademicYear[];
  levelMap: Map<string, string>;
  onTransitioned: (updated: Applicant) => void;
}

export function ApplicantDetail({
  applicantId,
  open,
  onOpenChange,
  academicYears,
  levelMap,
  onTransitioned,
}: Props) {
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [transitioning, setTransitioning] = useState<ApplicationStatus | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !applicantId) return;
    setApplicant(null);
    setFetchError(null);
    setReason("");
    setTransitionError(null);
    setLoading(true);
    api
      .getApplicant(applicantId)
      .then((a) => setApplicant(a))
      .catch((err) =>
        setFetchError(err instanceof ApiError ? err.message : "Could not load applicant."),
      )
      .finally(() => setLoading(false));
  }, [open, applicantId]);

  async function doTransition(to: ApplicationStatus) {
    if (!applicant) return;
    setTransitionError(null);
    setTransitioning(to);
    try {
      const updated = await api.transitionApplicant(applicant.id, {
        to,
        reason: reason || undefined,
      });
      setApplicant(updated);
      setReason("");
      onTransitioned(updated);
    } catch (err) {
      setTransitionError(err instanceof ApiError ? err.message : "Transition failed.");
    } finally {
      setTransitioning(null);
    }
  }

  const transitions = applicant ? ALLOWED_TRANSITIONS[applicant.status] : [];
  const showReason = transitions.includes("REJECTED") && applicant?.status !== "OFFERED";

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Content side="right" title="Applicant detail">
        {/* Header */}
        <Sheet.Header>
          <Sheet.Title>
            {applicant
              ? `${applicant.firstName} ${applicant.lastName}`
              : loading
                ? "Loading…"
                : "Applicant"}
          </Sheet.Title>
          {applicant && (
            <div className="flex items-center gap-2 pt-1">
              <Badge tone={STATUS_TONE[applicant.status]}>{STATUS_LABEL[applicant.status]}</Badge>
              <span className="text-caption text-ink-500">#{applicant.applicationNo}</span>
            </div>
          )}
        </Sheet.Header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          )}

          {!loading && fetchError && (
            <p className="text-small text-error" role="alert">
              {fetchError}
            </p>
          )}

          {!loading && !fetchError && applicant && (
            <>
              {/* Bio */}
              <section>
                <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-500">
                  Applicant
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small">
                  <div>
                    <dt className="text-ink-500">Full name</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.firstName}{" "}
                      {applicant.middleName ? `${applicant.middleName} ` : ""}
                      {applicant.lastName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Gender</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.gender === "M" ? "Male" : "Female"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Date of birth</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {fmt(applicant.dateOfBirth)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">State of origin</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.stateOfOrigin ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Desired level</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {levelMap.get(applicant.desiredClassLevelId) ?? applicant.desiredClassLevelId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Source</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.source === "PUBLIC" ? "Public form" : "Staff entry"}
                    </dd>
                  </div>
                  {applicant.previousSchool && (
                    <div className="col-span-2">
                      <dt className="text-ink-500">Previous school</dt>
                      <dd className="font-medium text-ink-1000 dark:text-ink-100">
                        {applicant.previousSchool}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-500">Applied</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {fmt(applicant.createdAt)}
                    </dd>
                  </div>
                  {applicant.decidedAt && (
                    <div>
                      <dt className="text-ink-500">Decided</dt>
                      <dd className="font-medium text-ink-1000 dark:text-ink-100">
                        {fmt(applicant.decidedAt)}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Guardian */}
              <section>
                <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-500">
                  Guardian
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-small">
                  <div>
                    <dt className="text-ink-500">Name</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.guardianName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Relation</dt>
                    <dd className="font-medium text-ink-1000 dark:text-ink-100">
                      {applicant.guardianRelation}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Phone</dt>
                    <dd className="font-medium tabular-nums text-ink-1000 dark:text-ink-100">
                      {applicant.guardianPhone}
                    </dd>
                  </div>
                  {applicant.guardianEmail && (
                    <div>
                      <dt className="text-ink-500">Email</dt>
                      <dd className="font-medium text-ink-1000 dark:text-ink-100">
                        {applicant.guardianEmail}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Review note / rejection reason */}
              {(applicant.reviewNote || applicant.rejectionReason) && (
                <section>
                  <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-500">
                    Notes
                  </p>
                  {applicant.reviewNote && (
                    <p className="text-small text-ink-700 dark:text-ink-300">{applicant.reviewNote}</p>
                  )}
                  {applicant.rejectionReason && (
                    <p className="mt-1 text-small text-error">{applicant.rejectionReason}</p>
                  )}
                </section>
              )}

              {/* Transitions */}
              {transitions.length > 0 && (
                <section>
                  <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-500">
                    Actions
                  </p>

                  {transitionError && (
                    <p className="mb-2 text-small text-error" role="alert">
                      {transitionError}
                    </p>
                  )}

                  {/* Reason field — show when REJECTED is a valid target */}
                  {showReason && (
                    <Field label="Reason (required for Reject)" htmlFor="ad-reason" className="mb-3">
                      <Input
                        id="ad-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional note / rejection reason"
                      />
                    </Field>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {transitions.map((to) => {
                      const label = TRANSITION_LABEL[to] ?? to;
                      const isReject = to === "REJECTED";
                      const disabled =
                        !!transitioning ||
                        (isReject && showReason && !reason);
                      return (
                        <Button
                          key={to}
                          variant={isReject ? "outline" : "primary"}
                          size="sm"
                          disabled={disabled}
                          onClick={() => doTransition(to)}
                        >
                          {transitioning === to ? "…" : label}
                        </Button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Enrol panel — only for ACCEPTED */}
              {applicant.status === "ACCEPTED" && (
                <section className="rounded-lg border border-ink-1000/[0.08] bg-ink-1000/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <EnrollPanel
                    applicant={applicant}
                    academicYears={academicYears}
                    onEnrolled={(updated) => {
                      setApplicant(updated);
                      onTransitioned(updated);
                    }}
                  />
                </section>
              )}

              {/* Already enrolled link */}
              {applicant.status === "ENROLLED" && applicant.convertedStudentId && (
                <Link
                  href={`/students/${applicant.convertedStudentId}`}
                  className="inline-flex items-center gap-1.5 text-small font-semibold text-brand-700 underline hover:no-underline dark:text-brand-300"
                >
                  View student profile →
                </Link>
              )}
            </>
          )}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
