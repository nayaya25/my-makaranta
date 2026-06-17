# Sprint 6 · Slice 2 — Announcement Receipts + Staff Audience (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 6 (Communication), slice 2 — delivery/read receipts + a staff audience. Solves the PRD pain "the principal cannot tell a board member which parents received the closure notice."
- **Builds on:** slice 1 (`apps/api/src/modules/announcements/`, `Announcement` + `AnnouncementRecipient`, `AnnouncementsService`, staff `/announcements` + parent `/parent/announcements`), `SmsService`/`EmailService`, `Staff` (phone + email), seeded perms `announcements.create`/`.view`.

## Goal

An author sees, per announcement, exactly who received it (by channel) and who has read it; and can target
**staff** as recipients (delivered by SMS/email) in addition to parents. Closes the "who got the notice?"
gap and broadens reach to staff.

## Codebase reality that shaped scope (important)
- `Student` has **no phone/email**, and there is **no student login** (only `PENDING`/`PARENT`/`PROPRIETOR`
  identities are ever provisioned). Students therefore cannot be delivered to or read an inbox → **student
  audiences are out of scope** until the student app + student identity exist.
- There is **no staff login** yet either. Staff **can** receive SMS/email (they have `phone`+`email`), so
  staff are valid recipients now; an **in-app staff inbox is deferred** (unreachable without staff login),
  so a staff recipient's `readAt` simply stays null (the receipts view shows them delivered-but-not-read).

## Scope (locked decisions, slice 2)
1. **Receipts breakdown** — an author-facing per-recipient view (channel delivery + read state) + aggregates.
2. **Staff audience** — announcements can target staff (all school staff), delivered via SMS/email.
3. **Polymorphic recipient** — generalize `AnnouncementRecipient` from `parentId` to
   `recipientType ("PARENT"|"STAFF") + recipientId`, with a **data-preserving migration** for slice-1 rows.

### Non-goals
- Student audiences (no contact channel / no login); an in-app **staff** inbox (no staff login — deferred);
  direct messaging (slice 3); scheduled/queued send; WhatsApp; per-recipient resend; editing a sent
  announcement; a "mark all read" for the author. Staff scoping by class/subject (staff = ALL staff this
  slice).

## Architecture

Extend the slice-1 `announcements` module. One **hand-written** data migration generalizes
`AnnouncementRecipient`. `AnnouncementsService` gains a `roles` axis in `create`, per-type recipient
resolution + fan-out, and a `getRecipients` (receipts) method. A new author route `GET /v1/announcements/:id`.
The parent inbox keeps working (queries shift from `parentId` to `recipientType="PARENT"`/`recipientId`).
Web: role toggles on the compose page + a receipts detail page. No new npm deps.

### Model change (`AnnouncementRecipient`)
```prisma
model AnnouncementRecipient {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  announcementId String
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  recipientType  String       // "PARENT" | "STAFF"
  recipientId    String       // Parent.id or Staff.id (polymorphic — no FK)
  readAt         DateTime?
  smsSent        Boolean      @default(false)
  emailSent      Boolean      @default(false)

  @@unique([announcementId, recipientType, recipientId])
  @@index([schoolId, recipientType, recipientId])
}
```
Remove `parentId`, the `parent Parent @relation`, and `Parent.announcementRecipients`.

**Data migration (hand-written, preserves slice-1 rows):**
1. `ALTER TABLE "AnnouncementRecipient" ADD COLUMN "recipientType" TEXT;` and `ADD COLUMN "recipientId" TEXT;`
2. `UPDATE "AnnouncementRecipient" SET "recipientType" = 'PARENT', "recipientId" = "parentId";`
3. `ALTER COLUMN "recipientType" SET NOT NULL; ALTER COLUMN "recipientId" SET NOT NULL;`
4. Drop the old `@@unique([announcementId, parentId])` index + the `parentId` FK constraint + the `parentId`
   column.
5. Add `@@unique([announcementId, recipientType, recipientId])` + the new `@@index`.
(Generate the Prisma migration with `--create-only` and replace its SQL with the above so no data is lost;
RLS already applies to the table — unchanged.)

### `create(dto, user)` — `dto.roles: ("PARENT"|"STAFF")[]` (non-empty)
- `roles` empty → 400. Build a recipient list of `{ recipientType, recipientId }`:
  - **PARENT** in roles → resolve parents from `audienceType`/`audienceIds` (slice-1 logic, re-validated via
    `Parent {schoolId}`) → `{ "PARENT", parentId }`.
  - **STAFF** in roles → all `Staff` in the school (`staff.findMany({ where: { schoolId } })`) →
    `{ "STAFF", staffId }`. (`audienceType`/`audienceIds` do not constrain staff.)
