# Operations OP-3 — Lesson Plans — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers author weekly lesson plans per subject-assignment, submit them, and a reviewer approves or returns them with a note — a guarded submit/approve workflow with structured plan fields.

**Architecture:** One new tenant model `LessonPlan` keyed `(subjectAssignment, term, weekNumber)` with a `status` enum guarded by a service-level allowed-transitions map. A `lesson-plans` NestJS module (author routes gated by `lessonplans.record`, review routes by `lessonplans.review`); ownership enforced by resolving the caller's `Staff.id` and matching `SubjectAssignment.staffId`. Web: a teacher authoring screen + a reviewer queue.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 15 (App Router) + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate every request-supplied id (subjectAssignmentId, termId, plan id) through a tenant-scoped model before write/return. Don't rely on `$use` inside `$transaction`/service tests — scope explicitly. (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **Build invariant:** NO file under `apps/api/src/` may import from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `apps/api/.env`.
- Windows: do NOT run `next build` or dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`. Reset DB before full runs: `prisma migrate reset --force --skip-seed --skip-generate`.
- `prisma migrate dev` needs a TTY here — hand-write migration SQL + `prisma migrate deploy` + `prisma generate`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Acting-staff resolution: `TenantContext.current()?.userId` → `prisma.user.findFirst({where:{id}})`; when `user.identityType === "STAFF"`, `user.identityId` is the caller's `Staff.id`.
- New tenant tables get NO per-table RLS (assessment precedent) — `$use` + explicit scoping.

---

### Task 1: Schema — `LessonPlan` + enum + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum + model + back-relations on `School`, `SubjectAssignment`, `Term`)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (add `"LessonPlan"` to `TENANT_MODELS`)
- Create: `apps/api/prisma/migrations/20260703120000_lesson_plans/migration.sql`
- Test: `apps/api/src/modules/lesson-plans/lesson-plan-model.spec.ts`

**Interfaces:**
- Produces: `prisma.lessonPlan` delegate; `LessonPlanStatus` enum `{DRAFT SUBMITTED APPROVED RETURNED}`.

- [ ] **Step 1: Add enum + model to `schema.prisma`** (exact fields from the spec's Data model section), with back-relations `School { lessonPlans LessonPlan[] }`, `SubjectAssignment { lessonPlans LessonPlan[] }`, `Term { lessonPlans LessonPlan[] }`.

- [ ] **Step 2: Add `"LessonPlan"` to `TENANT_MODELS`** in `prisma.service.ts`.

- [ ] **Step 3: Write the migration** `apps/api/prisma/migrations/20260703120000_lesson_plans/migration.sql`:

```sql
CREATE TYPE "LessonPlanStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','RETURNED');

CREATE TABLE "LessonPlan" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "subjectAssignmentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "topic" TEXT,
  "objectives" TEXT,
  "activities" TEXT,
  "resources" TEXT,
  "assessment" TEXT,
  "notes" TEXT,
  "status" "LessonPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewNote" TEXT,
  "reviewedByStaffId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonPlan_subjectAssignmentId_termId_weekNumber_key" ON "LessonPlan"("subjectAssignmentId","termId","weekNumber");
CREATE INDEX "LessonPlan_schoolId_termId_idx" ON "LessonPlan"("schoolId","termId");

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_subjectAssignmentId_fkey" FOREIGN KEY ("subjectAssignmentId") REFERENCES "SubjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Write the failing test** `lesson-plan-model.spec.ts`: seed School + Class + Subject + Staff + AcademicYear + Term + SubjectAssignment; create a `LessonPlan` (defaults `status=DRAFT`); assert `@@unique([subjectAssignmentId, termId, weekNumber])` rejects a duplicate week; assert a second school can't read the first's plans when scoped by `schoolId`.

- [ ] **Step 5: Apply + generate**: `... prisma migrate deploy` then `... prisma generate`.
- [ ] **Step 6: Run — expect PASS** (`... jest lesson-plan-model --runInBand`).
- [ ] **Step 7: Build check** `npx tsc -p tsconfig.build.json && find dist -name main.js` → `dist/main.js`.
- [ ] **Step 8: Commit** (`feat(lesson-plans): LessonPlan model + enum + migration`).

---

### Task 2: Weeks util + DTOs + transitions + `LessonPlansService` authoring core

**Files:**
- Create: `apps/api/src/modules/lesson-plans/weeks.util.ts`
- Create: `apps/api/src/modules/lesson-plans/transitions.ts`
- Create: `apps/api/src/modules/lesson-plans/dto/lesson-plans.dto.ts`
- Create: `apps/api/src/modules/lesson-plans/lesson-plans.service.ts`
- Test: `apps/api/src/modules/lesson-plans/lesson-plans.service.spec.ts`

**Interfaces:**
- Produces:
  - `weeksInTerm(startDate: Date, endDate: Date): number` → `clamp(ceil(daysBetween/7), 1, 20)`.
  - `ALLOWED_TRANSITIONS: Record<LessonPlanStatus, LessonPlanStatus[]>` = `{DRAFT:["SUBMITTED"], RETURNED:["SUBMITTED"], SUBMITTED:["APPROVED","RETURNED"], APPROVED:[]}`.
  - DTOs: `PutLessonPlanDto {subjectAssignmentId, termId, weekNumber(@IsInt @Min(1)), topic?, objectives?, activities?, resources?, assessment?, notes?}`, `ReviewLessonPlanDto {decision: "APPROVED"|"RETURNED", note?}`.
  - `LessonPlansService`: `putDraft(dto)`, `getForAssignment(assignmentId, termId)`, `getOne(id)`, plus a private `resolveCallerStaffId(): Promise<string|null>` and a private `loadPlanScoped(id, schoolId)`. (submit/review are Task 3.)

- [ ] **Step 1: Write the failing test** `lesson-plans.service.spec.ts` (author paths): `putDraft` creates then updates the same `(assignment, term, week)` (one row); rejects when the caller's staff id ≠ assignment.staffId (`ForbiddenException`); rejects a `term` whose `academicYearId` ≠ assignment's (`BadRequestException`); rejects `weekNumber` > `weeksInTerm(term)` (`BadRequestException`); rejects a foreign assignment/term (`NotFoundException`); `getForAssignment` returns the weeks for that assignment+term scoped to school; editing a plan that is `APPROVED` or `SUBMITTED` → `BadRequestException` (only DRAFT/RETURNED editable). Mock the caller staff via seeding a `User {identityType:"STAFF", identityId: <staffId>}` and running inside `TenantContext.run({schoolId, userId})`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** `weeks.util.ts`:

```ts
export function weeksInTerm(startDate: Date, endDate: Date): number {
  const ms = endDate.getTime() - startDate.getTime();
  const weeks = Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
  return Math.min(20, Math.max(1, weeks));
}
```
`transitions.ts` exports `ALLOWED_TRANSITIONS` as above. Service `resolveCallerStaffId`:

```ts
private async resolveCallerStaffId(): Promise<string | null> {
  const userId = TenantContext.current()?.userId;
  if (!userId) return null;
  const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { identityType: true, identityId: true } });
  return user?.identityType === "STAFF" ? user.identityId : null;
}
```
`putDraft`:

```ts
async putDraft(dto: PutLessonPlanDto) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const assignment = await this.prisma.subjectAssignment.findFirst({ where: { id: dto.subjectAssignmentId, schoolId } });
  if (!assignment) throw new NotFoundException("Subject assignment not found in this school.");
  const staffId = await this.resolveCallerStaffId();
  if (!staffId || staffId !== assignment.staffId) throw new ForbiddenException("You can only edit lesson plans for your own classes.");
  const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
  if (!term) throw new NotFoundException("Term not found in this school.");
  if (term.academicYearId !== assignment.academicYearId) throw new BadRequestException("Term and assignment are in different academic years.");
  const maxWeek = weeksInTerm(term.startDate, term.endDate);
  if (dto.weekNumber < 1 || dto.weekNumber > maxWeek) throw new BadRequestException(`weekNumber must be 1–${maxWeek}.`);

  const existing = await this.prisma.lessonPlan.findFirst({
    where: { subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber, schoolId },
  });
  if (existing && (existing.status === "SUBMITTED" || existing.status === "APPROVED")) {
    throw new BadRequestException("This plan is locked (submitted or approved) and cannot be edited.");
  }
  const fields = {
    topic: dto.topic, objectives: dto.objectives, activities: dto.activities,
    resources: dto.resources, assessment: dto.assessment, notes: dto.notes,
  };
  return this.prisma.lessonPlan.upsert({
    where: { subjectAssignmentId_termId_weekNumber: {
      subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber } },
    create: { schoolId, subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber, ...fields },
    update: { ...fields, status: existing?.status === "RETURNED" ? "DRAFT" : undefined },
  });
}
```
(Editing a `RETURNED` plan flips it back to `DRAFT` so the teacher re-submits explicitly; `undefined` leaves status untouched otherwise.) `getForAssignment` validates the assignment belongs to the school, then `findMany({ where: { subjectAssignmentId, termId, schoolId }, orderBy: { weekNumber: "asc" } })`. `getOne` = `loadPlanScoped`. DTOs use `class-validator` matching `dto/student.dto.ts`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(lesson-plans): weeks util + transitions + authoring service`).

---

### Task 3: `submit` + `review` + `review-queue`

**Files:**
- Modify: `apps/api/src/modules/lesson-plans/lesson-plans.service.ts`
- Test: `apps/api/src/modules/lesson-plans/lesson-plans-workflow.spec.ts`

**Interfaces:**
- Consumes: `ALLOWED_TRANSITIONS`, `resolveCallerStaffId`, `PrismaService`.
- Produces: `submit(id)`, `review(id, dto: ReviewLessonPlanDto)`, `reviewQueue(termId?)`.

- [ ] **Step 1: Write the failing test** `lesson-plans-workflow.spec.ts`:
  - `submit` (owner) DRAFT → SUBMITTED (sets `submittedAt`); RETURNED → SUBMITTED; a non-owner submitting → `ForbiddenException`; submitting an APPROVED plan → `BadRequestException`.
  - `review` APPROVED path: SUBMITTED → APPROVED (sets `reviewedAt`, `reviewedByStaffId`); subsequent edit via `putDraft` → `BadRequestException` (locked).
  - `review` RETURNED path: requires `note` (missing → `BadRequestException`); sets `reviewNote` + reopens (editing allowed again; `putDraft` succeeds and flips to DRAFT).
  - `review` on a non-SUBMITTED plan → `BadRequestException`.
  - `reviewQueue` returns only SUBMITTED plans for the school (optionally filtered by term), with subject/class/teacher/week.
  - IDOR: `submit`/`review`/`getOne` on another school's plan id → `NotFoundException`.
  (Note: the `lessonplans.review` *permission* is enforced by the controller guard in Task 4; the service `review` method assumes the caller is authorized and sets `reviewedByStaffId` from `resolveCallerStaffId()`.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** `submit`:

```ts
async submit(id: string) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const plan = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId }, include: { subjectAssignment: true } });
  if (!plan) throw new NotFoundException("Lesson plan not found.");
  const staffId = await this.resolveCallerStaffId();
  if (!staffId || staffId !== plan.subjectAssignment.staffId) throw new ForbiddenException("You can only submit your own lesson plans.");
  if (!(ALLOWED_TRANSITIONS[plan.status] ?? []).includes("SUBMITTED")) {
    throw new BadRequestException(`Cannot submit a ${plan.status} plan.`);
  }
  return this.prisma.lessonPlan.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
}
```
`review`:

```ts
async review(id: string, dto: ReviewLessonPlanDto) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const plan = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId } });
  if (!plan) throw new NotFoundException("Lesson plan not found.");
  if (!(ALLOWED_TRANSITIONS[plan.status] ?? []).includes(dto.decision)) {
    throw new BadRequestException(`Cannot ${dto.decision.toLowerCase()} a ${plan.status} plan.`);
  }
  if (dto.decision === "RETURNED" && !dto.note?.trim()) throw new BadRequestException("A note is required when returning a plan.");
  const reviewerStaffId = await this.resolveCallerStaffId();
  return this.prisma.lessonPlan.update({
    where: { id },
    data: { status: dto.decision, reviewNote: dto.note ?? null, reviewedByStaffId: reviewerStaffId, reviewedAt: new Date() },
  });
}
```
`reviewQueue`:

```ts
async reviewQueue(termId?: string) {
  const schoolId = TenantContext.schoolIdOrThrow();
  return this.prisma.lessonPlan.findMany({
    where: { schoolId, status: "SUBMITTED", ...(termId ? { termId } : {}) },
    include: { subjectAssignment: { include: {
      subject: { select: { name: true } }, class: { select: { name: true } },
      staff: { select: { firstName: true, lastName: true } } } } },
    orderBy: { submittedAt: "asc" },
  });
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(lesson-plans): submit + review + review-queue workflow`).

---

### Task 4: Controllers + module + permission wiring

**Files:**
- Create: `apps/api/src/modules/lesson-plans/lesson-plans.controller.ts`
- Create: `apps/api/src/modules/lesson-plans/lesson-plans.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `LessonPlansModule`)
- Modify: `apps/api/prisma/seed.ts` (catalog: add `["lessonplans.record", "..."]`, `["lessonplans.review", "..."]`)
- Modify: `apps/api/prisma/seed-roles.ts` (`teacher` += `lessonplans.record`; `principal` += `lessonplans.review` + `lessonplans.record`; `exam_officer` += `lessonplans.review`)
- Test: `apps/api/src/modules/lesson-plans/lesson-plans.controller.spec.ts`

