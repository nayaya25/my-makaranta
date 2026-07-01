# Operations OP-1 — Admissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admissions funnel where families apply (public form or staff intake), staff move each applicant through a lean pipeline, and acceptance converts the applicant to a real `Student` + guardian + first-term `Enrollment` in one transaction.

**Architecture:** New `Applicant` model (standalone from `Student`) with a `status` enum guarded by a service-level allowed-transitions map; every transition is audited. A staff module (`v1/admissions`, permission `admissions.manage`) plus a public, slug-resolved endpoint (`v1/public/applications`). Web: a staff pipeline board + applicant detail/enroll, and an unauthenticated `/apply` page on the school subdomain.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 15 (App Router) + `@mymakaranta/ui`, jest (API, `--runInBand`), tsc/next lint (web).

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate any request-supplied id (applicantId, classId, termId, levelId, yearId) through a tenant-scoped model before write/return. Do not trust `$use` middleware inside `$transaction`/service tests — scope explicitly. (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **Build invariant:** NO file under `apps/api/src/` may import from top-level `apps/api/prisma/`. The prod build must emit `dist/main.js` (verify with `npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `apps/api/.env`. Never touch shared/Neon DBs.
- Windows: do NOT run `next build` (crashes) or rely on dev servers. Verify web with `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. Run API jest with `--runInBand`. Reset the DB before full runs: `prisma migrate reset --force --skip-seed --skip-generate`.
- `prisma migrate dev` needs a TTY here — author migration SQL by hand in a new folder and apply with `prisma migrate deploy` (then `prisma generate`).
- Every commit ends with trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Enums already in schema: `Gender { MALE FEMALE }`, `GuardianRelation { MOTHER FATHER GUARDIAN GRANDPARENT AUNT UNCLE OTHER }`.
- Precedent: new tenant tables (SkillDomain etc.) do NOT get per-table RLS policies; they rely on the `$use` middleware + explicit scoping. `Applicant` follows the same precedent (no RLS migration).

---

### Task 1: Schema — `Applicant` model + enums + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add enums, `Applicant` model, back-relations on `School`, `ClassLevel`, `AcademicYear`, `Student`)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (add `"Applicant"` to `TENANT_MODELS`)
- Create: `apps/api/prisma/migrations/20260701120000_admissions/migration.sql`
- Test: `apps/api/src/modules/admissions/applicant-model.spec.ts`

**Interfaces:**
- Produces: `Applicant` model with fields per the spec; `ApplicationStatus`, `ApplicantSource` enums. Prisma delegate `prisma.applicant`.

- [ ] **Step 1: Add enums + model to `schema.prisma`** (place enums near the other enums; model after `Enrollment`):

```prisma
enum ApplicationStatus { APPLIED UNDER_REVIEW OFFERED ACCEPTED ENROLLED REJECTED WAITLISTED }
enum ApplicantSource   { PUBLIC STAFF }

model Applicant {
  id                  String            @id @default(cuid())
  schoolId            String
  school              School            @relation(fields: [schoolId], references: [id])
  applicationNo       String
  firstName           String
  middleName          String?
  lastName            String
  gender              Gender
  dateOfBirth         DateTime
  stateOfOrigin       String?
  desiredClassLevelId String
  desiredClassLevel   ClassLevel        @relation(fields: [desiredClassLevelId], references: [id])
  academicYearId      String
  academicYear        AcademicYear      @relation(fields: [academicYearId], references: [id])
  guardianName        String
  guardianPhone       String
  guardianEmail       String?
  guardianRelation    GuardianRelation
  previousSchool      String?
  source              ApplicantSource
  status              ApplicationStatus @default(APPLIED)
  reviewNote          String?
  rejectionReason     String?
  decidedAt           DateTime?
  convertedStudentId  String?           @unique
  convertedStudent    Student?          @relation(fields: [convertedStudentId], references: [id])
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  @@unique([schoolId, applicationNo])
  @@index([schoolId, status])
}
```

Add back-relations: `School { applicants Applicant[] }`, `ClassLevel { applicants Applicant[] }`, `AcademicYear { applicants Applicant[] }`, `Student { applicant Applicant? }`.

- [ ] **Step 2: Add `"Applicant"` to `TENANT_MODELS`** in `apps/api/src/core/prisma/prisma.service.ts` (the exported `Set`).

- [ ] **Step 3: Write the migration SQL** at `apps/api/prisma/migrations/20260701120000_admissions/migration.sql`:

```sql
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED','UNDER_REVIEW','OFFERED','ACCEPTED','ENROLLED','REJECTED','WAITLISTED');
CREATE TYPE "ApplicantSource" AS ENUM ('PUBLIC','STAFF');

CREATE TABLE "Applicant" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "applicationNo" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "middleName" TEXT,
  "lastName" TEXT NOT NULL,
  "gender" "Gender" NOT NULL,
  "dateOfBirth" TIMESTAMP(3) NOT NULL,
  "stateOfOrigin" TEXT,
  "desiredClassLevelId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "guardianName" TEXT NOT NULL,
  "guardianPhone" TEXT NOT NULL,
  "guardianEmail" TEXT,
  "guardianRelation" "GuardianRelation" NOT NULL,
  "previousSchool" TEXT,
  "source" "ApplicantSource" NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
  "reviewNote" TEXT,
  "rejectionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "convertedStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Applicant_convertedStudentId_key" ON "Applicant"("convertedStudentId");
CREATE UNIQUE INDEX "Applicant_schoolId_applicationNo_key" ON "Applicant"("schoolId","applicationNo");
CREATE INDEX "Applicant_schoolId_status_idx" ON "Applicant"("schoolId","status");

ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_desiredClassLevelId_fkey" FOREIGN KEY ("desiredClassLevelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Write the failing test** `applicant-model.spec.ts`: create a School/ClassLevel/AcademicYear, then `prisma.applicant.create` with `status` defaulting to `APPLIED`; assert it persists; assert `@@unique([schoolId, applicationNo])` (a duplicate `(schoolId, applicationNo)` throws); assert a second school cannot read the first's applicant when scoped by `schoolId`.

- [ ] **Step 5: Apply migration + generate**: `DATABASE_URL=... npx prisma migrate deploy` then `DATABASE_URL=... npx prisma generate`.

- [ ] **Step 6: Run the test — expect PASS**: `DATABASE_URL=... npx jest applicant-model --runInBand`.

- [ ] **Step 7: Confirm no build regression**: `npx tsc -p tsconfig.build.json && find dist -name main.js` → `dist/main.js`.

- [ ] **Step 8: Commit** (`feat(admissions): Applicant model + enums + migration`).

---

### Task 2: Per-school sequence util (`applicationNo` / `admissionNo`)

**Files:**
- Create: `apps/api/src/modules/admissions/sequence.util.ts`
- Test: `apps/api/src/modules/admissions/sequence.util.spec.ts`

**Interfaces:**
- Produces:
  - `nextApplicationNo(tx: PrismaClientLike, schoolId: string, year: number): Promise<string>` → `"APP-<year>-<NNNN>"`
  - `nextAdmissionNo(tx: PrismaClientLike, schoolId: string, year: number): Promise<string>` → `"ADM-<year>-<NNNN>"`
  - `type PrismaClientLike = { applicant: {...}; student: {...} }` — accept `PrismaService` or a `$transaction` client. Keep the param typed as `any`-free by using a minimal structural type or `Prisma.TransactionClient`. Import types only from `@prisma/client` — never from `prisma/`.

- [ ] **Step 1: Write the failing test**: with 0 applicants, `nextApplicationNo(prisma, schoolId, 2026)` returns `"APP-2026-0001"`; after creating one applicant for that school, the next call returns `"APP-2026-0002"`; a different school still starts at `0001`. Same for `nextAdmissionNo` counting `student`.

- [ ] **Step 2: Run — expect FAIL** (`jest sequence.util`).

- [ ] **Step 3: Implement**:

```ts
import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient;

const pad = (n: number) => String(n).padStart(4, "0");

export async function nextApplicationNo(tx: Client, schoolId: string, year: number): Promise<string> {
  const count = await tx.applicant.count({ where: { schoolId } });
  return `APP-${year}-${pad(count + 1)}`;
}

export async function nextAdmissionNo(tx: Client, schoolId: string, year: number): Promise<string> {
  const count = await tx.student.count({ where: { schoolId } });
  return `ADM-${year}-${pad(count + 1)}`;
}
```

Note: count-based sequencing runs inside the create transaction so concurrent inserts serialize on the unique index; on the rare collision the caller retries (Task 3/4 wrap create in a small retry — see those tasks).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(admissions): per-school applicationNo/admissionNo sequence util`).

---

### Task 3: DTOs + `AdmissionsService` core (create / list / get / patch / transition)

**Files:**
- Create: `apps/api/src/modules/admissions/dto/admissions.dto.ts`
- Create: `apps/api/src/modules/admissions/transitions.ts`
- Create: `apps/api/src/modules/admissions/admissions.service.ts`
- Test: `apps/api/src/modules/admissions/admissions.service.spec.ts`

**Interfaces:**
- Consumes: `nextApplicationNo` (Task 2), `PrismaService`, `TenantContext.schoolIdOrThrow()`.
- Produces:
  - `ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]>` (excludes `ENROLLED` as a generic target — see below).
  - `AdmissionsService` methods: `createStaff(dto: CreateApplicantDto)`, `list(filter: ListApplicantsQuery)`, `getOne(id: string)`, `patch(id, dto: UpdateApplicantDto)`, `transition(id, dto: TransitionDto, actorId: string)`, `stats()`. (`enroll` is Task 4; `createPublic` is Task 6.)

- [ ] **Step 1: Write `transitions.ts`**:

```ts
import { ApplicationStatus } from "@prisma/client";

/** Allowed generic transitions. ACCEPTED→ENROLLED is intentionally excluded here —
 *  it is the dedicated enroll() action (needs class/term) in AdmissionsService. */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED:      ["UNDER_REVIEW", "REJECTED", "WAITLISTED"],
  UNDER_REVIEW: ["OFFERED", "REJECTED", "WAITLISTED"],
  WAITLISTED:   ["UNDER_REVIEW", "OFFERED", "REJECTED"],
  OFFERED:      ["ACCEPTED", "REJECTED"],
  ACCEPTED:     [],   // → ENROLLED only via enroll()
  ENROLLED:     [],
  REJECTED:     [],
} as ApplicationStatus[] extends never ? never : Record<ApplicationStatus, ApplicationStatus[]>;
```
(If the mapped-type cast is awkward, just declare it as `Record<ApplicationStatus, ApplicationStatus[]>` plainly.)

- [ ] **Step 2: Write DTOs** `dto/admissions.dto.ts` using `class-validator` (match the style of `dto/student.dto.ts`): `CreateApplicantDto` (firstName, middleName?, lastName, gender ∈ Gender, dateOfBirth ISO string, stateOfOrigin?, desiredClassLevelId, academicYearId, guardianName, guardianPhone, guardianEmail?, guardianRelation ∈ GuardianRelation, previousSchool?), `UpdateApplicantDto` (all optional; NO status), `TransitionDto` (`to: ApplicationStatus`, `reason?: string`), `EnrollApplicantDto` (`classId`, `termId`, `admissionNo?`), `ListApplicantsQuery` (`status?`, `level?`, `year?`, `q?`).

- [ ] **Step 3: Write the failing test** `admissions.service.spec.ts` covering:
  - `createStaff` sets `source=STAFF`, `status=APPLIED`, generates `applicationNo`, validates the level/year belong to the school (foreign id → `NotFoundException`).
  - `transition`: `APPLIED→UNDER_REVIEW` OK; illegal `APPLIED→ENROLLED` and `APPLIED→ACCEPTED` throw `BadRequestException`; `→REJECTED` stores `rejectionReason` + `decidedAt`; each transition writes an `AuditLog` row (`action:"Applicant.transition"`, `before`/`after` status).
  - `list` filters by status/level/year and `q` (name / applicationNo / guardianPhone).
  - IDOR: `getOne`/`patch`/`transition` on another school's applicant id → `NotFoundException`.

- [ ] **Step 4: Run — expect FAIL.**

- [ ] **Step 5: Implement `admissions.service.ts`.** Key shapes:

```ts
async transition(id: string, dto: TransitionDto, actorId: string) {
  const schoolId = TenantContext.schoolIdOrThrow();
  const applicant = await this.prisma.applicant.findFirst({ where: { id, schoolId } });
  if (!applicant) throw new NotFoundException("Applicant not found.");
  if (dto.to === "ENROLLED") throw new BadRequestException("Use the enroll action to admit an applicant.");
  const allowed = ALLOWED_TRANSITIONS[applicant.status] ?? [];
  if (!allowed.includes(dto.to)) {
    throw new BadRequestException(`Cannot move ${applicant.status} → ${dto.to}.`);
  }
  const updated = await this.prisma.applicant.update({
    where: { id },
    data: {
      status: dto.to,
      ...(dto.to === "REJECTED" ? { rejectionReason: dto.reason ?? null, decidedAt: new Date() } : {}),
      ...(dto.to === "OFFERED" ? { decidedAt: null } : {}),
      ...(dto.reason && dto.to !== "REJECTED" ? { reviewNote: dto.reason } : {}),
    },
  });
  await this.prisma.auditLog.create({
    data: {
      schoolId, actorId, action: "Applicant.transition", resourceType: "Applicant", resourceId: id,
      before: { status: applicant.status }, after: { status: dto.to },
    },
  });
  return updated;
}
```
`createStaff` wraps `nextApplicationNo` + `applicant.create` and retries once on a unique-constraint error (P2002). `list` builds a `where` with `schoolId` + optional filters; `q` uses `OR` on `firstName`/`lastName`/`applicationNo`/`guardianPhone` `contains`. `stats` → `groupBy({ by:["status"], where:{schoolId}, _count:true })` shaped to `Record<ApplicationStatus, number>`.

- [ ] **Step 6: Run — expect PASS.**
- [ ] **Step 7: Commit** (`feat(admissions): service core — create/list/get/patch/transition + audit`).

---

### Task 4: Conversion — `enroll` (ACCEPTED → ENROLLED)

**Files:**
- Modify: `apps/api/src/modules/admissions/admissions.service.ts` (add `enroll`)
- Test: `apps/api/src/modules/admissions/admissions-enroll.spec.ts`

**Interfaces:**
- Consumes: `nextAdmissionNo` (Task 2). Existing models: `Student` (create: admissionNo, firstName, middleName?, lastName, gender, dateOfBirth, stateOfOrigin?), `Parent` (`@@unique([schoolId, phone])`), `Guardian` (`{studentId, parentId, relationship, isPrimary}`), `Enrollment` (`{studentId, classId, termId}`).
- Produces: `enroll(id: string, dto: EnrollApplicantDto): Promise<{ studentId: string; admissionNo: string }>`.

- [ ] **Step 1: Write the failing test** `admissions-enroll.spec.ts`:
  - Seed an applicant in `ACCEPTED`, a target `Class` + `Term`. `enroll` creates a `Student` (admissionNo set, bio copied), a `Parent` (by guardianPhone), a `Guardian` (`isPrimary=true`, relation copied), an `Enrollment` (chosen class/term); applicant becomes `ENROLLED` with `convertedStudentId` + `decidedAt`.
  - **Parent reuse:** a pre-existing `Parent` with the same `(schoolId, phone)` is reused (no duplicate).
  - **Guard:** `enroll` on a non-`ACCEPTED` applicant → `BadRequestException`; a second `enroll` on an already-`ENROLLED` applicant → `BadRequestException` (no double student).
  - **Tenant/IDOR:** foreign `classId`/`termId`/applicant id → `NotFoundException`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `enroll`** in a `$transaction`:

```ts
async enroll(id: string, dto: EnrollApplicantDto): Promise<{ studentId: string; admissionNo: string }> {
  const schoolId = TenantContext.schoolIdOrThrow();
  return this.prisma.$transaction(async (tx) => {
    const applicant = await tx.applicant.findFirst({ where: { id, schoolId } });
    if (!applicant) throw new NotFoundException("Applicant not found.");
    if (applicant.status !== "ACCEPTED" || applicant.convertedStudentId) {
      throw new BadRequestException("Only an accepted applicant that hasn't been enrolled can be admitted.");
    }
    const [cls, term] = await Promise.all([
      tx.class.findFirst({ where: { id: dto.classId, schoolId } }),
      tx.term.findFirst({ where: { id: dto.termId, schoolId } }),
    ]);
    if (!cls || !term) throw new NotFoundException("Class or term not found in this school.");

    const year = new Date().getFullYear();
    const admissionNo = dto.admissionNo?.trim() || (await nextAdmissionNo(tx, schoolId, year));

    const student = await tx.student.create({
      data: {
        schoolId, admissionNo,
        firstName: applicant.firstName, middleName: applicant.middleName, lastName: applicant.lastName,
        gender: applicant.gender, dateOfBirth: applicant.dateOfBirth, stateOfOrigin: applicant.stateOfOrigin,
      },
    });

    const [gFirst, gLast] = splitName(applicant.guardianName); // last token = last name; rest = first
    const parent = await tx.parent.upsert({
      where: { schoolId_phone: { schoolId, phone: applicant.guardianPhone } },
      create: { schoolId, phone: applicant.guardianPhone, email: applicant.guardianEmail, firstName: gFirst, lastName: gLast },
      update: {},
    });
    await tx.guardian.create({
      data: { studentId: student.id, parentId: parent.id, relationship: applicant.guardianRelation, isPrimary: true },
    });
    await tx.enrollment.create({ data: { studentId: student.id, classId: dto.classId, termId: dto.termId } });

    await tx.applicant.update({
      where: { id }, data: { status: "ENROLLED", decidedAt: new Date(), convertedStudentId: student.id },
    });
    return { studentId: student.id, admissionNo };
  });
}
```
Add a private `splitName(full: string): [string, string]` helper (trim, split on whitespace; if one token, `[token, token]`).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(admissions): enroll converts accepted applicant to student+parent+guardian+enrollment`).

---

### Task 5: Staff controller + module + permission wiring

**Files:**
- Create: `apps/api/src/modules/admissions/admissions.controller.ts`
- Create: `apps/api/src/modules/admissions/admissions.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `AdmissionsModule`)
- Modify: `apps/api/prisma/seed-roles.ts` (add `"admissions.manage"` to `principal` and `ict_admin` preset arrays; `proprietor`/`director` are `ALL`)
- Modify: the permission-key registry/seed if a canonical list exists (search `admissions`/`students.manage` to find where permission keys are enumerated/seeded, e.g. `prisma/seed-permissions*` or a constant); add `admissions.manage` with a description.
- Test: `apps/api/src/modules/admissions/admissions.controller.spec.ts` (or extend service spec) — verify routes wire to service; a permission-preset test if one exists.

