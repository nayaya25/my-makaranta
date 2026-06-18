# Sprint 6 · Slice 3 — Direct Messaging (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 6 (Communication), slice 3 — the final Communication slice. PRD parent story #4 ("message my child's form teacher directly — not via personal WhatsApp — so the conversation is on record and within school boundaries") + the §4.8 "calm single-thread inbox" design moment.
- **Builds on:** staff login (slice 2.5 — STAFF identity), `Guardian` (parent↔student), `Class.formTeacherId` (student↔form teacher), `Enrollment` (current-term class), identity-gated `/v1/me/*` pattern, tenant middleware + RLS, the parent + staff web shells.

## Goal

A parent messages their child's form teacher (and the teacher replies) in an on-record, in-app thread bounded
to the form-teacher relationship — ending the personal-WhatsApp workaround. Symmetric: the form teacher sees
and replies to threads from parents of their class's students.

## Scope (locked decisions, slice 3)
1. **Form-teacher-only, bidirectional** — a parent may only converse with the form teacher(s) of their
   children's current-term classes; a staff member only with parents of students in their form class(es).
2. **In-app only** — no SMS/email per-message notify this slice (a privacy-safe "you have a new message" SMS
   is a clean follow-up). Threads + unread badges live in-app.
3. **One thread per (parent, staff) pair**; unified identity-based `/v1/me/conversations` endpoints serve both
   PARENT and STAFF; one shared web `/messages` page.

### Non-goals
- SMS/email message notifications (follow-up); attachments / rich media; group/broadcast threads (that's
  announcements); teacher↔HOD or staff↔staff DM; student messaging (no student login); message edit/delete;
  typing/online indicators; search; messaging staff other than a child's form teacher.

## Architecture

New `apps/api/src/modules/messaging/` (`MessagingModule`, `MessagingController`, `MessagingService`). Two
tenant-scoped models + a models migration + an RLS migration (mirrors prior slices). All endpoints are
identity-based under `/v1/me/...` (the caller is PARENT or STAFF, resolved from the JWT). One shared web
`/messages` page + nav entries. No SMS/email, no new npm deps.

### Models (TENANT_MODELS + RLS FORCE)
```prisma
model Conversation {
  id            String    @id @default(cuid())
  schoolId      String
  school        School    @relation(fields: [schoolId], references: [id])
  parentId      String
  staffId       String
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())
  messages      Message[]

  @@unique([schoolId, parentId, staffId])
  @@index([schoolId, parentId])
  @@index([schoolId, staffId])
}

model Message {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderType     String       // "PARENT" | "STAFF"
  senderId       String
  body           String
  readAt         DateTime?
  sentAt         DateTime     @default(now())

  @@index([schoolId, conversationId, sentAt])
}
```
(Add back-relations `conversations Conversation[]` + `messages Message[]` to `School`. `parentId`/`staffId`/
`senderId` are plain ids — no FK, polymorphic-ish — resolved/validated through the tenant-scoped models.)

