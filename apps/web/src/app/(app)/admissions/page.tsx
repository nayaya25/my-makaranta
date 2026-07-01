"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  Spinner,
  Switch,
  cn,
} from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type Applicant,
  type ApplicationStatus,
  type ApplicantStats,
  type AcademicYear,
  type ClassLevel,
} from "@/lib/api";
import { ClipboardList } from "lucide-react";
import { ApplicantDetail } from "./ApplicantDetail";
import { NewApplicantForm } from "./NewApplicantForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD_COLUMNS: ApplicationStatus[] = [
  "APPLIED",
  "UNDER_REVIEW",
  "WAITLISTED",
  "OFFERED",
  "ACCEPTED",
  "ENROLLED",
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  UNDER_REVIEW: "Under Review",
  WAITLISTED: "Waitlisted",
  OFFERED: "Offered",
  ACCEPTED: "Accepted",
  ENROLLED: "Enrolled",
  REJECTED: "Rejected",
};

const STATUS_TONE: Record<
  ApplicationStatus,
  "neutral" | "info" | "warning" | "brand" | "success" | "error"
> = {
  APPLIED: "neutral",
  UNDER_REVIEW: "info",
  WAITLISTED: "warning",
  OFFERED: "brand",
  ACCEPTED: "success",
  ENROLLED: "success",
  REJECTED: "error",
};

const SOURCE_TONE: Record<string, "neutral" | "info"> = {
  PUBLIC: "info",
  STAFF: "neutral",
};

// ─── ApplicantCard ─────────────────────────────────────────────────────────────

function ApplicantCard({
  applicant,
  levelMap,
  onClick,
}: {
  applicant: Applicant;
  levelMap: Map<string, string>;
  onClick: () => void;
}) {
  const name = `${applicant.firstName} ${applicant.lastName}`;
  const level = levelMap.get(applicant.desiredClassLevelId) ?? "—";
  const date = new Date(applicant.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });

  return (
    <Card
      interactive
      elevation="xs"
      className="p-3 cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Open ${name}`}
    >
      <p className="text-[13px] font-semibold text-ink-1000 dark:text-ink-100 truncate">{name}</p>
      <p className="mt-0.5 text-caption text-ink-500 truncate">{level}</p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Badge tone={SOURCE_TONE[applicant.source] ?? "neutral"} className="text-[10px] px-1.5 py-0.5">
          {applicant.source === "PUBLIC" ? "Public" : "Staff"}
        </Badge>
        <span className="text-[10px] text-ink-400">{date}</span>
      </div>
    </Card>
  );
}

// ─── BoardColumn ──────────────────────────────────────────────────────────────

function BoardColumn({
  status,
  applicants,
  levelMap,
  onCardClick,
}: {
  status: ApplicationStatus;
  applicants: Applicant[];
  levelMap: Map<string, string>;
  onCardClick: (id: string) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {STATUS_LABEL[status]}
        </span>
        <Badge tone={STATUS_TONE[status]} className="tabular-nums text-[10px] px-1.5 py-0.5">
          {applicants.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-[120px]">
        {applicants.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-ink-1000/[0.08] dark:border-white/10">
            <span className="text-caption text-ink-400">Empty</span>
          </div>
        )}
        {applicants.map((a) => (
          <ApplicantCard
            key={a.id}
            applicant={a}
            levelMap={levelMap}
            onClick={() => onCardClick(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdmissionsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [stats, setStats] = useState<ApplicantStats>({});
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showRejected, setShowRejected] = useState(false);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Lookup maps built from fetched reference data
  const levelMap = new Map(classLevels.map((cl) => [cl.id, cl.name]));
  const yearMap = new Map(academicYears.map((ay) => [ay.id, ay.name]));
  // yearMap used indirectly via academicYears prop to ApplicantDetail
  void yearMap;

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [apps, s, levels, years] = await Promise.all([
        api.listApplicants(),
        api.admissionsStats(),
        api.listClassLevels(),
        api.listAcademicYears(),
      ]);
      setApplicants(apps);
      setStats(s);
      setClassLevels(levels);
      setAcademicYears(years);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load admissions data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Derived: group by status
  const grouped = new Map<ApplicationStatus, Applicant[]>();
  const allStatuses: ApplicationStatus[] = [
    "APPLIED",
    "UNDER_REVIEW",
    "WAITLISTED",
    "OFFERED",
    "ACCEPTED",
    "ENROLLED",
    "REJECTED",
  ];
  for (const s of allStatuses) grouped.set(s, []);
  for (const a of applicants) {
    grouped.get(a.status)?.push(a);
  }

  const visibleColumns: ApplicationStatus[] = showRejected
    ? [...BOARD_COLUMNS, "REJECTED"]
    : BOARD_COLUMNS;

  const totalActive =
    (stats.APPLIED ?? 0) +
    (stats.UNDER_REVIEW ?? 0) +
    (stats.WAITLISTED ?? 0) +
    (stats.OFFERED ?? 0) +
    (stats.ACCEPTED ?? 0);

  function handleTransitioned(updated: Applicant) {
    setApplicants((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  function handleAdded(a: Applicant) {
    setApplicants((prev) => [a, ...prev]);
    setStats((s) => ({ ...s, APPLIED: (s.APPLIED ?? 0) + 1 }));
  }

  return (
    <PageContainer className="max-w-none px-5 py-8 sm:px-6">
      <PageHeader
        title="Admissions"
        description={
          loading
            ? undefined
            : `${totalActive} active applicant${totalActive === 1 ? "" : "s"} · ${stats.ENROLLED ?? 0} enrolled`
        }
        actions={
          <>
            <div className="flex items-center gap-2 text-small text-ink-500">
              <Switch
                id="show-rejected"
                checked={showRejected}
                onCheckedChange={setShowRejected}
              />
              <label htmlFor="show-rejected" className="cursor-pointer select-none">
                Show rejected
              </label>
            </div>
            <Button onClick={() => setNewFormOpen(true)}>New applicant</Button>
          </>
        }
      />

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && <ErrorState description={loadError} onRetry={load} />}

      {!loading && !loadError && applicants.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={26} />}
          title="No applicants yet"
          description="Add the first applicant or share your public application form."
          action={<Button onClick={() => setNewFormOpen(true)}>New applicant</Button>}
        />
      )}

      {!loading && !loadError && applicants.length > 0 && (
        <div
          className={cn(
            "flex gap-4 overflow-x-auto pb-6",
            // horizontal scroll container — let it grow wider than max-w
          )}
        >
          {visibleColumns.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              applicants={grouped.get(status) ?? []}
              levelMap={levelMap}
              onCardClick={(id) => {
                setSelectedId(id);
                setDetailOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* New applicant dialog */}
      <NewApplicantForm
        open={newFormOpen}
        onOpenChange={setNewFormOpen}
        onAdded={handleAdded}
        classLevels={classLevels}
        academicYears={academicYears}
      />

      {/* Detail sheet */}
      <ApplicantDetail
        applicantId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        academicYears={academicYears}
        levelMap={levelMap}
        onTransitioned={handleTransitioned}
      />
    </PageContainer>
  );
}
