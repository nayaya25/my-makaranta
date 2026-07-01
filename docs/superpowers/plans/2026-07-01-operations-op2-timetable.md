# Operations OP-2 — Timetable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A school-wide weekly bell schedule plus a conflict-free per-class timetable (cells reference existing `SubjectAssignment`s), with teacher double-booking hard-blocked, and per-class/per-teacher/printable views.

**Architecture:** Two new tenant models — `Period` (school-wide bell schedule) and `TimetableEntry` (`class × dayOfWeek × period → SubjectAssignment`). A `timetable` NestJS module with a periods service/controller and a timetable-entries service/controller; clash detection lives in the entries service. Web: a bell-schedule settings editor, a class timetable builder grid, and teacher/printable views.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 15 (App Router) + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate every request-supplied id (classId, academicYearId, periodId, subjectAssignmentId, staffId) through a tenant-scoped model before write/return. Don't rely on `$use` middleware inside `$transaction`/service tests — scope explicitly. (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **Build invariant:** NO file under `apps/api/src/` may import from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `apps/api/.env`.
- Windows: do NOT run `next build` or dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`. Reset DB before full runs: `prisma migrate reset --force --skip-seed --skip-generate`.
- `prisma migrate dev` needs a TTY here — hand-write migration SQL + `prisma migrate deploy` + `prisma generate`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Reuse existing permissions: `classes.view` (reads), `classes.manage` (writes). No new permission.
- Time format: `"HH:mm"` 24h zero-padded, regex `^([01]\d|2[0-3]):[0-5]\d$`, `startTime < endTime` (lexical). `dayOfWeek` ∈ 1..5.
- New tenant tables get NO per-table RLS (assessment-table precedent) — rely on `$use` + explicit scoping.

---

### Task 1: Schema — `Period` + `TimetableEntry` + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (2 models + back-relations on `School`, `AcademicYear`, `Class`, `SubjectAssignment`)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (add `"Period"`, `"TimetableEntry"` to `TENANT_MODELS`)
- Create: `apps/api/prisma/migrations/20260701130000_timetable/migration.sql`
- Test: `apps/api/src/modules/timetable/timetable-model.spec.ts`

**Interfaces:**
- Produces: `prisma.period`, `prisma.timetableEntry` delegates; models per spec.

- [ ] **Step 1: Add models to `schema.prisma`** (exact fields from the spec's Data model section):

```prisma
model Period {
  id        String           @id @default(cuid())
  schoolId  String
  school    School           @relation(fields: [schoolId], references: [id])
  label     String
  startTime String
  endTime   String
  order     Int
  isBreak   Boolean          @default(false)
  entries   TimetableEntry[]

  @@unique([schoolId, order])
}

model TimetableEntry {
  id                  String            @id @default(cuid())
  schoolId            String
  school              School            @relation(fields: [schoolId], references: [id])
  academicYearId      String
  academicYear        AcademicYear      @relation(fields: [academicYearId], references: [id])
  classId             String
  class               Class             @relation(fields: [classId], references: [id])
  dayOfWeek           Int
  periodId            String
  period              Period            @relation(fields: [periodId], references: [id])
  subjectAssignmentId String
  subjectAssignment   SubjectAssignment @relation(fields: [subjectAssignmentId], references: [id], onDelete: Cascade)

  @@unique([classId, academicYearId, dayOfWeek, periodId])
  @@index([schoolId, academicYearId])
  @@index([subjectAssignmentId])
}
```
Back-relations: `School { periods Period[]  timetableEntries TimetableEntry[] }`, `AcademicYear { timetableEntries TimetableEntry[] }`, `Class { timetableEntries TimetableEntry[] }`, `SubjectAssignment { timetableEntries TimetableEntry[] }`.

- [ ] **Step 2: Add `"Period"` and `"TimetableEntry"` to `TENANT_MODELS`** in `prisma.service.ts`.

- [ ] **Step 3: Write the migration** `apps/api/prisma/migrations/20260701130000_timetable/migration.sql`:

```sql
CREATE TABLE "Period" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "isBreak" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Period_schoolId_order_key" ON "Period"("schoolId","order");

