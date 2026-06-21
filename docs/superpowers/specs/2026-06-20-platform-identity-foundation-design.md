# Platform & Identity Foundation — Design Spec

> **Status:** Draft for review · **Date:** 2026-06-20 · **Author:** brainstormed with founder
> **Workstream 1 of 6** in the myMakaranta "credible parity, then leapfrog" program (vs SAFSIMS/Flexisaf).
> Terminal next step after approval: `superpowers:writing-plans`.

## Goal

Replace myMakaranta's single-role identity (`User.identityType`) with a clean **multi-role, multi-tenant identity platform** and **three role-adaptive shells** (Staff · Parent · Student), delivered on **per-school subdomains** with **white-label** branding and **self-serve signup**. This is the foundation every later module (assignments, lesson-plan approval, student portal, admissions) depends on, and it directly fixes the UX/flow problem (each stakeholder gets a focused experience).

## Strategic context

SAFSIMS is feature-broad and Nigeria-deep but UX-dense, with **rigid fixed roles** and a one-identity model. We win by matching the structure with **better UX + a more flexible identity model** (one person, many roles/relationships) and frictionless **hybrid auth** suited to Nigerian schools. This spec is **parity + UX edge**; 10× features come in later workstreams.

## Decisions locked (from brainstorming)

| # | Decision |
|---|---|
| Objective | Credible parity first, then leapfrog. |
| First sub-project | Platform & Identity Foundation. |
| Role model | **Permission-based + editable role presets** (extends existing `Permission`/`StaffPermission`). |
| Auth | **Hybrid by user type**: parent OTP · student Student-ID+password · staff/proprietor email+password (OTP recovery). Google SSO later. |
| Shells | **3 role-adaptive experiences**: Staff (adaptive nav/home) · Parent · Student. |
| Identity | **One account (Person), multiple roles/relationships**; in-app context switch. Form Teacher = per-class assignment. |
| Scope | **Include** subdomain + white-label + self-serve signup in this spec. |
| Architecture | **A — Person + Membership platform** (clean core, migrate existing accounts). |

## Architecture overview

Monorepo unchanged: `apps/api` (NestJS), `apps/web` (Next.js), `packages/ui`. We add an **identity core** + **tenant resolution** + **per-tenant theming**.

