# Sprint 3 · Slice 5 — Report-Card PDF + Public Verification (Design)

- **Date:** 2026-06-15
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 5. Builds on slice 4 (release/frozen `ResultSheet`).
- **Builds on:** `ResultSheet`/`ResultSheetEntry` (slice 4), `release.service.getSheet`, grade boundaries (slice 1), the tenancy + permission stack.

## Goal

From a released result sheet, produce a printable **per-student report card** (the browser's
Save-as-PDF) that carries a QR code + human-readable code. Anyone can use that code on a
**public, unauthenticated page** to confirm the result is authentic, seeing only minimal
identifying info.

## Scope (locked decisions)

1. **PDF = print-optimized web page.** A dedicated print-styled `/report-card/[studentId]`
   route using the design system + `@media print` CSS + `window.print()`. No server PDF
   engine, no `@react-pdf`. "PDF" is the browser's Save-as-PDF.
2. **Verification = a dedicated non-tenant `Verification` table** (NOT RLS-protected),
   one row per `ResultSheet`, keyed by a random unguessable `code`, holding only the
   minimal public snapshot. Created **at release**; lazily created by the authenticated
   report-card endpoint for any sheet missing it (covers pre-slice-5 releases — no backfill
   migration). The `code` is stable across corrections; the snapshot's `average`/`position`
   are refreshed on correction (see "Correction integration"). **Why a separate table:**
   `ResultSheet` has RLS FORCE; the public path has no tenant context, so reading it
   directly would return nothing under production RLS. The `Verification` table is outside
   `TENANT_MODELS` and carries no RLS, so the public endpoint reads it with no tenant
   context — robust in dev (superuser) and prod (`mymakaranta_app`) alike. It exposes only
   data that is public-by-design.
3. **Public page reveals minimal identity + authenticity:** student, class, term, school,
   overall average, position, issued date — NOT the per-subject breakdown.
4. **New unauthenticated endpoint** (`GET /v1/public/verify/:code`) — the first public
   route; no JWT, no `TenantContext`; looks up by the globally-unique code.

