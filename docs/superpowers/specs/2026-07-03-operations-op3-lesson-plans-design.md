# Operations OP-3 — Lesson Plans — Design Spec

> **Status:** Approved (2026-07-03) · **Workstream 1 (Operations), sub-project 3 of 3** (Admissions ✓ → Timetable ✓ → Lesson Plans). Completes Operations.
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let teachers author weekly lesson plans for the subjects/classes they teach, submit them for review, and have a reviewer (principal/exam officer) approve or return them with a note — a real oversight loop. Beats SAFSIMS with structured plan fields + an explicit submit/approve workflow.

## Context (existing code this builds on)

- `SubjectAssignment` `{schoolId, subjectId, classId, staffId, academicYearId}` `@@unique([subjectId, classId, academicYearId])` pairs a subject + teacher + class for a year. A lesson plan hangs off one of these.
- `Term` `{schoolId, academicYearId, number, startDate, endDate, isCurrent}` — no "week" concept; week count is derived from `startDate`/`endDate`.
- A teacher is a `Staff` row; `SubjectAssignment.staffId → Staff`.
- **Acting-staff resolution** (established in `staff-access.service.ts`): `TenantContext.current()?.userId` → `prisma.user.findFirst({ where: { id } })`; when `user.identityType === "STAFF"`, `user.identityId` is the caller's `Staff.id`. Use this to enforce plan ownership.
- Permission RBAC with role presets (`prisma/seed-roles.ts`) + a permission catalog (`prisma/seed.ts`). Guards: `JwtAuthGuard` + `PermissionGuard` + `@RequirePermissions(...)`.
- New tenant tables follow the assessment precedent (middleware + explicit scoping, **no per-table RLS**). Build invariant: no `apps/api/src/` import from top-level `prisma/`; prod build must emit `dist/main.js`.
- Prior workstreams established the guarded-transition + audit pattern (OP-1 admissions) and the per-cell upsert pattern (OP-2 timetable).

## Decisions (locked)

