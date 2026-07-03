# Operations OP-2 — Timetable — Design Spec

> **Status:** Approved (2026-07-01) · **Workstream 1 (Operations), sub-project 2 of 3** (Admissions ✓ → Timetable → Lesson Plans).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let a school define a weekly bell schedule and build a conflict-free timetable: assign each class's subjects+teachers to day/period cells, with teacher double-booking hard-blocked, and view/print per-class and per-teacher grids. Beats SAFSIMS on reliability (guaranteed no teacher clashes) and UX (grid builder + printable views).

## Context (existing code this builds on)

- `SubjectAssignment` `{schoolId, subjectId, classId, staffId, academicYearId}` `@@unique([subjectId, classId, academicYearId])` already pairs a subject + teacher for a class in a given year. It has **no time** dimension. A timetable cell schedules one of these.
- `Class` `{schoolId, classLevelId, name, formTeacherId?}`; `Staff` `{schoolId, staffNo, firstName, lastName, …}`; `AcademicYear` `{schoolId, name, startDate, endDate, terms}`; `Subject` `{schoolId, name, code, …}`.
- No `Period`/timetable models exist.
- `PrismaService.TENANT_MODELS` auto-scopes tenant models by `schoolId` via `$use`; new services still scope explicitly + validate request ids through tenant-scoped models (memories: tenant-idor-rule, prisma-tenant-scope-explicitly).
- Permission RBAC: `classes.view` / `classes.manage` already exist and cover class structure — timetable reuses them (no new permission).
- New tenant tables follow the assessment precedent: middleware + explicit scoping, **no per-table RLS migration**.
- Build invariant: no `apps/api/src/` file imports from top-level `prisma/`; prod build must emit `dist/main.js`.

## Decisions (locked)

1. **Bell schedule:** ONE school-wide weekly schedule — a set of `Period`s (label + start/end time + order + `isBreak`), applied uniformly Mon–Fri to all classes.
2. **Cell source:** a timetable cell references an existing `SubjectAssignment` (subject + teacher + class already paired). The cell dropdown is driven by that class's assignments; no free-form subject/teacher.
3. **Teacher clash:** hard-block — a teacher cannot be scheduled in two classes at the same day+period; the save is rejected with an error naming the clashing class. A class cell is uniquely one entry (DB unique index).
4. **Scope:** timetable entries are per **academic year** (matching `SubjectAssignment`). Grid is Mon–Fri (`dayOfWeek` 1–5). Times stored as validated `"HH:mm"` strings.

## Data model (additive — no existing model changes)

```prisma
model Period {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id])
  label     String
  startTime String                       // "HH:mm" 24h, zero-padded (e.g. "08:00")
  endTime   String
  order     Int
  isBreak   Boolean  @default(false)      // non-teaching → not schedulable
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
  dayOfWeek           Int                                    // 1=Mon … 5=Fri
  periodId            String
  period              Period            @relation(fields: [periodId], references: [id])
  subjectAssignmentId String
  subjectAssignment   SubjectAssignment @relation(fields: [subjectAssignmentId], references: [id])

  @@unique([classId, academicYearId, dayOfWeek, periodId])
  @@index([schoolId, academicYearId])
  @@index([subjectAssignmentId])
}
```

- Back-relations: `School { periods Period[]; timetableEntries TimetableEntry[] }`, `AcademicYear { timetableEntries TimetableEntry[] }`, `Class { timetableEntries TimetableEntry[] }`, `SubjectAssignment { timetableEntries TimetableEntry[] }`.
- Add `"Period"` + `"TimetableEntry"` to `TENANT_MODELS`. Migration name: `timetable`.
- Time format: `"HH:mm"` validated by regex `^([01]\d|2[0-3]):[0-5]\d$`; `startTime < endTime` (lexical compare works for zero-padded 24h).

## Rules & clash detection