CREATE TABLE "TimetableEntry" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "periodId" TEXT NOT NULL,
  "subjectAssignmentId" TEXT NOT NULL,
  CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimetableEntry_classId_academicYearId_dayOfWeek_periodId_key" ON "TimetableEntry"("classId","academicYearId","dayOfWeek","periodId");
CREATE INDEX "TimetableEntry_schoolId_academicYearId_idx" ON "TimetableEntry"("schoolId","academicYearId");
CREATE INDEX "TimetableEntry_subjectAssignmentId_idx" ON "TimetableEntry"("subjectAssignmentId");

ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectAssignmentId_fkey" FOREIGN KEY ("subjectAssignmentId") REFERENCES "SubjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Write the failing test** `timetable-model.spec.ts`: create School + Period; assert `@@unique([schoolId, order])` rejects a duplicate order; create a Class/AcademicYear/Subject/Staff/SubjectAssignment + Period, then a `TimetableEntry`, and assert the `@@unique([classId, academicYearId, dayOfWeek, periodId])` rejects a duplicate cell; assert a second school can't read the first's entries when scoped by `schoolId`.

- [ ] **Step 5: Apply + generate**: `... prisma migrate deploy` then `... prisma generate`.
- [ ] **Step 6: Run — expect PASS** (`... jest timetable-model --runInBand`).
- [ ] **Step 7: Build check** `npx tsc -p tsconfig.build.json && find dist -name main.js` → `dist/main.js`.
- [ ] **Step 8: Commit** (`feat(timetable): Period + TimetableEntry models + migration`).

---

### Task 2: Time util + `PeriodsService`

**Files:**
- Create: `apps/api/src/modules/timetable/time.util.ts`
- Create: `apps/api/src/modules/timetable/dto/timetable.dto.ts`
- Create: `apps/api/src/modules/timetable/periods.service.ts`
- Test: `apps/api/src/modules/timetable/periods.service.spec.ts`

**Interfaces:**
- Produces:
  - `isValidTime(s: string): boolean` (regex `^([01]\d|2[0-3]):[0-5]\d$`), `assertTimeRange(start, end): void` (throws `BadRequestException` if invalid or `start >= end`).
  - DTOs: `CreatePeriodDto {label, startTime, endTime, order, isBreak?}`, `UpdatePeriodDto` (all optional), plus (declared here, used in Task 3) `PutEntryDto {classId, academicYearId, dayOfWeek, periodId, subjectAssignmentId}`.
  - `PeriodsService`: `list()`, `create(dto)`, `update(id, dto)`, `remove(id)`.