**Interfaces:**
- Consumes: `AdmissionsService` (Tasks 3-4). Guards: `JwtAuthGuard`, `PermissionGuard`, `@RequirePermissions("admissions.manage")`, `TenantContext`.
- Produces: routes under `v1/admissions` (see spec §API).

- [ ] **Step 1: Write `admissions.controller.ts`** (mirror `students.controller.ts` guard style). Routes: `GET /v1/admissions/applicants`, `POST /v1/admissions/applicants`, `GET /v1/admissions/applicants/:id`, `PATCH /v1/admissions/applicants/:id`, `POST /v1/admissions/applicants/:id/transition`, `POST /v1/admissions/applicants/:id/enroll`, `GET /v1/admissions/stats`. All: `@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermissions("admissions.manage")`. For `transition`, pass the actor id: `const actorId = TenantContext.current()?.userId ?? "system"` (match how other controllers read the actor; if unavailable, read from `req.user.sub`).

- [ ] **Step 2: Write `admissions.module.ts`** (`providers: [AdmissionsService]`, `controllers: [AdmissionsController]`, `imports: [PrismaModule]` if that's the pattern — otherwise `PrismaService` is global; follow `sis.module.ts`). Register in `app.module.ts`.

- [ ] **Step 3: Add permission** `admissions.manage` to `seed-roles.ts` (`principal`, `ict_admin`) and to the permission-key catalog/seed if one exists.

- [ ] **Step 4: Write/adjust the test** — a controller test that the routes delegate to the service (or an integration test creating an applicant via the service and asserting `stats()`), plus (if a preset test file exists) that `principal`/`ict_admin` grants include `admissions.manage`.

- [ ] **Step 5: Run — expect PASS**: `DATABASE_URL=... npx jest admissions --runInBand`.
- [ ] **Step 6: Confirm build emits `dist/main.js`.**
- [ ] **Step 7: Commit** (`feat(admissions): staff controller + module + admissions.manage permission`).

---

### Task 6: Public application endpoint + form metadata

**Files:**
- Create: `apps/api/src/modules/admissions/admissions-public.controller.ts` (registered in `AdmissionsModule`)
- Modify: `apps/api/src/modules/admissions/admissions.service.ts` (add `createPublic`, `publicMeta`)
- Create: `apps/api/src/modules/admissions/dto/public-application.dto.ts`
- Test: `apps/api/src/modules/admissions/admissions-public.spec.ts`

**Interfaces:**
- Produces:
  - `POST /v1/public/applications` — body `PublicApplicationDto` = `CreateApplicant` fields **plus** `schoolSlug`. Resolves `School` by `slug`; creates `source=PUBLIC`, `status=APPLIED`; returns `{ applicationNo }` only.
  - `GET /v1/public/schools/:slug/admission-meta` — returns `{ schoolName, classLevels: {id,name}[], academicYears: {id,name}[] }` for the form dropdowns. Both routes are unauthenticated + `@Throttle`.
  - Service: `createPublic(dto): Promise<{ applicationNo: string }>`, `publicMeta(slug): Promise<{...}>`. Both resolve `schoolId` from `slug` explicitly (public routes have no JWT/tenant context — do NOT call `TenantContext.schoolIdOrThrow()` here).

- [ ] **Step 1: Write the failing test** `admissions-public.spec.ts`:
  - `createPublic` with a valid `schoolSlug` + a level/year belonging to that school → creates `APPLIED`/`PUBLIC`, returns `applicationNo`, sets the right `schoolId`.
  - A `desiredClassLevelId`/`academicYearId` from a *different* school → `BadRequestException`/`NotFoundException` (validate they belong to the resolved school).
  - Unknown `schoolSlug` → `NotFoundException`.
  - `publicMeta` returns only that school's levels/years.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** `createPublic` resolves `const school = await this.prisma.school.findUnique({ where: { slug } })` (school lookup is not tenant-scoped — it's the tenant resolver), 404 if missing; validate level/year via `findFirst({ where: { id, schoolId: school.id } })`; generate `applicationNo` (reuse the retry-on-P2002 pattern); create with `source:"PUBLIC"`. Controller uses `@Controller("v1/public")`, `@Throttle({ default: { ttl: 60_000, limit: 10 } })` on the POST.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Confirm build emits `dist/main.js`** (public controller lives in `src/`, imports only `@prisma/client` types).