**Interfaces:**
- Consumes: `LessonPlansService`. Guards mirror `students.controller.ts`.
- Produces: routes under `v1/lesson-plans` per spec §API.

- [ ] **Step 1: `lesson-plans.controller.ts`** `@Controller("v1/lesson-plans")`. Routes (order `review-queue` + `assignment/:id` static segments before `:id`): `GET review-queue` (`lessonplans.review`), `GET assignment/:assignmentId?termId=` (`lessonplans.record`), `GET :id` (`lessonplans.record`), `PUT /` (`lessonplans.record`), `POST :id/submit` (`lessonplans.record`), `POST :id/review` (`lessonplans.review`). All `@UseGuards(JwtAuthGuard, PermissionGuard)`.
- [ ] **Step 2: `lesson-plans.module.ts`** (providers [LessonPlansService], controllers [LessonPlansController], imports per `admissions.module.ts`). Register in `app.module.ts`.
- [ ] **Step 3: Permission catalog + presets** — add both keys to `seed.ts` catalog and the presets in `seed-roles.ts` as above.
- [ ] **Step 4: Test** — routes delegate to the service (or integration: create assignment + plan via service, `reviewQueue` reflects a submitted plan); if a role-preset test exists, assert `teacher` has `lessonplans.record` and `principal`/`exam_officer` have `lessonplans.review`.
- [ ] **Step 5: Run — expect PASS** (`... jest lesson-plans --runInBand`) + build emits `dist/main.js`.
- [ ] **Step 6: Commit** (`feat(lesson-plans): controllers + module + permissions`).