### Non-goals
- Parent self-serve access (no user↔student identity link exists yet).
- Bulk/whole-class PDF export, emailing cards, digital signatures/watermarks beyond the code.
- A true downloadable `.pdf` file (the print dialog's Save-as-PDF is the deliverable).

## Architecture

Extends the `assessment` module with a report-card read service/controller + a `verificationCode`
on `ResultSheet`, and adds a small **`PublicModule`** (one unauthenticated controller) for
verification. Web adds an authenticated print page, a public verify page (outside the `(app)`
shell), an entry point on `/release`, and a client-side QR. One new web dep (`qrcode`).

### Data model — `Verification` (NOT in `TENANT_MODELS`, NO RLS)
```prisma
model Verification {
  id            String      @id @default(cuid())
  code          String      @unique
  resultSheetId String      @unique
  resultSheet   ResultSheet @relation(fields: [resultSheetId], references: [id], onDelete: Cascade)
  schoolId      String      // reference only; NOT used for tenant scoping/RLS
  studentName   String
  className     String
  termLabel     String
  schoolName    String
  average       Int
  position      Int
  issuedAt      DateTime    // = the release's releasedAt
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```
- Add the `verification Verification?` back-relation on `ResultSheet`. Do **NOT** add
  `"Verification"` to `TENANT_MODELS`, and do **NOT** add an RLS policy for it — the public
  endpoint must read it without a tenant context. It holds only public-by-design fields.
- **Code format:** 16 chars from an unambiguous alphabet (Crockford base32, no 0/O/1/I/L),
  via `node:crypto` `randomBytes` (no `Math.random`). Helper `generateVerificationCode()`.
  Collision → unique-constraint retry (vanishingly rare).

### Release integration
In `release.service.release(...)`, after creating each `ResultSheet` (inside the existing
`$transaction`), create its `Verification` row with the snapshot (studentName, className,
termLabel, schoolName, average, position, issuedAt = the new release's `releasedAt`, schoolId,
a fresh `code`). The class/term/school/student names are already loaded or cheaply fetched in
the method. Existing pre-slice-5 sheets have no `Verification` until lazily created (below).

### Correction integration
`correction.service.correct(...)` re-ranks the whole class, so several sheets' `position`
(and the corrected sheet's `average`) change. In the same `$transaction`, after updating the
`ResultSheet`s, **upsert each affected `Verification`** (`where:{ resultSheetId }`) to refresh
`average`/`position` (create it if missing, for sheets released pre-slice-5). Bounded by class
size; keeps public snapshots truthful.

### Authenticated report-card — `report-card.service.ts` (`results.release`, explicit scoping, IDOR)
`GET /v1/assessment/report-card?studentId=&termId=`:
1. `schoolId = TenantContext.schoolIdOrThrow()`. Validate the student's `ResultSheet`
   (`findFirst { schoolId, studentId, termId }`, include release + student/class/term/
   entries→subject) → 404 if none (not released).
2. Ensure a `Verification` exists for this sheet (`findUnique { resultSheetId }`); if missing,
   create it with a fresh `code` + the current snapshot (lazy fill for pre-slice-5 sheets).
   Use the existing code if present.
3. Load grade boundaries (`{schoolId}`, desc) for the legend + the class size (count of
   `ResultSheet` in that class+term).
4. Return:
```
{ school: { name }, student: { name, admissionNo }, className, term: { label },
  entries: [{ subjectId, subjectName, total, grade }], average, position, classSize,
  releasedAt, gradeKey: [{ grade, minScore, remark }], verificationCode }   // = Verification.code
```
`term.label` = `"<academicYear.name> · Term <number>"`. The report-card service may live in
the assessment module and inject a small shared helper or duplicate the tiny label format used
by `/release`.

### Public verification — `PublicModule` / `public.controller.ts` (NO guard, NO tenant)
`GET /v1/public/verify/:code` (no `@UseGuards`, no `TenantContext` use):
- `verification.findUnique({ where: { code } })` — reads the non-RLS `Verification` table; no
  tenant context needed (works under both the dev superuser and the prod `mymakaranta_app`
  role). `Verification` is not a tenant model, so the `$use` middleware never injects a
  `schoolId` filter even though a stray token might set context.
- Not found / blank code → `{ valid: false }` (HTTP 200, so the public page renders a clean
  "not found").
- Found → `{ valid: true, student: studentName, className, term: termLabel, school: schoolName,
  average, position, issuedAt }`. The table holds ONLY these public-by-design fields — there is
  no per-subject/id data to leak.
- Protection = the unguessable 16-char code. (A basic rate-limit/throttle is a future
  hardening; out of scope here.)
- Registered in `AppModule` as its own `PublicModule` so it is visibly outside the
  tenant-guarded assessment surface.

### Validation & errors
- Foreign student/term (authenticated) → 404 (explicit `schoolId` scoping).
- Unknown/blank code (public) → `{ valid: false }`.
- Student released but a subject had no scores → entry simply absent (slice-4 behavior).
- `verificationCode` uniqueness enforced at DB; generation retries on the rare collision.

## Web

- **`/report-card/[studentId]?termId=`** (authenticated, under `(app)`): print-optimized
  layout — school letterhead (name; logo if present), student bio (name, class, admission no),
  term, a per-subject table (subject · total · grade), overall average + position/classSize, a
  grade-key legend, issued date, and a footer block with a **QR code** (client-side `qrcode`
  → data URL) encoding the public verify URL (`<origin>/verify/<code>`) plus the
  human-readable code. A **Print / Save as PDF** button (`window.print()`); `@media print`
  hides nav/buttons and sets page styling. api client: `getReportCard(studentId, termId)`.
- **`/verify/[code]`** (public, OUTSIDE the `(app)` shell — its own minimal layout, no auth,
  no sidebar): fetches `/v1/public/verify/:code` (plain fetch, no bearer); renders the minimal
  authenticity card (student/class/term/school/average/position/issued) or a clean
  "not found / invalid code" state. On-brand but standalone.
- **Entry point:** a **Report card** action per student row on the `/release` released sheet →
  navigates to `/report-card/[studentId]?termId=<termId>`.

## Testing
- **API e2e** (extend `assessment.e2e-spec.ts` + a public e2e): release now creates a
  `Verification` per sheet; report-card returns the frozen sheet + the `verificationCode`,
  **idempotent** (same code on re-fetch); a sheet released before the table existed gets a
  `Verification` lazily on first report-card fetch; **cross-tenant** report-card (school B →
  A's student) → 404; a **correction** refreshes the affected `Verification` snapshots
  (average/position). Public verify (called WITHOUT tenant context, e.g. via the service with
  no `TenantContext.run`, or asserting the controller has no guard): valid code → minimal
  payload (assert it has student/class/term/school/average/position/issuedAt and **no**
  `entries`/ids); unknown code → `{ valid: false }`.
- **Web:** light render check (optional).
- **Browser QA:** open a student's report card from `/release` → print preview shows
  letterhead + table + QR → open the verify URL (decode/scan or paste the code) → public page
  confirms authenticity (minimal fields only) → tamper the code → invalid state.

## Dependencies
- Slice 4 (`ResultSheet`/entries, release), grade boundaries (slice 1), tenancy + permission
  stack. New web dep: `qrcode` (client-side QR). No new API deps (crypto is built-in).

## Release note / follow-up
- New releases get a `Verification` row automatically; pre-slice-5 sheets get one on first
  report-card open (lazy). No proprietor action needed. Corrections refresh the snapshot.
- Future hardening: rate-limit/throttle `GET /v1/public/verify/:code`; optional logo upload
  for the letterhead; bulk whole-class PDF.

## Out-of-scope future
- Slice 6: reveal animation (Framer Motion) on results viewing.
- Parent portal / identity-linked self-serve report cards.