- Dedup within each type. In a `$transaction`: create the `Announcement` (channels `["IN_APP", ...selected]`)
  + `AnnouncementRecipient` rows (`createMany`).
- Fan out best-effort (non-fatal): for each recipient resolve its contact — PARENT via `Parent` (phone/email),
  STAFF via `Staff` (phone/email) — and `sms.send`/`email.send` per selected channel; set `smsSent`/`emailSent`.
  (Batch-load parents + staff by id once; iterate.)
- Returns `{ id, recipientCount }`.

### `getRecipients(announcementId)` — receipts (`announcements.view`)
- Load the announcement `findFirst({ id, schoolId })` → **404** if not this school's.
- Load its `AnnouncementRecipient` rows; batch-resolve names: `Parent` ids → "First Last", `Staff` ids →
  "First Last" (both `schoolId`-scoped). Return:
  `{ id, title, body, audienceType, channels, sentAt, aggregates: { total, readCount, smsCount, emailCount }, recipients: [{ recipientType, recipientId, name, smsSent, emailSent, readAt }] }`.
  (`name` falls back to "Unknown" if an id no longer resolves.)

### Parent inbox (`getForParent`/`markRead`) — unchanged behavior
- `getForParent`: `where: { schoolId, recipientType: "PARENT", recipientId: user.identityId }`.
- `markRead`: `updateMany({ where: { schoolId, announcementId, recipientType: "PARENT", recipientId:
  user.identityId }, data: { readAt } })` → count 0 → 404. (Identity-gated, PARENT only — as slice 1.)

### Web
- **Compose `/announcements`**: add **Parents** / **Staff** checkboxes (≥1 required; default Parents on). When
  Staff is checked, show a hint "Staff: all staff" (the level/class selector scopes parents only). Send
  passes `roles`.
- **Receipts `/announcements/[id]`** (new): fetch `getAnnouncementReceipts(id)` → header (title/body/sentAt +
  aggregate "X of Y read · Z SMS · W email") + a table (Recipient · Type · SMS ✓ · Email ✓ · Read ✓/—). The
  sent-list items on `/announcements` link here.
- api client: `createAnnouncement` gains `roles`; add `getAnnouncementReceipts(id)` (+ types). The
  `SentAnnouncement` list item links to the receipts route.

## Validation & errors
- `roles` empty / invalid value → 400.
- PARENT role + LEVEL/CLASS with empty or foreign `audienceIds` → 400 (slice-1 validation).
- Receipts for a foreign / non-existent announcement id → 404.
- Per-recipient SMS/email failure → non-fatal (row persists, flag false).
- Staff recipients never get `readAt` set (no staff read path yet) — expected, surfaced in receipts as "—".

## Testing
- **API e2e** (extend `test/announcements.e2e-spec.ts`): seed parents (incl. a 2-kids dedup parent) + staff.
  `create({ roles: ["PARENT","STAFF"], audienceType: "CLASS", audienceIds: [c1] })` → recipients = the
  class's parents (deduped) + ALL staff, each `smsSent`/`emailSent` true (channels selected); `recipientType`
  split correct. `roles: ["STAFF"]` (audienceType ALL) → all staff, zero parent rows. `getRecipients(id)` →
  per-recipient breakdown with names + aggregates (`total`, `readCount` 0, `smsCount`, `emailCount`). Mark a
  parent read → `getRecipients` `readCount` 1 and that row's `readAt` set; staff rows `readAt` null. Foreign
  announcement id → 404. **Migration regression:** the slice-1 parent inbox path still returns a parent's rows
  (resolution via `recipientType="PARENT"`). Cross-tenant: school B sees none.
- **Unit:** none new required (logic is query-shaped); add one if a pure aggregate helper is extracted.
- **Web:** light (optional).
- **Browser/HTTP QA:** as a proprietor → `POST` with roles ["PARENT","STAFF"] → recipientCount = parents +
  staff; mock SMS/email logged for both; `GET /v1/announcements/:id` → the breakdown (staff rows show
  SMS/email ✓, Read —); parent logs in → reads → receipts `readCount` increments.

## Dependencies
- Slice 1 announcements module + models; `Staff` (phone/email); `SmsService`/`EmailService`; `Parent`/
  `Guardian`/`Student`/`Enrollment`; seeded `announcements.create`/`.view`. One data-preserving migration
  (no RLS change — the table is already RLS-protected). No new npm deps.

## Out-of-scope future
- Student audiences + in-app staff/student inboxes (need student app + staff/student login); slice 3 direct
  messaging; scheduled/queued send; WhatsApp; resend; staff scoping by class/subject; edit/delete.