1. **Cadence:** one plan per `(SubjectAssignment, Term, weekNumber)` — weekly scheme-of-work.
2. **Content:** light structured fields — `topic`, `objectives`, `activities`, `resources`, `assessment`, `notes` (all optional text).
3. **Workflow:** `DRAFT → SUBMITTED → APPROVED | RETURNED`; `RETURNED → SUBMITTED`; guarded transitions. `APPROVED` locks content.
4. **Roles:** the owning teacher authors/edits/submits their own plans (ownership via `SubjectAssignment.staffId` = caller's staff id). A reviewer (new perm `lessonplans.review`) reads all + approves/returns. Author capability = new perm `lessonplans.record`.

## Data model (additive — no existing model changes)

```prisma
enum LessonPlanStatus { DRAFT SUBMITTED APPROVED RETURNED }

model LessonPlan {
  id                  String            @id @default(cuid())
  schoolId            String
  school              School            @relation(fields: [schoolId], references: [id])
  subjectAssignmentId String
  subjectAssignment   SubjectAssignment @relation(fields: [subjectAssignmentId], references: [id], onDelete: Cascade)
  termId              String
  term                Term              @relation(fields: [termId], references: [id])
  weekNumber          Int
  topic               String?
  objectives          String?
  activities          String?
  resources           String?
  assessment          String?
  notes               String?
  status              LessonPlanStatus  @default(DRAFT)
  reviewNote          String?
  reviewedByStaffId   String?
  submittedAt         DateTime?
  reviewedAt          DateTime?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  @@unique([subjectAssignmentId, termId, weekNumber])
  @@index([schoolId, termId])
}
```

- Back-relations: `School { lessonPlans LessonPlan[] }`, `SubjectAssignment { lessonPlans LessonPlan[] }`, `Term { lessonPlans LessonPlan[] }`.
- Add `"LessonPlan"` to `TENANT_MODELS`. Migration name: `lesson_plans`.
- On write, validate `term.academicYearId === subjectAssignment.academicYearId` (else `BadRequestException`) and `1 ≤ weekNumber ≤ weeksInTerm` where `weeksInTerm = clamp(ceil((endDate−startDate)/7 days), 1, 20)`.

## Workflow & guards

Allowed transitions (anything else → `BadRequestException`):

| From | To | Actor |
|---|---|---|
| `DRAFT` | `SUBMITTED` | owner |
| `RETURNED` | `SUBMITTED` | owner |
| `SUBMITTED` | `APPROVED` | reviewer (locks) |
| `SUBMITTED` | `RETURNED` | reviewer (`note` required) |
| `APPROVED` | (terminal) | — |

- **Ownership:** editing fields + `submit` require the caller's resolved `Staff.id` to equal the plan's `subjectAssignment.staffId`; else `ForbiddenException`. Editing is allowed only when status ∈ {`DRAFT`, `RETURNED`}.
- **Review:** `review` (approve/return) requires `lessonplans.review`; sets `reviewedByStaffId`, `reviewedAt`, and (on return) `reviewNote` + reopens editing. Reviewers may read any plan in the school; a review action does not require ownership.
- `APPROVED` → content immutable (edit/submit rejected).

## API (new `lesson-plans` module)

All authenticated. Author routes require `lessonplans.record`; review routes require `lessonplans.review`.

- `GET /v1/lesson-plans/assignment/:assignmentId?termId=` — the week list for an assignment+term. Owner sees own; a holder of `lessonplans.review` may read any (assignment validated to the school).
- `GET /v1/lesson-plans/:id` — one plan (owner or reviewer).
- `PUT /v1/lesson-plans` — `{subjectAssignmentId, termId, weekNumber, topic?, objectives?, activities?, resources?, assessment?, notes?}` — upsert the `(assignment, term, week)` plan; owner only; only when status ∈ {DRAFT, RETURNED} (or on first create). Validates school ownership of the assignment, year consistency, week bounds.
- `POST /v1/lesson-plans/:id/submit` — owner; DRAFT|RETURNED → SUBMITTED (`submittedAt`).
- `POST /v1/lesson-plans/:id/review` — `{decision: "APPROVED" | "RETURNED", note?}`; `lessonplans.review`; SUBMITTED → decision; `note` required when RETURNED.
- `GET /v1/lesson-plans/review-queue?termId=` — `lessonplans.review`; SUBMITTED plans for the school (optionally a term), with subject/class/teacher/week for the queue.

Permission wiring: add `lessonplans.record` + `lessonplans.review` to the catalog (`prisma/seed.ts`) and presets (`prisma/seed-roles.ts`): `teacher` → `lessonplans.record`; `principal` + `exam_officer` → `lessonplans.review` (+ `lessonplans.record` where they also teach); `proprietor`/`director` are ALL.

## Web

- **Teacher — "Lesson Plans"** (`(app)/lesson-plans`): pick one of my subject-assignments (from `listSubjectAssignments` filtered to my staff) + a term → a week list (1..weeksInTerm) with per-week status badges. Open a week → editor with the structured fields, **Save draft** + **Submit**. When `RETURNED`, show the reviewer's `reviewNote` prominently and allow edits; when `APPROVED`, render read-only.
- **Reviewer — review queue** (`(app)/lesson-plans/review`): list submitted plans (subject · class · teacher · week) → open a plan → **Approve** or **Return** (with a required note).
- Sidebar entry gated by `lessonplans.record` or `lessonplans.review`. `@mymakaranta/ui`, teal/lime, consistent with existing screens; loading/empty/locked states.

## Testing

- **Model:** create + `@@unique([subjectAssignmentId, termId, weekNumber])`; tenant read isolation.
- **Upsert/validation:** `PUT` creates then updates the same week (one row); `term` from a different academic year than the assignment → rejected; `weekNumber` out of `1..weeksInTerm` → rejected.
- **Ownership:** a non-owner teacher editing/submitting another teacher's plan → `ForbiddenException`; the owner succeeds.
- **Workflow:** legal transitions succeed; illegal (`DRAFT→APPROVED`, `APPROVED→*`) rejected; `review` RETURNED without a note → rejected; RETURNED reopens editing; APPROVED locks edits.
- **Review perm:** a caller without `lessonplans.review` calling `review`/`review-queue` → forbidden (guard); with it, sees all school submissions only.
- **Tenant/IDOR:** foreign `subjectAssignmentId`/`termId`/plan id → rejected; review-queue scoped to the school.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- File attachments to plans.
- Copy/duplicate a week (or clone last term's scheme of work).
- Scheme-of-work template library / custom templates.
- Comment threads (only a single `reviewNote`).
- Per-day (within-week) breakdown.
- Student- or parent-visible plans.
- HOD/department-scoped review (v1: any `lessonplans.review` holder reviews school-wide).
