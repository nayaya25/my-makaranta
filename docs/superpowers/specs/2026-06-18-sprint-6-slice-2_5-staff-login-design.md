# Sprint 6 · Slice 2.5 — Staff Login + Staff Inbox (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 6 (Communication) — an identity prerequisite that unblocks direct messaging (slice 3) and makes slice-2 staff announcement receipts meaningful. Surfaced as a blocker during slice 2: only `PROPRIETOR` + `PARENT` identities are ever provisioned, so staff cannot log in.
- **Builds on:** `AuthService.verifyOtp` + `linkParentIfMatch` (the exact pattern to mirror), `Staff` (phone + email), `User`/`identityType`/`identityId`/`tokenVersion`, the polymorphic `AnnouncementRecipient` (slice 2), the parent announcements inbox (slice 1).

## Goal

When a staff member logs in via phone-OTP, auto-link their (PENDING) `User` to their `Staff` record so
they become a recognized `STAFF` identity, and let them read announcements targeted to them (so slice-2
staff receipts' `readAt` finally populates). Identity only — staff **tool** permissions are a separate slice.

## Scope (locked decisions, slice 2.5)
1. **Staff identity link at OTP verify** — a PENDING user whose phone matches **exactly one identity total**
   (one Staff, and no Parent) is claimed as `STAFF`.
2. **No permission grants** on staff link — a STAFF identity ≠ tool access. Identity-gated surfaces (inbox,
   later DM) need only the identity; RBAC assignment for staff tools is a future slice.
3. **Generalize the announcements inbox** to any identity (`recipientType = identityType`) + a staff `/inbox`
   web page. The existing parent inbox routes stay (delegate to the generalized method) — no parent churn.

### Non-goals
- Staff **permission/RBAC assignment** (who grants a teacher `results.record`?) — separate slice; nav-by-
  permission cleanup; direct messaging (slice 3, now unblocked); student login/identity (no contact channel);
  staff invitation/claim-code flow; resolving the parent-who-is-also-staff ambiguity (left PENDING); a staff
  profile/self-edit.

## Architecture

A single private `linkIdentityIfMatch(user)` in `AuthService` replaces `linkParentIfMatch` (handles Parent
**and** Staff, with a combined one-match rule). `AnnouncementsService` generalizes its parent-inbox methods
to any identity. New `GET/POST /v1/me/announcements[...]` routes; the parent routes stay as thin delegators.
A staff `/inbox` web page. No new model, no migration, no new npm deps.

### Identity link — `AuthService.verifyOtp` → private `linkIdentityIfMatch(user)`
Replaces `linkParentIfMatch`. For a PENDING user with a phone:
- Query `parent.findMany({ where: { phone } })` (id, schoolId) and `staff.findMany({ where: { phone } })`
  (id, schoolId). `total = parents.length + staff.length`.
- `total !== 1` → return the user unchanged (PENDING). This covers **zero**, **multiple parents**, **multiple
  staff**, and the **one-parent-AND-one-staff** ambiguity (same phone on both → not auto-linked; explicit
  claim is future work).
- The single match is a **Parent** → existing behavior verbatim: atomic conditional `updateMany` claim
  (`identityType=PENDING` → `PARENT` + `identityId=parent.id` + `schoolId` + `tokenVersion++`), grant
  `fees.pay.own`/`results.view.own` (perm ids resolved inside the txn, `skipDuplicates`), best-effort audit
  `User.linkParent`.
- The single match is a **Staff** → atomic conditional `updateMany` claim (`identityType=PENDING` → `STAFF` +
  `identityId=staff.id` + `schoolId=staff.schoolId` + `tokenVersion++`); **no permission grants**; best-effort
  audit `User.linkStaff` (`after: { identityType: "STAFF", identityId, schoolId }`). Re-read + return the
  updated user so the signed JWT carries `STAFF` + `schoolId` + `identityId`.
- Non-PENDING users are never relinked (PROPRIETOR/PARENT/STAFF safe), as today.
- (The `Parent`/`Staff`-by-phone queries run with no tenant context at login — middleware injects no
  `schoolId` filter when context is null, so the cross-school match count is correct. Prod RLS GUC wiring
  remains the standing pre-deploy task.)

### Inbox generalization — `AnnouncementsService`
- Rename `getForParent(user)` → `getInbox(user)` and `markRead(id, user)` → `markReadForUser(id, user)`:
  - Valid identities: `recipientType = user.identityType` when it is `"PARENT"` or `"STAFF"` (else `getInbox`
    returns `[]`, `markReadForUser` throws 404). `recipientId = user.identityId`.
  - `getInbox`: `announcementRecipient.findMany({ where: { schoolId, recipientType, recipientId: identityId },
    include announcement (title/body/sentAt), orderBy sentAt desc })` → the existing row shape.
  - `markReadForUser`: `updateMany({ where: { schoolId, announcementId, recipientType, recipientId:
    identityId }, data: { readAt } })` → count 0 → 404.
- Routes (in `AnnouncementsController`):
  - **`GET /v1/me/announcements`** (`JwtAuthGuard`) → `getInbox(user)`.
  - **`POST /v1/me/announcements/:announcementId/read`** (`JwtAuthGuard`) → `markReadForUser(...)`.
  - Keep **`GET /v1/parent/announcements`** + **`POST /v1/parent/announcements/:id/read`** as thin delegators
    to the same methods (so the slice-1 parent web is unchanged).

### Web — staff `/inbox`
- New `apps/web/src/app/(app)/inbox/page.tsx` (`"use client"`): fetch `api.getMyAnnouncements()` → list
  (title, sentAt, unread dot) → tap shows body + `api.markMyAnnouncementRead(announcementId)` → unread clears.
  Mirrors the parent inbox UI. Reachable by any logged-in identity (staff/proprietor/parent), but surfaced via
  the **staff nav**.
- `(app)/layout.tsx`: add an **Inbox** `NAV_ITEMS` entry (`/inbox`, an `Inbox`/`Mail` lucide icon) — shown to
  non-parent staff (the existing staff nav). (Parents keep their `/parent/announcements` entry.)
- api client: `getMyAnnouncements()` + `markMyAnnouncementRead(id)` (reuse the `ParentAnnouncement` shape, or a
  shared `InboxAnnouncement` type).

## Validation & errors
- Non-PENDING user → never relinked.
- Zero / multiple / cross-type ambiguous phone match → stays PENDING (`schoolId` null → reads nothing).
- `GET /v1/me/announcements` for a non-PARENT/STAFF identity (e.g. PENDING/PROPRIETOR) → `[]` (no recipient
  rows of that type); mark-read a non-recipient/foreign announcement → 404.
- Staff link grants **no** permissions — a staff hitting a perm-gated endpoint still 403s (expected).

## Testing
- **API e2e** (extend `test/auth.e2e-spec.ts` or a focused `staff-link.e2e-spec.ts`, + `announcements`):
  seed a `Staff` (phone S) in school A. `authService.verifyOtp(S, code)` → returned user `identityType
  "STAFF"`, `identityId = staff.id`, `schoolId = A`; assert **no** `UserPermission` rows for that user. A phone
  matching **one Parent AND one Staff** → stays `PENDING` (`schoolId` null). **Zero-match** → PENDING.
  **Multi-staff** (same phone on two Staff) → PENDING. **PROPRIETOR/PARENT** whose phone also matches a Staff →
  not relinked. Re-login idempotent. Existing parent-link tests unchanged (a parent phone with no staff still
  links PARENT). **Inbox:** a STAFF recipient of an announcement → `getInbox(staffUser)` returns it,
  `markReadForUser` sets `readAt`, and the slice-2 `getRecipients` `readCount` reflects the staff read; a
  parent's inbox via `getInbox` still works. (Use `SmsService.lastCodeForTest` for OTP as the auth e2e does.)
- **Web:** light.
- **Browser/HTTP QA:** seed a Staff who is an announcement recipient → OTP-login that phone → `GET /me` shows
  `STAFF` + `identityId` + `schoolId` → `GET /v1/me/announcements` returns the announcement → mark read → the
  author's receipts (`GET /v1/announcements/:id`) show that staff row as Read ✓. A parent login still reads
  their inbox.

## Dependencies
- Auth/OTP stack + `linkParentIfMatch` (pattern + the parent branch reused), `Staff` (phone), `User`/
  `UserPermission`, `JwtStrategy` (re-reads identity), slice-1/2 announcements + polymorphic recipient. No new
  npm deps, no model, no migration.

## Out-of-scope future
- Staff permission/RBAC assignment + nav-by-permission; slice 3 direct messaging; student login/identity;
  staff invitation/claim codes; resolving the parent+staff same-phone ambiguity (explicit claim).
