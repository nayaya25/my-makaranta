# Sprint 6 · Slice 1 — Broadcast Announcements (Design)

- **Date:** 2026-06-17
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 6 (Communication), slice 1 — the first slice of the last MVP module (PRD §4.8). Ends the "WhatsApp scramble for security alerts" (principal story #5, proprietor story #5).
- **Builds on:** `SmsService` (core/auth), `EmailService` (`EMAIL_SERVICE` token, core/email) + the guardian→parent fan-out (fee-reminder pattern in `collections.service`), the parent portal/shell (slice 4b), role-aware nav (4b), tenant middleware + RLS, seeded perms `announcements.create` + `announcements.view` (proprietor-auto-granted).

## Goal

A principal/proprietor composes a broadcast announcement targeting an audience (whole school / a
class-level / a class); it is persisted, every targeted student's parents get an in-app inbox entry plus
(optionally) an SMS and email, and parents read it in their portal. The author sees how many recipients
read it. Ends the WhatsApp-broadcast workaround for school-to-parent communication.

## Communication module decomposition (context)
- **Slice 1 — broadcast announcements (THIS):** author compose + audience resolution + in-app recipient
  records + SMS/email fan-out + parent inbox + mark-read + author sent list with read counts.
- **Slice 2 — delivery/read receipts + staff/student audiences:** author-facing per-recipient receipt
  breakdown; extend audience to staff and students.
- **Slice 3 — direct messaging:** parent ↔ form-teacher `Conversation`/`Message` threads.
- **Deferred (PRD Phase 2):** WhatsApp Business channel; scheduled send (`scheduledAt`); rich media;
  translation; teacher↔HOD messaging; a BullMQ delivery queue for very large sends.

## Scope (locked decisions, slice 1)
1. **Broadcast only, recipients = parents.** Staff/student recipients are slice 2.
2. **Three channels:** in-app (always — the inbox), SMS + email (author-toggled), reusing `SmsService`/
   `EmailService` + the guardian fan-out.
3. **Synchronous delivery** on create (matches the fee-reminder bulk pattern). A BullMQ queue for very
   large "ALL" sends is a noted future, not this slice.
4. **Reuse seeded perms** `announcements.create` (compose) + `announcements.view` (sent list); the parent
   inbox is **identity-gated** (PARENT + own records), not perm-gated — no new permission, no backfill.

### Non-goals
- Read-receipt detail breakdown per parent (slice 2 — slice 1 gives an aggregate read count); staff/student
  audiences; direct messaging; scheduled/queued send; WhatsApp; rich media/attachments; translation;
  editing/deleting a sent announcement; per-parent channel preferences.

## Architecture

New `apps/api/src/modules/announcements/` (`AnnouncementsModule`, `AnnouncementsController`,
`AnnouncementsService`). Two new tenant-scoped models + a models migration + an RLS migration (mirroring
`fees`/`payments`). `AnnouncementsModule` imports `[AuthModule, EmailModule]` (for `SmsService` +
`EMAIL_SERVICE`). The parent inbox routes live in this module too (under `/v1/parent/announcements`) to
keep the announcements code together. Web: a staff `/announcements` page + a parent `/parent/announcements`
inbox + nav entries.

### Models (add to `schema.prisma`; register in `TENANT_MODELS`; RLS FORCE)
```prisma
model Announcement {
  id           String   @id @default(cuid())
  schoolId     String
  school       School   @relation(fields: [schoolId], references: [id])
  authorId     String                       // the creating user's id
  title        String
  body         String                       // plain text / light markdown
  audienceType String                       // "ALL" | "LEVEL" | "CLASS"
  audienceIds  String[]                     // classLevelIds or classIds; empty for ALL
  channels     String[]                     // subset of ["IN_APP","SMS","EMAIL"]; IN_APP always present
  sentAt       DateTime @default(now())
  recipients   AnnouncementRecipient[]

  @@index([schoolId, sentAt])
}

model AnnouncementRecipient {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  announcementId String
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  parentId       String
  parent         Parent       @relation(fields: [parentId], references: [id])
  readAt         DateTime?
  smsSent        Boolean      @default(false)
  emailSent      Boolean      @default(false)

  @@unique([announcementId, parentId])
  @@index([schoolId, parentId])
}
```
(Add the back-relations `announcements Announcement[]` + `announcementRecipients AnnouncementRecipient[]`
to `School`, and `announcementRecipients AnnouncementRecipient[]` to `Parent`.)

### Endpoints
- **`POST /v1/announcements`** (`JwtAuthGuard` + `PermissionGuard`, `announcements.create`)
  `{ title, body, audienceType: "ALL"|"LEVEL"|"CLASS", audienceIds: string[], channels: ("SMS"|"EMAIL")[] }`:
  1. Validate: title/body non-empty; `audienceType` valid; for LEVEL/CLASS, `audienceIds` non-empty and
     every id belongs to this school (tenant-IDOR → 400/404 on a foreign id).
  2. Resolve recipient parents (see below), dedup by `parentId`.
  3. In a transaction: create the `Announcement` (`channels = ["IN_APP", ...selected]`, `authorId =
     user.id`) + `AnnouncementRecipient` rows (`createMany`, one per parent).
  4. Fan out best-effort (per-recipient failures non-fatal, like fee reminders): if `SMS` selected →
     `sms.send(parent.phone, "{title} — {body}")` then set `smsSent`; if `EMAIL` selected and the parent
     has an email → `email.send({...})` then set `emailSent`. (Update the recipient flags in a batch after.)
  5. Return `{ id, recipientCount }`.
- **`GET /v1/announcements`** (`announcements.view`) → the school's announcements ordered `sentAt` desc,
  each with `recipientCount` + `readCount` (`AnnouncementRecipient` counts) + `audienceType`/`audienceIds`.
- **`GET /v1/parent/announcements`** (`JwtAuthGuard`; handler requires `identityType === "PARENT"` with
  `identityId`, else `[]`) → the parent's `AnnouncementRecipient` rows joined to the announcement →
  `[{ id (recipientId), announcementId, title, body, sentAt, readAt }]`, ordered `sentAt` desc.
- **`POST /v1/parent/announcements/:announcementId/read`** (`JwtAuthGuard`; PARENT) → set `readAt = now()`
  on the parent's own recipient row: `updateMany({ where: { announcementId, parentId: identityId, schoolId },
  data: { readAt } })`; resulting count 0 → 404 (not their announcement / wrong school — no ownership leak).

### Recipient resolution (`schoolId`-scoped, current term for LEVEL/CLASS)
- **ALL** → all `Student`s in the school → their `Guardian`s → distinct `parentId`s.
- **LEVEL** → validate the `classLevelIds` are this school's; students enrolled this **current term**
  (`Term.isCurrent`) in classes whose `classLevelId ∈ audienceIds` → guardians → distinct parents.
- **CLASS** → validate the `classIds` are this school's; students enrolled this current term in those
  classes → guardians → distinct parents.
- Dedup by `parentId` (a parent with two targeted children gets ONE recipient row). Resolving to zero
  parents is allowed — the announcement is still created with `recipientCount: 0`.
- ALL never depends on a term. LEVEL/CLASS resolve through the **current term's** enrollments; if the
  school has no current term, they resolve to zero recipients (the announcement is still created).

### Web
- **Staff `/announcements`** (nav entry, behind `announcements.create`): compose form — `title`, `body`
  (textarea), audience selector (radio All / Level / Class → when Level/Class, a multi-select of the
  school's class-levels or classes), channel toggles (SMS, Email; in-app implied) → `POST` → success
  toast with recipient count → sent list below (title · audience summary · sentAt · "{readCount}/{recipientCount} read").
- **Parent `/parent/announcements`** (new parent nav entry "Announcements"): inbox list (title, sentAt,
  unread emphasis) → tapping an item shows the body and calls mark-read → unread badge clears. Reuses the
  parent shell + role-aware nav (extend `PARENT_NAV` with the Announcements entry).
- api client: `createAnnouncement`, `listAnnouncements`, `getParentAnnouncements`, `markAnnouncementRead`
  (+ types). Reuse `listAcademicYears`/class + class-level lists for the audience selector.

## Validation & errors
- Foreign `audienceId` (class/level not in the school) → 400 (`BadRequestException`, uniform).
- Empty/invalid `audienceType`, empty `title`/`body` → 400 (DTO validation).
- LEVEL/CLASS with `audienceIds: []` → 400.
- A parent marking-read an announcement that isn't theirs / wrong school → 404.
- Per-recipient SMS/email failure → non-fatal (the recipient row persists; the flag stays false).
- Non-parent calling the parent inbox → `[]`. Missing `announcements.create`/`.view` → 403.

## Testing
- **API e2e** (`announcements.e2e-spec.ts`, service-level, two-school A/B): seed school A with two class
  levels, two classes, students with guardians (incl. a parent with TWO children in scope to assert
  dedup), and a parent in another class. Assert: `POST` CLASS → recipient rows only for that class's
  parents, deduped; `sentAt` set; mock SMS/email invoked when channels selected + flags set; `POST` LEVEL
  and ALL resolve the right supersets; a **foreign class id** → rejected; `GET /announcements` →
  `recipientCount`/`readCount`. Parent inbox: `getParentAnnouncements` returns only the parent's rows;
  mark-read sets `readAt` and bumps `readCount`; **a different parent's** read attempt → 404; cross-tenant
  (school B) sees none.
- **Unit:** if a pure dedup/recipient-shaping helper is extracted, unit-test it (dedup, empty audience).
- **Web:** light (optional).
- **Browser/HTTP QA:** as a proprietor → compose an ALL announcement with SMS+Email → recipientCount > 0,
  mock SMS/email logged; OTP-login as a recipient parent → `/parent/announcements` shows it unread → open
  → marked read → author's sent list shows the read count increment.

## Dependencies
- `SmsService` (core/auth) + `EMAIL_SERVICE`/`EmailService` (core/email) + guardian fan-out pattern;
  `Parent`/`Guardian`/`Student`/`Enrollment`/`Class`/`ClassLevel`/`Term.isCurrent`; tenant middleware +
  RLS; parent portal/shell + role-aware nav (4b); seeded `announcements.create`/`announcements.view`. Two
  new models + 2 migrations (models + RLS). `AnnouncementsModule` imports `[AuthModule, EmailModule]` and
  is registered in `app.module.ts`. No new npm deps.

## Out-of-scope future
- Slice 2 receipts breakdown + staff/student audiences; slice 3 direct messaging; scheduled/queued send;
  WhatsApp; attachments/rich media; translation; edit/delete; per-parent channel preferences.
