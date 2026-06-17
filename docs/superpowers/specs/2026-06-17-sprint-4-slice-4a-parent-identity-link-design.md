# Sprint 4 · Slice 4a — Parent Identity Link (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 4 (Fees & Payments), slice 4a — the identity foundation for parent self-serve. Builds on the auth/OTP stack + SIS `Parent`/`Guardian`.
- **Builds on:** `AuthService.verifyOtp` (auto-provisions a PENDING `User`), `User.identityType`/`identityId`/`schoolId`/`tokenVersion`, `Parent` (phone+email, tenant-scoped), `Guardian` (Parent↔Student), `UserPermission`, seeded perms `fees.pay.own` + `results.view.own`.

## Goal

When a parent logs in via phone-OTP, auto-link their (PENDING) `User` to their `Parent` record so
they become a recognized parent with the right permissions and resolvable children — the identity
foundation the parent pay portal (4b) builds on.

## Sprint 4 slice 4 decomposition (context)
- **4a — parent identity link (THIS):** auto-link at login + parent permissions + children resolution.
- **4b — parent pay portal:** parent-facing children/invoices view + Cash-App-style one-tap pay
  (reuse slice-2 `initializeOnline` + webhook + public receipt) + results-view-own; reshape the
  dashboard for parents.

## Scope (locked decisions, 4a)
1. **Auto-link at OTP verify** — a PENDING user whose phone matches exactly one `Parent` is claimed.
2. **Exactly-one-match only** — zero or multiple matches → stay PENDING (multi-school switching is
   future). **Only PENDING users are ever linked** (PROPRIETOR/STAFF never overridden).
3. **Grant `fees.pay.own` + `results.view.own`** on link (idempotent).
4. **`GET /v1/parent/children`** resolves the linked parent's Guardian→Student list.

### Non-goals
- Parent portal UI, invoices view, one-tap pay, results-view UI (all 4b); multi-school switching;
  explicit claim codes; admin-driven linking; reshaping the dashboard (4b).

## Architecture

A private link step inside `AuthService.verifyOtp` + a small `ParentService`/controller for the
children endpoint. No new model, no migration (uses existing `User`/`Parent`/`Guardian`/
`UserPermission`).

### Link logic — `AuthService.verifyOtp` → private `linkParentIfMatch(user)`
After the existing resolve-or-create of the `User` for the phone, before signing the JWT:
- If `user.identityType !== "PENDING"` → return unchanged (never override PROPRIETOR/STAFF/etc.).
- Else find `Parent` records where `phone === user.phone`:
  - **exactly 1** → in a transaction: `user.update({ identityType: "PARENT", identityId: parent.id,
    schoolId: parent.schoolId, tokenVersion: { increment: 1 } })`; resolve the permission ids for
    `["fees.pay.own", "results.view.own"]` and `userPermission.createMany({ data: [...], skipDuplicates: true })`.
    Re-read/return the updated user so the signed JWT carries `PARENT` + `schoolId`.
  - **0 or >1** → no change (stays PENDING).
- Idempotent: a returning parent is already `PARENT` (not PENDING) → the link step is a no-op.
- The `Parent`-by-phone query runs with NO tenant context (login has no JWT yet) — `Parent` is a
  tenant model so the `$use` middleware injects no `schoolId` filter when context is null → the
  cross-school count is correct (dev superuser). (Prod RLS GUC wiring remains the standing
  pre-deploy task; same note as slices 5 / 3b.)

### Children resolution — `parent.service.ts` + `parent.controller.ts`
`GET /v1/parent/children` (authenticated; `JwtAuthGuard`):
- From `req.user` (the JWT), require `identityType === "PARENT"` with an `identityId` → else return
  `[]` (a non-parent has no children here).
- `schoolId = TenantContext.schoolIdOrThrow()` (the parent's JWT carries it). Load `Guardian`s for
  `parentId === identityId` (validate the `Parent` is this tenant's via a scoped find), include
  `student` (+ the student's current class via the latest enrollment if cheap; otherwise omit
  `className`). Return `[{ studentId, name, admissionNo, className? }]`.
- Guard the controller with `JwtAuthGuard` only (no permission decorator — any authenticated parent
  reads their own children; non-parents get `[]`). The handler reads `identityType`/`identityId`
  from `@CurrentUser()`.

### Permissions
`fees.pay.own` + `results.view.own` granted at link (resolved by key from the `Permission` catalog;
both seeded). Idempotent via `skipDuplicates`. These gate 4b's parent endpoints.

## Validation & errors
- Non-PENDING user → never relinked (PROPRIETOR/STAFF safe).
- Zero / multiple Parent matches → user stays PENDING (a PENDING user has `schoolId = null`, so
  tenant-scoped reads return nothing — they simply aren't a parent here yet).
- `/v1/parent/children` for a non-PARENT or unlinked user → `[]` (not an error).
- A `Parent` with no guardianed students → `[]`.

## Testing
- **API e2e** (`parent-link.e2e-spec.ts`, or extend `auth.e2e-spec.ts`): seed a `Parent` (phone P,
  with a Guardian→Student) in school A → `authService.verifyOtp(P, code)` → returned user is
  `identityType "PARENT"`, `identityId = parent.id`, `schoolId = A.id`; the user has `fees.pay.own`
  + `results.view.own` (assert `UserPermission` rows); `parentService.getChildren(user)` (or the
  controller path) returns the guardianed student. **Zero-match** phone → stays PENDING
  (`identityType "PENDING"`, `schoolId null`). **Multi-match** (a Parent with phone P in school A
  AND school B) → stays PENDING (no link). **PROPRIETOR** whose phone also matches a Parent → stays
  PROPRIETOR. **Re-login idempotent** → no duplicate `UserPermission`, still PARENT. (Use
  `SmsService.lastCodeForTest` for the OTP code, as the existing auth e2e does.)
- **Browser/API QA:** OTP-login as a seeded parent phone → the returned JWT/`GET /me` shows PARENT +
  schoolId → `GET /v1/parent/children` returns the kids.

## Dependencies
- Auth/OTP stack, `Parent`/`Guardian` (SIS), `UserPermission`, seeded `fees.pay.own` +
  `results.view.own`. No new npm deps, no model, no migration.

## Out-of-scope future
- 4b parent pay portal + results-view UI; multi-school parent switching; explicit claim/verify
  codes; parent profile/self-service edits.
