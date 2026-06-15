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
2. **Verification = random unguessable code per `ResultSheet`.** `verificationCode String?
   @unique`, generated **at release**; lazily generated + persisted by the authenticated
   report-card endpoint for any sheet missing it (covers pre-slice-5 releases — no backfill
   migration). Stable across corrections.
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

### Data model
- `ResultSheet.verificationCode String? @unique` (migration adds the nullable column + unique
  index). No new model. RLS already covers `ResultSheet`.
- **Code format:** 16+ chars from an unambiguous alphabet (e.g. Crockford base32, no
  0/O/1/I/L), generated with `node:crypto` `randomBytes` (no `Math.random`). Helper
  `generateVerificationCode()` (pure-ish; seeded by crypto). Collision → unique constraint
  retry (vanishingly rare).

### Release integration
In `release.service.release(...)`, set `verificationCode` on each `ResultSheet` at creation
(generate per sheet). Existing released sheets have `null` until lazily filled (below).

### Authenticated report-card — `report-card.service.ts` (`results.release`, explicit scoping, IDOR)
`GET /v1/assessment/report-card?studentId=&termId=`:
1. `schoolId = TenantContext.schoolIdOrThrow()`. Validate the student's `ResultSheet`
   (`findFirst { schoolId, studentId, termId }`, include student/class/term/entries→subject)
   → 404 if none (not released).
2. If `verificationCode` is null, generate one and persist (`update { where:{id, schoolId},
   data:{ verificationCode } }`; retry on unique collision).
3. Load grade boundaries (`{schoolId}`, desc) for the legend + the class size (count of
   `ResultSheet` in that class+term).
4. Return:
```
{ school: { name }, student: { name, admissionNo? }, className, term: { label },
  entries: [{ subjectId, subjectName, total, grade }], average, position, classSize,
  releasedAt, gradeKey: [{ grade, minScore, remark }], verificationCode }
```

### Public verification — `PublicModule` / `public.controller.ts` (NO guard, NO tenant)
`GET /v1/public/verify/:code` (no `@UseGuards`, no `TenantContext`):
- `resultSheet.findUnique({ where: { verificationCode: code }, include: student/class/term/school })`.
- Not found → `{ valid: false }` (HTTP 200, so the public page renders a clean "not found").
- Found → `{ valid: true, student: name, className, term: label, school: name, average,
  position, issuedAt: releasedAt }`. **Never** include per-subject entries or ids.
- Protection = the unguessable code. (Note: a basic rate-limit/throttle is a future hardening;
  out of scope here.)
- Registered in `AppModule` as its own module so it is visibly outside the tenant-guarded
  assessment surface.

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
- **API e2e** (extend `assessment.e2e-spec.ts` + a public e2e): report-card returns the frozen
  sheet + a `verificationCode`; the code is **idempotent** (same on re-fetch); a sheet released
  before the code existed gets one lazily; **cross-tenant** report-card (school B → A's student)
  → 404. Public verify: valid code → minimal payload (asserts NO `entries`/ids leak); unknown
  code → `{ valid: false }`; works with **no auth header / no tenant context**.
- **Web:** light render check (optional).
- **Browser QA:** open a student's report card from `/release` → print preview shows
  letterhead + table + QR → open the verify URL (decode/scan or paste the code) → public page
  confirms authenticity (minimal fields only) → tamper the code → invalid state.

## Dependencies
- Slice 4 (`ResultSheet`/entries, release), grade boundaries (slice 1), tenancy + permission
  stack. New web dep: `qrcode` (client-side QR). No new API deps (crypto is built-in).

## Release note / follow-up
- New releases get a `verificationCode` automatically; pre-slice-5 sheets get one on first
  report-card open (lazy). No proprietor action needed.
- Future hardening: rate-limit/throttle `GET /v1/public/verify/:code`; optional logo upload
  for the letterhead; bulk whole-class PDF.

## Out-of-scope future
- Slice 6: reveal animation (Framer Motion) on results viewing.
- Parent portal / identity-linked self-serve report cards.
