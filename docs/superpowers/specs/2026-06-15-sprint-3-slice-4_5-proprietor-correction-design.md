# Sprint 3 · Slice 4.5 — Proprietor-Signed Correction (Design)

- **Date:** 2026-06-15
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 4.5. The deferred half of slice-4 immutability.
- **Builds on:** slice 4 (`Release`/`ResultSheet`/`ResultSheetEntry`, `computePositions`, immutability guard), slice 2 (`Score`, `computeSubjectResult`, value-range rule), the auth/OTP stack, AuditLog.

## Goal

After a class's results are released and frozen, a **proprietor** corrects a single
component score (CA1/CA2/CA3/Exam) directly on the frozen sheet. The correction is
**OTP-signed** (step-up re-verification proves the proprietor holds the phone),
**reason-required**, and **fully audited** via a dedicated `Correction` record. The
system re-freezes the affected student (subject total/grade + average) and **re-ranks the
whole class**, keeping positions consistent.

## Scope (locked decisions)

1. **Targeted single-score correction.** The unit is one student's one component score
   on a released class. Full "unlock the whole class → free-edit → re-release" window is
   **deferred** to a later slice (YAGNI).
2. **Step-up OTP signature + new permission.** New `results.correct` permission
   (PROPRIETOR-only auto-grant). Each correction requires (a) the permission, (b) a
   single-use OTP re-verified at correction time, (c) a non-empty reason.
3. **Re-freeze affected student + re-rank whole class.** Update the corrected student's
   frozen entry + average; recompute positions for ALL students in the class from their
   stored averages. Other students' entries/averages are untouched; only their `position`
   may change.
4. **Correction modal on `/release`.** The action lives on the released sheet.
5. **Dedicated `Correction` model** for queryable, durable signed history (the generic
   AuditLog middleware still logs the underlying mutations).

### Non-goals
- Unlock-window / free-edit-then-re-release (future slice).
- Correcting non-score fields (names, subjects, structure).
- Report-card PDF (slice 5), reveal animation (slice 6).
- Cryptographic signatures — "signed" = authorized actor + single-use OTP + reason in the
  audit trail.

## Architecture

Extends `apps/api/src/modules/assessment/` with a correction service + controller, a new
`Correction` model, and a reusable `AuthService.assertOtp`. Web adds a correction modal to
the existing `/release` page + api client methods. Re-uses `computeSubjectResult`
(slice 2) and `computePositions` (slice 4) — no new pure helper.

### Data model — `Correction` (tenant-scoped: TENANT_MODELS + RLS FORCE + migration)
`id, schoolId, classId, termId, studentId, subjectId, assessmentTypeId, oldValue Int,
newValue Int, oldTotal Int, newTotal Int, oldPosition Int, newPosition Int, reason String,
correctedBy String, correctedAt DateTime @default(now())`.
- Relations to School/Class/Term/Student/Subject/AssessmentType (+ back-relations).
- `@@index([schoolId, classId, termId])`.
- Add `"Correction"` to `TENANT_MODELS`; RLS FORCE migration mirroring `rls_release`.
- `oldValue`/`newValue` = component-level score; `oldTotal`/`newTotal` = subject total;
  `oldPosition`/`newPosition` = the corrected student's position before/after.

### Step-up OTP — `AuthService.assertOtp(phone, code)`
- Mirrors `verifyOtp`'s validation (latest unexpired `OtpRequest` for `phone`, bcrypt
  compare) but returns `void`, issues **no JWT**, and **single-uses** the code (invalidate
  on success so a replay fails). Throws `BadRequestException("Invalid or expired code.")`
  on failure.
- The correction request carries `otpCode`. The server resolves the actor's phone from
  `req.user` (the JWT), then calls `assertOtp(actorPhone, otpCode)`. The web "Send code"
  button reuses the existing `POST /auth/otp/request { phone }` for the proprietor's own
  phone.