### Authorization gate — `canConverse(parentId, staffId, schoolId): boolean`
Returns true iff `staffId` is the `formTeacherId` of a **current-term** class in which a `parentId`'s student
(via `Guardian`) is enrolled:
```
exists Class c where c.schoolId = schoolId AND c.formTeacherId = staffId
  AND exists Enrollment e where e.classId = c.id AND e.termId = <current term>
    AND exists Guardian g where g.studentId = e.studentId AND g.parentId = parentId
      (and the student is in this school)
```
Implementation: resolve the school's current term; `class.findMany({ schoolId, formTeacherId: staffId,
enrollments: { some: { termId, student: { guardians: { some: { parentId } } } } } })` → non-empty. (No current
term → false.) Used to gate conversation creation, bidirectionally (the caller supplies the counterpart id;
the (parent, staff) pair is validated regardless of who initiates).

### Endpoints (all `JwtAuthGuard`; `me` = the caller's PARENT|STAFF identity)
- **`GET /v1/me/messageable`** → who the caller may start a thread with:
  - PARENT (`identityId` = parentId) → their children's form teachers:
    `[{ staffId, staffName, childName, className }]` (resolve children → current-term class → formTeacher).
  - STAFF (`identityId` = staffId) → parents of their form-class students:
    `[{ parentId, parentName, studentName }]` (resolve form classes → enrolled students → guardians → parents).
  - Other identity → `[]`.
- **`POST /v1/me/conversations`** `{ counterpartId }` → resolve `(parentId, staffId)` from the caller's
  identity + counterpart (PARENT: staffId=counterpart; STAFF: parentId=counterpart); `canConverse` → else
  **403**; `upsert` by `@@unique([schoolId, parentId, staffId])` → `{ conversationId }`.
- **`GET /v1/me/conversations`** → the caller's threads (`parentId`=identityId if PARENT, else `staffId`=
  identityId), each `{ id, counterpartName, lastMessageAt, unreadCount }` (unread = messages from the OTHER
  `senderType` with `readAt = null`), ordered `lastMessageAt` desc.
- **`GET /v1/me/conversations/:id/messages`** → load the conversation (`findFirst { id, schoolId }` + the
  caller must be its `parentId`/`staffId` per identity → else **404**); return messages asc; **mark the other
  party's unread messages read** (`updateMany { conversationId, senderType != caller, readAt: null } → readAt`).
- **`POST /v1/me/conversations/:id/messages`** `{ body }` (non-empty) → participant-gated (as above) → create
  `Message { senderType=identityType, senderId=identityId, body }` + set `conversation.lastMessageAt`.

### Web — shared `/messages`
- `apps/web/src/app/(app)/messages/page.tsx` (`"use client"`): a two-pane (desktop) / list→thread (mobile)
  view. Left: `getConversations()` list (counterpart name, last-message time, unread dot) + a **New message**
  button → a picker from `getMessageable()`. Right: the selected thread — `getMessages(id)` (auto-marks read)
  rendered as bubbles (mine vs theirs by `senderType` vs my identity), a composer → `postMessage(id, body)` →
  optimistic append + refetch. Calm, single-column-friendly.
- Nav: a **Messages** entry in BOTH the staff `NAV_ITEMS` and the parent `PARENT_NAV` → `/messages`.
- api client: `getMessageable`, `createConversation(counterpartId)`, `getConversations`, `getMessages(id)`,
  `postMessage(id, body)` (+ types). The web reads the caller's identity (`session.user().identityType`/
  `identityId`) to label bubbles.

## Validation & errors
- `canConverse` false → **403** (parent messaging a non-form-teacher, or staff a non-class parent).
- Reading/posting a conversation the caller isn't a participant of, or a foreign/cross-tenant id → **404**.
- Empty `body` → **400**.
- A parent with no children / a class with no `formTeacherId` → empty `messageable` (no crash).
- A non-PARENT/STAFF identity (PROPRIETOR/PENDING) → `messageable`/`conversations` `[]`; cannot create/post
  (no valid (parent,staff) pairing) → 403/404.

## Testing
- **API e2e** (`messaging.e2e-spec.ts`, service-level, two-school A/B): seed in A a parent P (child in class C
  with form teacher S), an unrelated staff U (not C's form teacher), and a second parent Q (child not in C).
  Assert: `canConverse(P,S)` true, `canConverse(P,U)` false, `canConverse(Q,S)` false. `messageable` for P
  returns S (with child/class), for S returns P (with student). P starts a thread with S → posts a message →
  S's `getConversations` shows it with `unreadCount 1` → S's `getMessages` returns it + marks read (P's
  `getConversations` unread now 0 from S's read) → S replies → P sees the reply, `unreadCount 1`. **P starting
  a thread with U → rejected (403)**; **Q reading P↔S's conversation → 404**; **empty body → 400**;
  **cross-tenant** (school B caller on A's conversation) → 404. Idempotent conversation create (same pair →
  same id).
- **Unit:** none required (logic is query-shaped); add if a pure helper is extracted.
- **Web:** light.
- **Browser/HTTP QA:** seed a parent + their child's form teacher (both loginable). Parent OTP-login →
  `/messages` → New message → the form teacher → send → staff OTP-login → `/messages` → sees the thread unread
  → opens (marks read) → replies → parent sees the reply. A parent cannot start a thread with a non-form-teacher
  (picker only lists form teachers; direct API call → 403).

## Dependencies
- Staff login / STAFF identity (slice 2.5); `Guardian`/`Class.formTeacherId`/`Enrollment`/`Term.isCurrent`/
  `Staff`/`Parent`; identity-gated `/v1/me/*` pattern; tenant middleware + RLS; parent + staff web shells +
  role-aware nav. Two new models + 2 migrations (models + RLS). `MessagingModule` imports `AuthModule`; in
  `app.module.ts`. No new npm deps, no SMS/email.

## Out-of-scope future
- SMS/email new-message notify; attachments/rich media; staff↔staff / teacher↔HOD DM; student messaging;
  message edit/delete; search; typing/presence; messaging non-form-teacher staff.