- **Tenant:** wildcard DNS `*.mymakaranta.com` → web. Next.js middleware maps `ahlacademy.mymakaranta.com` → `School.slug` → tenant context for the request tree. Apex/`www` = marketing; `app.` = school-chooser/login. Reserved-subdomain blocklist.
- **Identity:** a **Person** holds credentials; a **Membership** places that person in a **School** with **Roles** and **Profiles** (Staff/Student/Guardian).
- **AuthZ:** JWT carries `personId · activeMembershipId · schoolId · roles · permissions`. Existing `PermissionGuard` + RLS + explicit `schoolId` scoping are retained and extended with a **tenant guard** (`JWT.schoolId` must equal the subdomain's school).

## Data model (Prisma)

New / changed models. (Existing `Staff`/`Parent`/`Student` are refactored into membership-linked profiles; see Migration.)

```
Person {
  id            String  @id @default(cuid())
  email         String? @unique
  phone         String? @unique
  passwordHash  String?
  firstName     String?
  lastName      String?
  gender        String?
  photoUrl      String?          // stored key; signed on read
  tokenVersion  Int     @default(0)
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  memberships   Membership[]
}

School {                          // EXISTING + new fields
  // ...existing: id, name, currency, country, requireCorrectionOtp, relations
  slug                 String  @unique     // subdomain
  logoUrl              String?
  themeKey             String  @default("teal")   // curated palette key
  motto                String?
  type                 String?               // PRIVATE/PUBLIC/FAITH/...
  address              String?
  state                String?
  website              String?
  technicalContactName String?
  technicalContactPhone String?
  technicalContactEmail String?
  principalSignatureUrl String?
  plan                 String  @default("standard")
  memberships          Membership[]
}

Membership {
  id          String   @id @default(cuid())
  personId    String
  schoolId    String
  status      String   @default("active")   // active | invited | suspended
  createdAt   DateTime @default(now())
  person      Person   @relation(fields: [personId], references: [id])
  school      School   @relation(fields: [schoolId], references: [id])
  roles       RoleAssignment[]
  staffProfile   StaffProfile?
  studentProfile StudentProfile?
  guardianOf     Guardian[]               // this membership is a guardian of N students
  @@unique([personId, schoolId])
  @@index([schoolId])
}

Role {
  id          String  @id @default(cuid())
  schoolId    String?                      // null = system preset
  key         String                       // e.g. "principal"
  name        String                       // "Principal / Head Teacher"
  isPreset    Boolean @default(false)
  permissions RolePermission[]
  assignments RoleAssignment[]
  @@unique([schoolId, key])
}

RoleAssignment { id String @id @default(cuid()) membershipId String roleId String @@unique([membershipId, roleId]) }
RolePermission { id String @id @default(cuid()) roleId String permissionId String @@unique([roleId, permissionId]) }

StaffProfile {
  id           String  @id @default(cuid())
  membershipId String  @unique
  staffNo      String
  hireDate     DateTime?
  // (other staff fields migrate from current Staff)
}

StudentProfile {
  id           String  @id @default(cuid())
  membershipId String? @unique        // null until a login is provisioned
  schoolId     String
  admissionNo  String
  studentId    String                 // login identifier, unique per school
  dateOfBirth  DateTime?
  gender       String?
  // (other student fields migrate from current Student)
  @@unique([schoolId, studentId])
  @@unique([schoolId, admissionNo])
}

Guardian {
  id               String  @id @default(cuid())
  parentMembershipId String
  studentProfileId String
  relationship     String
  isPrimary        Boolean @default(false)
  @@unique([parentMembershipId, studentProfileId])
}

FormTeacherAssignment {
  id           String @id @default(cuid())
  classId      String
  staffProfileId String
  termId       String
  kind         String  // "form" | "assistant"
  @@unique([classId, termId, kind])
}
```

**Notes**
- A person being *both staff and parent* in one school = one Membership with a `staffProfile` **and** `guardianOf[]`. Both staff and student in the same school is disallowed by convention (separate schools allowed).
- `Permission` catalog is the existing one; presets are seeded `Role` rows (`schoolId = null`, `isPreset = true`) cloned per school on demand when customized.

### Role presets (seeded)

`proprietor` (all permissions) · `director` · `principal` (Principal/Head Teacher) · `vice_principal` · `ict_admin` · `bursar` · `exam_officer` · `teacher`. **Form Teacher / Assistant Form Teacher** are NOT global roles — they are `FormTeacherAssignment`s that grant scoped permissions on the assigned class.

## Authentication

- **Login resolution (on a school subdomain):** identifier is matched as email/phone → global `Person`; or **Student ID → `StudentProfile`(schoolId, studentId) → its `Person`**.
- **Methods:**
  - Parent → **OTP** (existing phone/email flow).
  - Student → **Student ID + password** (school-provisioned; force reset on first login).
  - Staff / Proprietor → **email + password**; OTP available as recovery.
  - Google SSO → out of scope (flagged).
- **Password policy:** min 8 chars, ≥1 upper, ≥1 lower, ≥1 number, ≥1 special; argon2id hashing; auth endpoints throttled (reuse existing throttler); generic failure messages.
- **JWT payload:** `{ sub: personId, mbr: activeMembershipId, sch: schoolId, roles: string[], perms: string[], tv: tokenVersion }`. `POST /v1/auth/context` switches `activeMembership` for multi-membership people and re-issues the token.
- **Resets:** password reset via OTP to the person's phone/email; student password reset by staff with `students.manage`.

## Tenant routing & white-label

- **DNS/infra:** add wildcard `*.mymakaranta.com` → Vercel; register the wildcard domain on the web project. Marketing remains on apex/`www`.
- **Web middleware:** resolve subdomain → `School` (cached); attach `x-tenant-slug`/`x-school-id`; unknown slug → friendly 404. `app.` (no school) renders a school-chooser ("enter your school short name") + login.
- **API tenant guard:** every authed request asserts `JWT.sch === resolvedSchoolId`; mismatch → 403. Layered with existing RLS + explicit `schoolId` scoping ([[tenant-idor-rule]], [[prisma-tenant-scope-explicitly]]).
- **White-label (MVP):** `School.{logoUrl, themeKey, motto, principalSignatureUrl}`. `themeKey` selects one of a **curated palette set** (≈8 swatches incl. default teal); the tenant root layout injects the palette as CSS-var overrides over the existing token system. Arbitrary palette generation is out of scope. Logo + signature surface in shell header, login, and (later) report cards.

## Self-serve signup

Public 2-step wizard (mirrors the market, our UX):
1. **About the School** — name, **short name → slug with live availability check**, country, school type, website.
2. **About You** — first/last name, gender, email, phone, role (**Owner**), password (live rules), T&C consent.

On submit → create `School` (+slug) → `Person` + `Membership`(role `proprietor`) → seed permission presets → OTP-verify email/phone → land in existing onboarding (class levels / arms / session — band+arm-template enhancements tracked in the Academic/Operations workstreams).

## The three shells (UX)

A **tenant root layout** resolves school branding + the global session/term switcher, then renders one of:

- **Staff shell** (`apps/web/src/app/(staff)`, evolves today's `(app)`): single shell, **role-adaptive nav + home**:
  - Proprietor/Director → cross-module **command center** (existing proprietor dashboard).
  - Principal/Head → academic oversight: results review/release, lesson-plan approvals (later), performance.
  - ICT Admin → configuration, people, permissions, school profile.
  - Bursar → fees.
  - Teacher → **"My Classes"** home (their classes; quick attendance/gradebook/lesson-plan/assignments entry points).
  - Form Teacher → class cockpit for their assigned class(es).
  - Nav items are **permission-gated** (extends current behavior).
- **Parent shell** (`(parent)`): **children switcher**; per-child fees / results / attendance / announcements / messages; rich profile (Bio · Other Info · **Documents** · medical · emergency contact).
- **Student shell** (`(student)`): my timetable · assignments · learning materials · my results/progress · my attendance — **mostly stubs** in this spec; populated by later workstreams.
- **Context switch** (Staff ↔ Parent) in the top bar for multi-membership / multi-role people.

## Provisioning

- **Staff:** invited by email/phone → `Membership`(status `invited`) + role → accept link sets password → `active`.
- **Students:** created at enrollment; **auto-generate Student ID** (`<schoolShort>-<sequence>`); initial password (printable) or first-login set; **bulk CSV import** creates `StudentProfile`s (+ `Guardian` links + optional logins). Student logins **enabled at P4** (identity + IDs created from launch).
- **Parents:** auto-created as `Guardian` from student import; invited by phone (OTP) → `Membership`(parent capability).

## Migration (phased, reversible, OTP continuity)

Backfill scripts (tested against a production snapshot, runnable idempotently, with a documented rollback):
- PROPRIETOR `User` → `Person` + `Membership`(role `proprietor`), preserving email/phone/tokenVersion.
- `Staff` → `Person`(from staff email/phone) + `Membership` + `StaffProfile` (+ default `teacher` role; admins get matching presets from current `StaffPermission`).
- `Parent` → `Person`(phone) + `Membership` + `Guardian` links from existing guardian rows.
- `Student` → `StudentProfile` (membership/login created lazily when student login is enabled).
- `School.slug` backfilled from name (collision-safe).
- **Existing OTP logins keep working throughout.** Old `User`/`identityType` retained read-only until P4 cutover, then removed.

## Security

- Tenant guard (cross-tenant 403) + RLS + explicit `schoolId` scoping.
- argon2id password hashing; throttled auth; OTP throttling (existing); generic auth errors.
- Student PII handling; least-privilege permission checks server-side; signed URLs for photos/logos/signatures (existing storage signing + magic-byte verification).
- Reserved-subdomain blocklist (`app, www, api, admin, signup, mail, …`).

## Phasing (shippable slices)

- **P1 — Identity core:** Person/Membership/Role/RolePermission/profiles + migration + password auth (alongside existing OTP). No visible UX change. *Internally validated.*
- **P2 — Tenancy + white-label:** wildcard routing, tenant guard, subdomain login, curated theming + logo.
- **P3 — Self-serve signup:** public 2-step wizard + slug availability + OTP verification.
- **P4 — Shells:** the 3 role-adaptive shells + role homes + context switch + **student login enabled**; retire legacy `User.identityType`.

## Out of scope (later workstreams)

Feature modules (assignments, learning materials, CBT, lesson-plan authoring, admissions UI, timetable), Google SSO, the subscription/billing **engine** (only `School.plan` is modeled here), arbitrary palette generation, per-school custom domains.

## Testing strategy

- **Unit:** login resolution (email/phone/Student-ID), permission derivation from roles, slug validation/availability, password policy, tenant-guard match/mismatch, reserved-subdomain blocklist.
- **Integration:** signup → school+owner+presets; staff invite → accept → active; context switch re-issues correct JWT; cross-tenant request → 403; bulk student import → profiles+guardians; migration script on snapshot → expected Person/Membership counts + OTP login still works.
- **E2E (smoke):** parent OTP login on subdomain; staff password login; student Student-ID login (P4).

## Open questions (defaulted; flag to change)

1. **Student login at launch?** Defaulted to *identity + Student IDs created from launch, login enabled at P4*. Change if you want student login live in P2.
2. **Curated palette count** — defaulted to ~8 swatches. 
3. **Multi-school person** — supported by the model; no UI emphasis until a real need (e.g., a teacher across two branches).