### Correction flow — `correction.service.ts` (`results.correct`, explicit schoolId scoping, IDOR)
`correct({ classId, termId, studentId, subjectId, assessmentTypeId, newValue, reason, otpCode }, actor)`:
1. `assertOtp(actor.phone, otpCode)` → 400 on invalid/expired/replayed.
2. Validate `reason` non-empty → 400.
3. Tenant-validate class + term (`findFirst { id, schoolId }`) → 404. A `Release` must
   exist for (classId, termId, schoolId) → else 409 ("Class not released; edit in the
   gradebook."). The student must have a `ResultSheet` in that release → 404. The
   `assessmentType` must be this tenant's → 404.
4. Validate `newValue` is an integer in `[0, assessmentType.maxScore]` → 400 (reuse the
   slice-2 value-range rule).
5. Capture `oldValue` (existing `Score.value` for (student, subject, type, term, school),
   else 0), `oldTotal` (the frozen `ResultSheetEntry.total` for this subject, else 0),
   `oldPosition` (the frozen `ResultSheet.position`).
6. One interactive `$transaction` (explicit `schoolId` on every write — `tx` runs no
   middleware):
   - Upsert the `Score` (by the unique `(studentId, subjectId, assessmentTypeId, termId)`)
     to `newValue` (set `classId`, `recordedBy = actor.id`, `schoolId`).
   - Recompute the subject's total + grade via `computeSubjectResult` over that subject's
     component scores → **update** the `ResultSheetEntry` (or **create** it if the subject
     had no scores at release; `@@unique([resultSheetId, subjectId])`).
   - Recompute the student's average = round(mean of that student's scored-subject
     totals) → update `ResultSheet.average`.
   - Recompute positions for ALL `ResultSheet`s in (classId, termId, schoolId) via
     `computePositions` over their stored averages → update each changed `position`.
   - Create the `Correction` record (oldValue/newValue, oldTotal/newTotal,
     oldPosition/newPosition for the corrected student, reason, correctedBy = actor.id).
7. Return the refreshed sheet (same shape as `getSheet`).

### Read for the modal
`GET /v1/assessment/correction/scores?classId=&termId=&studentId=&subjectId=`
(`results.correct`, tenant-scoped + IDOR) → the student+subject's components:
`[{ assessmentTypeId, name, value, maxScore }]` (value = current `Score.value` or null),
so the modal shows current values + which component to correct.

### Validation & errors
- Invalid/expired/replayed OTP → 400. Empty reason → 400. `newValue` out of range → 400.
- Foreign class/term/student/type → 404 (explicit scoping; `Enrollment`/`ResultSheet`
  gated by tenant-scoped finds).
- Correcting a class with no `Release` → 409.
- Correcting a previously-unscored subject's component → creates the `ResultSheetEntry`
  and folds it into the student's average (no crash, average reflects the new subject).

## Web — correction modal on `/release` (`results.correct`)
On the released sheet, a per-student **Correct** affordance opens a modal:
- Pick **subject** (from the student's frozen entries) → **component** list with current
  values (via `getCorrectableScores`) → **new value** + **reason** + **OTP code** field
  with a **Send code** button (reuses `requestOtp` for the proprietor's own phone).
- Submit → `correctScore(...)` → on success the sheet refreshes (new totals/positions);
  errors (bad OTP, range, etc.) surface inline.
- api client: `getCorrectableScores(classId, termId, studentId, subjectId)`,
  `correctScore(payload)`, and reuse `requestOtp(phone)`. Loading/empty/error states.

## Testing
- **API e2e** (extend `assessment.e2e-spec.ts`): correction updates `Score` + entry total/
  grade + average + **re-ranks the class** (design a fix that flips order); the
  `Correction` row captures old/new value + total + position + reason + correctedBy; OTP
  invalid → 400; **OTP single-use** (replay the same code → 400); missing reason → 400;
  `newValue` out of range → 400; correcting an **unreleased** class → 409; **cross-tenant**
  (school B corrects A's student) → 404; correcting a **previously-unscored** subject
  component → entry created + average updated; explicit scoping holds.
- **Auth e2e:** `assertOtp` accepts a fresh code once and rejects the replay + expired.
- **Web:** optional light render check.
- **Browser QA:** on `/release` for the released class, correct a component → enter reason
  + send/enter OTP → submit → sheet re-ranks + totals update; bad OTP surfaces an error.

## Dependencies
- Slice 4 (`Release`/`ResultSheet`/`ResultSheetEntry`, `computePositions`, immutability),
  slice 2 (`Score`, `computeSubjectResult`, value-range), the auth/OTP stack (`OtpRequest`,
  `SmsService`, `requestOtp`/`verifyOtp`), AuditLog (auto-middleware), tenancy stack.
- New permission `results.correct` (seeded + PROPRIETOR auto-grant). No new npm deps.

## Release note / follow-up
- `results.correct` auto-grant only fires for proprietors created after this deploy —
  **backfill** `results.correct` for any pre-existing PROPRIETOR (same gap noted for
  `assessment.configure` in slice 1).

## Out-of-scope future
- Unlock-window correction (free-edit then re-release a whole class).
- Slice 5: report-card PDF + public verification (consumes `getReleasedSheet`).
- Slice 6: reveal animation.