- [ ] **Step 6: Commit** (`feat(admissions): public application endpoint + form metadata`).

---

### Task 7: Web — API client types + methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces (TypeScript): `type ApplicationStatus`, `type ApplicantSource`, `interface Applicant`, `interface ApplicantStats`, and `api` methods:
  - `listApplicants(q?: {status?; level?; year?; q?}): Promise<Applicant[]>`
  - `getApplicant(id): Promise<Applicant>`
  - `createApplicant(dto): Promise<Applicant>` (staff intake)
  - `transitionApplicant(id, body: {to: ApplicationStatus; reason?: string}): Promise<Applicant>`
  - `enrollApplicant(id, body: {classId; termId; admissionNo?}): Promise<{studentId; admissionNo}>`
  - `admissionsStats(): Promise<ApplicantStats>`
  - `publicApply(dto): Promise<{applicationNo: string}>` (unauth — posts to `/v1/public/applications`)
  - `publicAdmissionMeta(slug): Promise<{schoolName; classLevels:{id;name}[]; academicYears:{id;name}[]}>`

- [ ] **Step 1: Add the types + methods**, matching the existing `api` client conventions in `apps/web/src/lib/api.ts` (auth header handling for staff methods; the two `public*` methods must NOT attach the bearer token — check how existing public calls, e.g. verification/receipt or signup, are made and follow that).
- [ ] **Step 2: Typecheck**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` → 0 errors.
- [ ] **Step 3: Commit** (`feat(web): admissions API client types + methods`).

---

### Task 8: Web — staff admissions board + detail + intake + enroll

**Files:**
- Create: `apps/web/src/app/(app)/admissions/page.tsx` (pipeline board)
- Create: `apps/web/src/app/(app)/admissions/ApplicantDetail.tsx` (drawer/panel: bio, guardian, timeline, transition buttons, enroll form)
- Create: `apps/web/src/app/(app)/admissions/NewApplicantForm.tsx`
- Modify: the app sidebar/nav (add an "Admissions" entry — find the nav config used by `apps/web/src/app/(app)/layout.tsx`)

**Interfaces:**
- Consumes: Task 7 `api` methods; `@mymakaranta/ui` (`Card`, `Button`, `Badge`, `PageContainer`, `PageHeader`, `Spinner`, `EmptyState`, `Switch`, `cn`, etc.).

- [ ] **Step 1: Board page.** Columns for `APPLIED`, `UNDER_REVIEW`, `WAITLISTED`, `OFFERED`, `ACCEPTED`, `ENROLLED` (plus a `REJECTED` filter toggle). Header shows funnel counts from `admissionsStats()`. Each column renders applicant cards (name, desired level, `source` badge, applied date). A "New applicant" button opens `NewApplicantForm`. Clicking a card opens `ApplicantDetail`. No drag-and-drop. Handle loading/empty states.
- [ ] **Step 2: `ApplicantDetail`.** Shows bio + guardian; renders the **allowed** transition buttons for the current status (compute client-side from the same allowed-map, or just show buttons and let the API reject); a `reason` field for `REJECTED`; audit timeline (from the applicant detail payload). When status is `ACCEPTED`, show an **Enroll** panel: class dropdown (`api.listClasses()`), term dropdown, optional admission-number override, and a confirm button calling `enrollApplicant`; on success link to the new student.
- [ ] **Step 3: `NewApplicantForm`.** Applicant bio + desired class level + academic year + one guardian block; submits `createApplicant`.
- [ ] **Step 4: Nav.** Add "Admissions" to the sidebar (gate by the `admissions.manage` permission if the nav supports permission gating; otherwise add unconditionally following the existing entries).
- [ ] **Step 5: Typecheck + lint**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) and `pnpm --filter @mymakaranta/web lint` (no new errors). Reason through each screen's loading/empty/disabled states.
- [ ] **Step 6: Commit** (`feat(web): admissions pipeline board + applicant detail + enroll`).

---

### Task 9: Web — public `/apply` page

**Files:**
- Create: `apps/web/src/app/apply/page.tsx` (unauthenticated, top-level route — NOT under `(app)`)

**Interfaces:**
- Consumes: `api.publicAdmissionMeta(slug)`, `api.publicApply(dto)`.

- [ ] **Step 1: Build the page.** Resolve the school **slug** from the subdomain the same way the login/public pages do (find how the web derives the tenant slug — check the login page and any subdomain helper). On load, fetch `publicAdmissionMeta(slug)` to populate the school name + class-level + academic-year dropdowns. Render a single form (applicant bio, desired level, year, guardian block), submit via `publicApply`, then show a success screen with the returned `applicationNo`. No auth; handle "school not found"/loading states. Use `@mymakaranta/ui`, teal/lime.
- [ ] **Step 2: Typecheck + lint** (0 / no new errors).
- [ ] **Step 3: Commit** (`feat(web): public /apply application form`).

---

### Task 10: Regression gate

**Files:** none (verification only)

- [ ] **Step 1: Reset DB + full API suite**: `DATABASE_URL=... npx prisma migrate reset --force --skip-seed --skip-generate` then `DATABASE_URL=... npx jest --runInBand`. Expect all green (existing + new admissions specs).
- [ ] **Step 2: Build emits `dist/main.js`**: `cd apps/api && rm -rf dist && npx tsc -p tsconfig.build.json && find dist -name main.js`.
- [ ] **Step 3: Web gate**: `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web lint` (no new errors).
- [ ] **Step 4: Commit** an empty gate marker: `test: OP-1 admissions regression gate green (api <N> serial + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** intake both channels (Task 5 staff + Task 6 public) ✓; separate Applicant model (Task 1) ✓; lean pipeline + guarded transitions + audit (Task 3) ✓; staff-marked acceptance (Task 3/4, no public auth) ✓; capture guardian + full conversion (Task 4) ✓; `admissions.manage` + presets (Task 5) ✓; public `/apply` + meta (Tasks 6, 9) ✓; board/detail/enroll UI (Task 8) ✓; tests + tenant/IDOR + Windows gate (each task + Task 10) ✓; out-of-scope items not built ✓.

**Placeholder scan:** none — code shown for schema, util, transitions, service, enroll, migration SQL; web tasks give exact types/signatures/structure and point to the concrete existing patterns to copy (they involve reading current nav/login/public-call code, which the implementer must inspect rather than have transcribed).

**Type consistency:** `ApplicationStatus`/`ApplicantSource` from `@prisma/client` used consistently; `nextApplicationNo`/`nextAdmissionNo` signatures match Tasks 2↔3↔4; `enroll` returns `{studentId, admissionNo}` consumed identically in Task 7/8; `EnrollApplicantDto {classId,termId,admissionNo?}` consistent across service/controller/web.