---

### Task 5: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `type LessonPlanStatus`, `interface LessonPlan {id;subjectAssignmentId;termId;weekNumber;topic;objectives;activities;resources;assessment;notes;status;reviewNote;submittedAt;reviewedAt}`, `interface LessonPlanQueueItem {id;weekNumber;submittedAt;subjectName;className;teacherName;termId}`; `api` methods: `getLessonPlans(assignmentId, termId)`, `getLessonPlan(id)`, `putLessonPlan(dto)`, `submitLessonPlan(id)`, `reviewLessonPlan(id, {decision, note?})`, `lessonPlanReviewQueue(termId?)`. All authed.

- [ ] **Step 1: Add types + methods** matching Task 3–4 shapes (cross-check the controller). `putLessonPlan` body = `PutLessonPlanDto` fields.
- [ ] **Step 2: `pnpm --filter @mymakaranta/web exec tsc --noEmit`** → 0 errors.
- [ ] **Step 3: Commit** (`feat(web): lesson-plans API client types + methods`).

---

### Task 6: Web — teacher lesson-plans screen + nav

**Files:**
- Create: `apps/web/src/app/(app)/lesson-plans/page.tsx`
- Modify: the sidebar nav in `apps/web/src/app/(app)/layout.tsx` (add "Lesson Plans", gate by `lessonplans.record`)

