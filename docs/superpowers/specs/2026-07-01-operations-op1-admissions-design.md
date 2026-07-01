# Operations OP-1 — Admissions — Design Spec

> **Status:** Approved (2026-07-01) · **Workstream 1 (Operations), sub-project 1 of 3** (Admissions → Timetable → Lesson Plans).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Give schools a real admissions funnel — prospective families apply (online or via a registrar), staff move each applicant through a lean pipeline, and on acceptance the applicant is converted in one step into a real `Student` + guardian linkage + first-term `Enrollment`. Beats SAFSIMS on UX (public application form + a clean pipeline board) while keeping the student roster clean (applicants are not Students until enrolled).

## Context (existing code this builds on)

- `Enrollment` is a bare link `student↔class↔term` (`@@unique([studentId, termId])`), created by `EnrollmentService.create` which resolves the three ids through tenant-scoped models first (no `schoolId` column on `Enrollment`).
- `Student` is created directly today via `StudentsService.create`, with a **manually supplied** `admissionNo` (`@@unique([schoolId, admissionNo])`).
- `Parent` `{schoolId, phone, email?, firstName, lastName, preferredLang}` `@@unique([schoolId, phone])`; legacy `Guardian` `{studentId, parentId, relationship: GuardianRelation, isPrimary}` `@@unique([studentId, parentId])` is what the SIS Student uses. (The newer `Guardianship` model is for the identity/portal platform and is **not** used here.)
- `enum Gender { MALE FEMALE }`, `enum GuardianRelation { MOTHER FATHER GUARDIAN GRANDPARENT AUNT UNCLE OTHER }`.
- A public, unauthenticated, subdomain-resolved surface already exists under `v1/public` (self-serve school signup lives at `v1/public/signup`). `TenantGuard` resolves the tenant from the request; public routes resolve the school from the subdomain/header.
- `AuditLog` exists and is written automatically for tenant-model mutations; we additionally record pipeline transitions.
- Permission-based RBAC with role presets (proprietor/admin/registrar/teacher…). New capability = `admissions.manage`.

## Decisions (locked)

1. **Intake:** both channels — a public online application form (subdomain) **and** staff-entered applicants. One pipeline, `source ∈ {PUBLIC, STAFF}`.
2. **Model:** a **separate `Applicant`** model with a pipeline status; converted to a real `Student` + `Enrollment` on acceptance. The roster stays clean.
3. **Pipeline (lean funnel):** `APPLIED → UNDER_REVIEW → OFFERED → ACCEPTED → ENROLLED`, with `REJECTED` and `WAITLISTED` off-ramps. No entrance-assessment stage.
4. **Offer acceptance:** **staff-marked** (applicants remain unauthenticated). Online/tokenized acceptance is a fast-follow.
5. **Guardian + conversion:** the application captures one guardian; `ACCEPTED → ENROLLED` creates `Student` (auto `admissionNo`) + find-or-create `Parent` + `Guardian` link + `Enrollment` into a staff-chosen class/term. Nothing re-keyed.
6. **Transition enforcement (Approach A):** `status` enum + a service-guarded allowed-transitions map; each transition writes `AuditLog`. No configurable-pipeline table (YAGNI).

## Data model (additive — no existing model changes)

```prisma
enum ApplicationStatus { APPLIED UNDER_REVIEW OFFERED ACCEPTED ENROLLED REJECTED WAITLISTED }
enum ApplicantSource   { PUBLIC STAFF }

model Applicant {
  id                 String            @id @default(cuid())
  schoolId           String
  school             School            @relation(fields: [schoolId], references: [id])
  applicationNo      String                                   // auto per-school seq, "APP-<year>-<0001>"
  firstName          String
  middleName         String?
  lastName           String
  gender             Gender
  dateOfBirth        DateTime
  stateOfOrigin      String?
  desiredClassLevelId String
  desiredClassLevel  ClassLevel        @relation(fields: [desiredClassLevelId], references: [id])
  academicYearId     String
  academicYear       AcademicYear      @relation(fields: [academicYearId], references: [id])
  guardianName       String
  guardianPhone      String
  guardianEmail      String?
  guardianRelation   GuardianRelation
  previousSchool     String?
  source             ApplicantSource
  status             ApplicationStatus @default(APPLIED)
  reviewNote         String?
  rejectionReason    String?
  decidedAt          DateTime?
  convertedStudentId String?           @unique
  convertedStudent   Student?          @relation(fields: [convertedStudentId], references: [id])
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  @@unique([schoolId, applicationNo])
  @@index([schoolId, status])
}
```

- `Applicant` is added to `TENANT_MODELS` so reads/writes auto-scope by `schoolId`; new services still scope explicitly (per project rule) and validate request-supplied ids through tenant-scoped models before write.
- Back-relations added to `School`, `ClassLevel`, `AcademicYear`, `Student` (`applicant Applicant?`). Migration name: `admissions`.
- `applicationNo` sequence: per-school count of applicants in the intake year + 1, zero-padded, formatted `APP-<year>-<NNNN>`; generated inside the create transaction. `admissionNo` at conversion: `ADM-<year>-<NNNN>` from a per-school student count, staff-overridable.

## Pipeline & transitions (Approach A)

Allowed map (anything else → `BadRequestException`):

| From | To |
|---|---|
| `APPLIED` | `UNDER_REVIEW`, `REJECTED`, `WAITLISTED` |
| `UNDER_REVIEW` | `OFFERED`, `REJECTED`, `WAITLISTED` |
| `WAITLISTED` | `UNDER_REVIEW`, `OFFERED`, `REJECTED` |
| `OFFERED` | `ACCEPTED`, `REJECTED` |
| `ACCEPTED` | `ENROLLED` |
| `ENROLLED`, `REJECTED` | (terminal) |