- [ ] **Step 1: Write the failing test** `periods.service.spec.ts`: `create` persists + validates time (bad `"25:00"` or `start>=end` → `BadRequestException`); `list` returns periods ordered by `order`; `@@unique([schoolId, order])` surfaces as an error on duplicate order; `update` changes label/times/isBreak; `remove` of a period referenced by a `TimetableEntry` throws `BadRequestException` ("Period is used in the timetable"), and an unreferenced period deletes; all scoped by `schoolId` (foreign id → NotFound).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `time.util.ts`** then `periods.service.ts`. `remove` checks `timetableEntry.count({ where: { schoolId, periodId: id } })` > 0 → throw; else `deleteMany({ where: { id, schoolId } })`. `create`/`update` call `assertTimeRange`. Scope everything via `TenantContext.schoolIdOrThrow()` and `findFirst({ id, schoolId })` guards. DTOs use `class-validator` (match `dto/student.dto.ts` style; `@Matches` for time, `@IsInt @Min(1) @Max(5)` for dayOfWeek in `PutEntryDto`).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(timetable): time util + periods service`).

---

### Task 3: `TimetableService` — entry upsert (clash-checked) + delete + grids

**Files:**
- Create: `apps/api/src/modules/timetable/timetable.service.ts`
- Test: `apps/api/src/modules/timetable/timetable.service.spec.ts`

**Interfaces:**
- Consumes: DTOs from Task 2 (`PutEntryDto`), `PrismaService`, `TenantContext`.
- Produces: `TimetableService` methods:
  - `putEntry(dto: PutEntryDto)` → the upserted entry.
  - `deleteEntry(id: string)` → void.
  - `getClassGrid(classId, academicYearId)` → `{ periods: Period[]; entries: { id; dayOfWeek; periodId; subjectAssignmentId; subjectName; teacherName }[] }`.
  - `getTeacherGrid(staffId, academicYearId)` → `{ periods: Period[]; entries: { dayOfWeek; periodId; className; subjectName }[] }`.

- [ ] **Step 1: Write the failing test** `timetable.service.spec.ts` (seed a school, academic year, two classes, subjects, one staff, `SubjectAssignment`s, periods incl. one `isBreak`):
  - `putEntry` creates a cell; a second `putEntry` on the same `(class, year, day, period)` **replaces** it (still one row).
  - **Clash:** assign the same teacher to class A and class B (two assignments). Schedule teacher in class A at (Mon, P1); scheduling class B at (Mon, P1) → `BadRequestException`/`ConflictException` (message contains class A's name). Scheduling class B at (Mon, P2) → OK. A *different* teacher at class B (Mon, P1) → OK.
  - **Break guard:** `putEntry` with a period where `isBreak=true` → `BadRequestException`.
  - **Consistency/IDOR:** a `subjectAssignmentId` whose `classId` ≠ dto.classId (or whose `academicYearId` ≠ dto.academicYearId, or another school) → rejected; foreign `classId`/`periodId`/`academicYearId` → `NotFoundException`; `dayOfWeek=6` → `BadRequestException`.
  - `getClassGrid` returns the class's entries with `subjectName`/`teacherName`; `getTeacherGrid` aggregates the teacher's entries across both classes with `className`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `timetable.service.ts`.** `putEntry`:

```ts
async putEntry(dto: PutEntryDto) {
  const schoolId = TenantContext.schoolIdOrThrow();
  if (dto.dayOfWeek < 1 || dto.dayOfWeek > 5) throw new BadRequestException("dayOfWeek must be 1–5 (Mon–Fri).");

  const [cls, year, period, assignment] = await Promise.all([
    this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
    this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }),
    this.prisma.period.findFirst({ where: { id: dto.periodId, schoolId } }),
    this.prisma.subjectAssignment.findFirst({
      where: { id: dto.subjectAssignmentId, schoolId },
      include: { subject: { select: { name: true } }, staff: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  if (!cls || !year || !period) throw new NotFoundException("Class, year, or period not found in this school.");
  if (!assignment) throw new NotFoundException("Subject assignment not found in this school.");
  if (assignment.classId !== dto.classId || assignment.academicYearId !== dto.academicYearId) {
    throw new BadRequestException("That subject assignment does not belong to this class and year.");
  }
  if (period.isBreak) throw new BadRequestException("Cannot schedule into a break period.");

  // Teacher hard-block: same teacher, same year/day/period, a DIFFERENT class.
  const clash = await this.prisma.timetableEntry.findFirst({
    where: {
      schoolId, academicYearId: dto.academicYearId, dayOfWeek: dto.dayOfWeek, periodId: dto.periodId,
      classId: { not: dto.classId },
      subjectAssignment: { staffId: assignment.staff.id },
    },
    include: { class: { select: { name: true } } },
  });
  if (clash) {
    throw new BadRequestException(
      `${assignment.staff.firstName} ${assignment.staff.lastName} is already scheduled for ${clash.class.name} at this time.`,
    );
  }

  return this.prisma.timetableEntry.upsert({
    where: { classId_academicYearId_dayOfWeek_periodId: {
      classId: dto.classId, academicYearId: dto.academicYearId, dayOfWeek: dto.dayOfWeek, periodId: dto.periodId } },
    create: { schoolId, ...dto },
    update: { subjectAssignmentId: dto.subjectAssignmentId },
  });
}
```
`deleteEntry` → `deleteMany({ where: { id, schoolId } })` (throw NotFound if count 0). `getClassGrid`/`getTeacherGrid` → `findMany` scoped by schoolId + academicYearId with the right includes, mapped to the shapes above; `periods` from `PeriodsService.list()` (inject it or query directly).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(timetable): entry upsert with teacher-clash hard-block + grids`).

---

### Task 4: Controllers + module + registration

**Files:**
- Create: `apps/api/src/modules/timetable/periods.controller.ts`
- Create: `apps/api/src/modules/timetable/timetable.controller.ts`
- Create: `apps/api/src/modules/timetable/timetable.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `TimetableModule`)
- Test: `apps/api/src/modules/timetable/timetable.controller.spec.ts` (routes delegate to services; or an integration test)

**Interfaces:**
- Consumes: `PeriodsService`, `TimetableService`. Guards `JwtAuthGuard`, `PermissionGuard`, `@RequirePermissions(...)` (mirror `students.controller.ts`).
- Produces: routes per spec §API.

- [ ] **Step 1: `periods.controller.ts`** `@Controller("v1/timetable/periods")`: `GET` (`classes.view`), `POST`/`PATCH :id`/`DELETE :id` (`classes.manage`).
- [ ] **Step 2: `timetable.controller.ts`** `@Controller("v1/timetable")`: `GET class/:classId?academicYearId=` + `GET teacher/:staffId?academicYearId=` (`classes.view`); `PUT entry` + `DELETE entry/:id` (`classes.manage`). Note: register the `periods` routes on their own controller path so `class/:classId` and `periods` don't collide.
- [ ] **Step 3: `timetable.module.ts`** (`providers: [PeriodsService, TimetableService]`, `controllers: [PeriodsController, TimetableController]`, imports per `sis.module.ts`). Register in `app.module.ts`.
- [ ] **Step 4: Test** routes delegate to services (or integration: create period + assignment via services, `putEntry`, then `getClassGrid` reflects it).
- [ ] **Step 5: Run — expect PASS** (`... jest timetable --runInBand`) + build emits `dist/main.js`.
- [ ] **Step 6: Commit** (`feat(timetable): controllers + module registration`).

---

### Task 5: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `interface Period {id;label;startTime;endTime;order;isBreak}`, `interface ClassTimetable {periods:Period[]; entries:{id;dayOfWeek;periodId;subjectAssignmentId;subjectName;teacherName}[]}`, `interface TeacherTimetable {periods:Period[]; entries:{dayOfWeek;periodId;className;subjectName}[]}`, and `api` methods: `listPeriods()`, `createPeriod(dto)`, `updatePeriod(id,dto)`, `deletePeriod(id)`, `getClassTimetable(classId, academicYearId)`, `getTeacherTimetable(staffId, academicYearId)`, `putTimetableEntry(dto)`, `deleteTimetableEntry(id)`. All authed (bearer), matching existing `api.ts` conventions.

- [ ] **Step 1: Add types + methods**, matching the request/response shapes from Tasks 3–4 (cross-check the controllers).
- [ ] **Step 2: `pnpm --filter @mymakaranta/web exec tsc --noEmit`** → 0 errors.
- [ ] **Step 3: Commit** (`feat(web): timetable API client types + methods`).

---

### Task 6: Web — bell-schedule settings editor

**Files:**
- Create: `apps/web/src/app/(app)/settings/timetable/page.tsx` (or add a "Bell schedule" panel to the existing settings area — follow how `settings/assessment` / `settings/school` are structured)

**Interfaces:**
- Consumes: `listPeriods`, `createPeriod`, `updatePeriod`, `deletePeriod`.

- [ ] **Step 1: Build the editor** — an ordered list of periods; each row: label, start, end, "Break" toggle (`Switch`), save/remove. Add-period control. Validate `HH:mm` client-side before submit; surface API errors (e.g. delete blocked because the period is in use). Loading/empty states. `@mymakaranta/ui`, teal/lime.
- [ ] **Step 2: tsc + lint** (0 / no new errors).
- [ ] **Step 3: Commit** (`feat(web): bell-schedule settings editor`).

---

### Task 7: Web — class timetable builder + nav

**Files:**
- Create: `apps/web/src/app/(app)/timetable/page.tsx`
- Modify: the app sidebar/nav config used by `apps/web/src/app/(app)/layout.tsx` (add "Timetable", gate by `classes.view` if nav supports it)

**Interfaces:**
- Consumes: `getClassTimetable`, `putTimetableEntry`, `deleteTimetableEntry`, `listClasses`, `listAcademicYears`, `listSubjectAssignments(classId, yearId)`.

- [ ] **Step 1: Build the builder.** Pick class + academic year → grid: rows = periods (break rows greyed, non-editable), columns = Mon–Fri. A teaching cell shows its subject/teacher or an empty "+"; clicking opens a dropdown of that class's `SubjectAssignment`s (label `"{subject} — {teacher}"`); selecting calls `putTimetableEntry`; a clash returns an inline error naming the other class. A filled cell has a clear (×) → `deleteTimetableEntry`. Loading/empty/disabled states.
- [ ] **Step 2: Nav** — add "Timetable" to the sidebar.
- [ ] **Step 3: tsc + lint** (0 / no new errors). Reason through cell states manually.
- [ ] **Step 4: Commit** (`feat(web): class timetable builder + nav`).

---

### Task 8: Web — teacher timetable view + printable class timetable

**Files:**
- Create: `apps/web/src/app/(app)/timetable/teacher/page.tsx` (teacher grid; pick a teacher or "My timetable")
- Modify: `apps/web/src/app/(app)/timetable/page.tsx` (add a "Print" action rendering a print-friendly class grid)

**Interfaces:**
- Consumes: `getTeacherTimetable`, `listStaff` (existing), `getClassTimetable`.

- [ ] **Step 1: Teacher view** — pick a teacher (dropdown from `listStaff`) + academic year → read-only grid aggregated across classes (each cell shows class + subject). If the signed-in user is a teacher, default to their own staff record ("My timetable") — follow how the app resolves the current user/staff (check `/v1/me` usage in the web).
- [ ] **Step 2: Printable class timetable** — a print button on the builder that opens a clean, print-styled class grid (school name header, class + year, times). Use CSS print styling consistent with any existing printable (e.g. the report-card print view).
- [ ] **Step 3: tsc + lint** (0 / no new errors).
- [ ] **Step 4: Commit** (`feat(web): teacher timetable + printable class timetable`).

---

### Task 9: Regression gate

- [ ] **Step 1: Reset DB + full API suite**: `... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand` (all green; note the known unrelated `migrate-identity` pollution only appears in a non-reset full run — it passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`**: `cd apps/api && rm -rf dist && npx tsc -p tsconfig.build.json && find dist -name main.js`.
- [ ] **Step 3: Web gate**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web lint` (no new errors).
- [ ] **Step 4: Commit** empty gate marker: `test: OP-2 timetable regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** school-wide `Period` (T1/T2) ✓; `TimetableEntry`→`SubjectAssignment` (T1) ✓; cell source = assignments (T3 dropdown + T7) ✓; teacher hard-block clash (T3) ✓; break guard + day 1–5 + assignment-matches-class/year (T3) ✓; per-academic-year scope + `HH:mm` (T1/T2) ✓; periods CRUD API + entries API + grids (T2/T3/T4) ✓; `classes.view`/`manage` reuse (T4) ✓; bell-schedule editor (T6) + builder (T7) + teacher/printable (T8) ✓; tenant/IDOR + clash + break tests (T3) + gate (T9) ✓; out-of-scope items not built ✓.

**Placeholder scan:** none — full code for schema, migration SQL, time util behavior, periods service rules, and the clash-checked `putEntry`; web tasks give exact types/signatures/structure and point to concrete existing patterns to copy (settings pages, nav, `/v1/me`, report-card print).

**Type consistency:** `PutEntryDto {classId, academicYearId, dayOfWeek, periodId, subjectAssignmentId}` identical across T2 (declared), T3 (consumed), T4 (route body), T5 (`putTimetableEntry`). Grid shapes in T3 (`getClassGrid`/`getTeacherGrid`) match the web `ClassTimetable`/`TeacherTimetable` interfaces in T5. `Period` fields consistent T1↔T2↔T5.