**Interfaces:**
- Consumes: `getLessonPlans`, `putLessonPlan`, `submitLessonPlan`, `listSubjectAssignments`, `listAcademicYears` (to get terms), plus the current-user resolution (`getMyProfile`/`/v1/me`) to filter assignments to my staff.

- [ ] **Step 1: Build the screen.** Resolve my staff (via `getMyProfile` / the me endpoint used elsewhere) → fetch my subject-assignments; pick assignment + term → fetch `getLessonPlans(assignmentId, termId)` and render a week list (1..N with status badges; N derived client-side from the term's start/end using the same ceil/clamp, or just render the weeks returned + allow adding the next). Open a week → an editor form (topic, objectives, activities, resources, assessment, notes) with **Save draft** (`putLessonPlan`) + **Submit** (`submitLessonPlan`). Show `reviewNote` when status is `RETURNED`; render read-only when `APPROVED`. Loading/empty/locked states.
- [ ] **Step 2: Nav** — add "Lesson Plans" to the sidebar (gate `lessonplans.record`).
- [ ] **Step 3: tsc + lint** (0 / no new errors). Reason through week states (empty / draft / submitted / approved / returned).
- [ ] **Step 4: Commit** (`feat(web): teacher lesson-plans authoring screen + nav`).

---

### Task 7: Web — reviewer queue + approve/return

**Files:**
- Create: `apps/web/src/app/(app)/lesson-plans/review/page.tsx`
- Modify: the sidebar nav (add "Review plans" gated by `lessonplans.review`, or a tab within the lesson-plans screen)

**Interfaces:**
- Consumes: `lessonPlanReviewQueue`, `getLessonPlan`, `reviewLessonPlan`, `listAcademicYears` (term filter).

- [ ] **Step 1: Build the queue.** List submitted plans (`subject · class · teacher · week`, optional term filter) → open a plan (read-only fields via `getLessonPlan`) → **Approve** or **Return** (Return requires a note); on action, refetch the queue. Loading/empty states.
- [ ] **Step 2: Nav/tab** — surface the review queue for `lessonplans.review` holders.
- [ ] **Step 3: tsc + lint** (0 / no new errors).
- [ ] **Step 4: Commit** (`feat(web): lesson-plan review queue + approve/return`).

---

### Task 8: Regression gate

- [ ] **Step 1: Reset DB + full API suite**: `... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand` (all green; the known unrelated `migrate-identity` pollution only surfaces in a non-reset full run and passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`**: `cd apps/api && rm -rf dist && npx tsc -p tsconfig.build.json && find dist -name main.js`.
- [ ] **Step 3: Web gate**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web lint` (no new errors).
- [ ] **Step 4: Commit** empty gate marker: `test: OP-3 lesson-plans regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** weekly key `(assignment,term,week)` (T1 unique) ✓; light structured fields (T1/T2) ✓; workflow DRAFT→SUBMITTED→APPROVED|RETURNED + RETURNED→SUBMITTED (T2 transitions, T3 submit/review) ✓; ownership via caller staff = assignment.staffId (T2/T3) ✓; APPROVED locks (T2 putDraft guard) ✓; RETURN requires note + reopens (T3) ✓; term/assignment year + week bounds (T2) ✓; `lessonplans.record`/`review` perms + presets (T4) ✓; review-queue (T3/T4) ✓; teacher screen (T6) + reviewer queue (T7) ✓; tests + tenant/IDOR + gate (each task + T8) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for schema, migration SQL, weeks util, transitions, `putDraft`/`submit`/`review`/`reviewQueue`; web tasks give exact types/signatures/structure + point to concrete existing patterns (me-endpoint, nav, settings screens).

**Type consistency:** `PutLessonPlanDto`/`ReviewLessonPlanDto` fields identical across T2 (declared), T3 (review), T4 (routes), T5 (`putLessonPlan`/`reviewLessonPlan`). `ALLOWED_TRANSITIONS` shape used identically in T2/T3. `LessonPlanStatus` from `@prisma/client`. Review-queue shape in T3 matches `LessonPlanQueueItem` in T5.