On `PUT /v1/timetable/entry` (upsert a cell):
1. Scope by `schoolId`; validate `classId`, `academicYearId`, `periodId`, `subjectAssignmentId` all belong to the school.
2. The `SubjectAssignment` must belong to the **same** `classId` **and** `academicYearId` (its `classId === dto.classId`, `academicYearId === dto.academicYearId`) — else `BadRequestException`.
3. The `Period` must have `isBreak === false` — else `BadRequestException` ("Cannot schedule into a break period.").
4. `dayOfWeek` ∈ 1..5.
5. **Teacher clash:** resolve `staffId` from the assignment; if any *other* `TimetableEntry` exists with the same `(schoolId, academicYearId, dayOfWeek, periodId)` whose `subjectAssignment.staffId === staffId` and `classId !== dto.classId` → `ConflictException`/`BadRequestException` naming the clashing class.
6. Upsert on the unique `(classId, academicYearId, dayOfWeek, periodId)` — replaces any existing cell entry.

`DELETE /v1/timetable/entry/:id` clears a cell (tenant-scoped).

## API (new `timetable` module)

- **Periods** — `@RequirePermissions("classes.manage")` for writes, `classes.view` for reads:
  - `GET /v1/timetable/periods` (ordered by `order`)
  - `POST /v1/timetable/periods` `{label, startTime, endTime, order, isBreak?}`
  - `PATCH /v1/timetable/periods/:id`
  - `DELETE /v1/timetable/periods/:id` (block if referenced by entries → `BadRequestException`, or cascade-clear; v1: block with a clear message)
- **Entries:**
  - `GET /v1/timetable/class/:classId?academicYearId=` (`classes.view`) → `{ periods: Period[], days: [1..5], entries: [{id, dayOfWeek, periodId, subjectName, teacherName, subjectAssignmentId}] }` — enough to render the grid.
  - `GET /v1/timetable/teacher/:staffId?academicYearId=` (`classes.view`) → the teacher's entries across all classes, shaped for a grid (`{dayOfWeek, periodId, className, subjectName}`).
  - `PUT /v1/timetable/entry` (`classes.manage`) `{classId, academicYearId, dayOfWeek, periodId, subjectAssignmentId}` → clash-checked upsert; returns the entry.
  - `DELETE /v1/timetable/entry/:id` (`classes.manage`).
- Cell dropdown data = the class's `SubjectAssignment`s for the year (existing `listSubjectAssignments(classId, yearId)`); no new endpoint required, but the class-grid response may include them for convenience.

## Web

- **Settings → Bell schedule:** a periods editor (ordered list; add/edit/remove; label, start, end, "break" toggle). Validates time format + ordering.
- **Timetable builder** (`(app)/timetable`): pick class + academic year → grid with period rows (break rows shown, greyed, non-editable) × Mon–Fri columns. Clicking a teaching cell opens a dropdown of that class's subject-assignments (subject — teacher); save calls `PUT entry`; a clash returns an inline error naming the other class. Clear (×) on a filled cell calls `DELETE`.
- **Teacher timetable:** pick a teacher (or "My timetable" for a signed-in teacher) → read-only grid aggregated across classes.
- **Printable** per-class timetable (print-friendly layout, school header).
- `@mymakaranta/ui`, teal/lime, consistent with existing screens; loading/empty states.

## Testing

- **Period:** create/order/isBreak; `@@unique([schoolId, order])`; time-format + start<end validation.
- **Entry upsert:** a second `PUT` on the same class/day/period replaces (one row).
- **Clash:** same teacher, same day+period, different class → hard block; same teacher, different period → OK; different teacher, same cell across classes → OK.
- **Break guard:** scheduling into an `isBreak` period → rejected.
- **Consistency/IDOR:** `subjectAssignmentId` from another class/year/school → rejected; foreign `classId`/`periodId`/`academicYearId` → rejected; a second school can't read/write the first's periods/entries.
- **Teacher grid:** aggregates the teacher's entries across multiple classes for the year.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Rooms/venues + room-clash detection.
- Saturday / per-day / per-class-level bell schedules.
- Auto-generation / timetable optimization.
- Term-level timetable variation (v1 is per academic year).
- Student-portal timetable view.