- Generic transitions go through `POST /:id/transition {to, reason?}`; `REJECTED` records `rejectionReason`, sets `decidedAt`. Each transition writes an `AuditLog` row (`action: "Applicant.transition"`, before/after status).
- `ACCEPTED → ENROLLED` is **not** available via the generic transition endpoint — it is the dedicated **enroll** action (needs class/term), which performs the conversion transaction and sets `status=ENROLLED`, `decidedAt`, `convertedStudentId`.

**Conversion transaction (`enroll`):**
1. Load applicant tenant-scoped; assert `status === ACCEPTED` and `convertedStudentId == null` (reject double-convert).
2. Validate `classId` + `termId` belong to the school (tenant-scoped lookups).
3. Create `Student` (bio copied from applicant; `admissionNo` = provided or auto-generated).
4. Find-or-create `Parent` by `(schoolId, guardianPhone)`; split `guardianName` into first/last (last token = last name, remainder = first name) — reuse existing parent if the phone matches.
5. Create `Guardian` `{studentId, parentId, relationship: guardianRelation, isPrimary: true}`.
6. Create `Enrollment` `{studentId, classId, termId}`.
7. Update applicant: `status=ENROLLED`, `decidedAt=now`, `convertedStudentId`.

## API

**Public (unauthenticated, subdomain-resolved):**
- `POST /v1/public/applications` — body: applicant bio + `desiredClassLevelId` + `academicYearId` + guardian block. Validates the level/year belong to the resolved school. Creates `status=APPLIED`, `source=PUBLIC`. Returns `{ applicationNo }` only (no internal ids). Basic input validation + length caps; no auth.

**Staff (auth + `RequirePermissions("admissions.manage")`):**
- `GET /v1/admissions/applicants?status=&level=&year=&q=` — filtered list (q matches name/applicationNo/guardianPhone).
- `POST /v1/admissions/applicants` — staff intake, `source=STAFF`.
- `GET /v1/admissions/applicants/:id` — detail incl. audit timeline (from `AuditLog`).
- `PATCH /v1/admissions/applicants/:id` — edit bio/guardian/`reviewNote` (not status).
- `POST /v1/admissions/applicants/:id/transition` — `{ to: ApplicationStatus, reason? }`, guarded (excludes `ENROLLED`).
- `POST /v1/admissions/applicants/:id/enroll` — `{ classId, termId, admissionNo? }`, runs the conversion; returns the created `{ studentId, admissionNo }`.
- `GET /v1/admissions/stats` — funnel counts by status (for the board header / dashboard).

`admissions.manage` is added to the proprietor/admin/registrar role presets.

## Web

- **Public** — unauthenticated `/apply` route on the school subdomain: a single-page application form (applicant bio, desired class level + academic year dropdowns fetched from public metadata, one guardian block). Success screen shows the application number. Mirrors the existing public/subdomain resolution used by login.
- **Staff `(app)/admissions`:**
  - **Pipeline board** — columns per status (`APPLIED`, `UNDER_REVIEW`, `WAITLISTED`, `OFFERED`, `ACCEPTED`, `ENROLLED`; `REJECTED` behind a filter), each column a stack of applicant cards (name, desired level, source badge, applied date). Header shows funnel counts. No drag-and-drop in v1 — each card has an action menu that calls transition/enroll.
  - **Applicant detail** (drawer or page): bio + guardian, status with allowed-transition buttons, audit timeline, and — when `ACCEPTED` — an **Enroll** panel (pick class + term, confirm/override admission number) that converts and links to the new student record.
  - **New applicant** staff-intake form (same fields as public + source=STAFF).
  - Built with `@mymakaranta/ui`, teal/lime design system, consistent with existing screens; empty/loading/locked states handled.

## Testing

- **Model/tenant:** `Applicant` persists; `@@unique([schoolId, applicationNo])`; reads auto-scope; a second school can't see the first's applicants.
- **Transition guard:** legal transitions succeed; illegal ones (`APPLIED → ENROLLED`, `REJECTED → *`) throw; each writes an `AuditLog` row; `REJECTED` stores `rejectionReason` + `decidedAt`.
- **Conversion:** `enroll` on an `ACCEPTED` applicant creates `Student` (admissionNo set) + `Parent` (reused when phone matches, created otherwise) + `Guardian` (isPrimary) + `Enrollment` (chosen class/term), sets `convertedStudentId`/`ENROLLED`; a second `enroll` is rejected; cross-tenant class/term/applicant ids are rejected.
- **Public application:** subdomain-resolved create yields `APPLIED`/`source=PUBLIC` and returns only `applicationNo`; a level/year from another school is rejected.
- **IDOR:** staff cannot `GET`/`PATCH`/`transition`/`enroll` another school's applicant.
- Windows gate: `tsc --noEmit` + jest `--runInBand` (argon2/serial) + web `tsc`/`lint`. Build must emit `dist/main.js` (no `src/ → prisma/` imports).

## Out of scope (fast-follows)

- Application-fee **payment** — deferred to Money (Workstream 3); leave a clean seam (status/notes can note fee state later).
- Online/tokenized offer acceptance by the applicant.
- Entrance-assessment scoring stage.
- Applicant document/photo uploads (birth certificate, etc.).
- Bulk applicant import.
- Duplicate handling: allowed; the staff list surfaces a soft "possible duplicate" hint (same guardian phone + applicant name in the same year). No hard block.
