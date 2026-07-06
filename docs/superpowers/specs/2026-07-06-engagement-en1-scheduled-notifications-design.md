# Engagement EN-1 — Scheduled & Automated Notifications — Design Spec

> **Status:** Approved (2026-07-06) · **Workstream 2 (Engagement), sub-project 1** (Scheduled notifications → WhatsApp → Preferences/templates).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Automatically notify parents at the right time — fee reminders around each installment's due date, "results are ready" when a class's results are released, and announcements authored now but sent later — over the school's existing SMS/email channels, configurable per school, with no duplicate sends.

## Context (existing code this builds on)

- `SmsService.send(phone, message)` (Termii) and `EmailService.send({to, subject, html, text})` (Mailgun; log-adapter in tests) already exist and are used by announcements + `collections.sendReminder`.
- `collections.sendReminder(invoiceId, actor)` builds a guardian list (`Guardian → parent.phone/email`), sends SMS+email per guardian (per-recipient failures non-fatal), and logs a `FeeReminder`. Its guardian-loop + message delivery is the reusable core.
- `Invoice {totalKobo(NET), paidKobo, dueDate}` + MF-2 `Installment {invoiceId, order, amountKobo, dueDate}` (materialized per invoice); `allocatePayments` derives per-installment paid/status.
- `ReleaseService.release(classId, termId, releasedBy)` creates `Release` rows (EY + numeric paths) — the hook point for results-ready.
- `Announcement {schoolId, authorId, title, body, audienceType, audienceIds, channels}` sends immediately today (IN_APP + SMS + EMAIL) with `AnnouncementRecipient` per-recipient tracking.
- `@nestjs/schedule` is **not installed** (add `@nestjs/schedule@^6`, compatible with NestJS 11; run `pnpm audit` per the dependency policy). No cron/scheduling exists.
- Amounts integer **kobo**. New tenant tables follow the assessment precedent (middleware + explicit scoping, no per-table RLS). Build invariant: no `apps/api/src` import from top-level `prisma/`; prod build emits `dist/main.js`.

## Decisions (locked)

1. **Triggers (v1):** (a) automated **fee reminders**, (b) **results-ready** alert on release, (c) **scheduled announcements** (send-later).
2. **Reminder timing:** relative to each unpaid **installment's** due date (MF-2) with configurable signed day-offsets; invoices with no schedule fall back to `invoice.dueDate`.
3. **Config:** per-school **`NotificationSettings`** (per-trigger toggles, `reminderOffsetDays`, channels), seeded with defaults.
4. **Mechanism (baked):** in-process `@nestjs/schedule` cron wrappers that call **time-injected** service methods; `NotificationLog` unique dedupe key makes re-runs and multi-instance firing safe; the jobs are the one cross-tenant path and scope every query by the school being processed. Dates compared date-only in **Africa/Lagos**.

## Data model (additive)

```prisma
model NotificationSettings {
  id                  String   @id @default(cuid())
  schoolId            String   @unique
  school              School   @relation(fields: [schoolId], references: [id])
  feeRemindersEnabled Boolean  @default(true)
  reminderOffsetDays  Int[]    @default([-3, 0, 3])   // signed days: negative = before, positive = after the due date
  resultsReadyEnabled Boolean  @default(true)
  channels            String[] @default(["SMS", "EMAIL"])
  updatedAt           DateTime @updatedAt
}

model NotificationLog {
  id             String   @id @default(cuid())
  schoolId       String
  school         School   @relation(fields: [schoolId], references: [id])
  kind           String                                   // FEE_REMINDER | RESULTS_READY | SCHEDULED_ANNOUNCEMENT
  dedupeKey      String
  recipientCount Int      @default(0)
  channels       String   @default("")
  createdAt      DateTime @default(now())

  @@unique([schoolId, dedupeKey])
  @@index([schoolId, kind, createdAt])
}

model Announcement {   // + two fields; existing sends set status=SENT, scheduledFor=null
  scheduledFor DateTime?
  status       String   @default("SENT")   // SCHEDULED | SENT
}
```

- `NotificationSettings` + `NotificationLog` added to `TENANT_MODELS`. Back-relations on `School`. Migration name: `scheduled_notifications`. Existing announcements read as `status="SENT"` (default) — unaffected.
- **Dedupe keys:** fee reminder `FEE_REMINDER:<installmentId|invoiceId>:<offset>:<yyyy-mm-dd>`; results-ready `RESULTS_READY:<releaseId>:<studentId>`; scheduled announcement `SCHEDULED_ANNOUNCEMENT:<announcementId>`. A duplicate insert (P2002 on `@@unique([schoolId, dedupeKey])`) means "already sent" → skip.

## Services

`NotificationsService` (new `notifications` module) — all methods take `now: Date`, iterate schools explicitly, scope by `schoolId`:

- **`runFeeReminders(now)`** — for each school with `feeRemindersEnabled`, load `NotificationSettings`. Let `today = dateOnly(now, Africa/Lagos)`. **Match rule:** an installment fires for a configured `offset` iff `dateOnly(installment.dueDate, Lagos) === today − offset`. (So `offset = −3` → matches installments whose due date is `today + 3`, i.e. "3 days before due"; `offset = 0` → due today; `offset = +3` → due date was `today − 3`, i.e. "3 days after due".) Consider only unpaid targets: `invoice.balanceKobo > 0` and the installment not fully covered by `allocatePayments`; for invoices without installments, apply the same match rule to `invoice.dueDate`. For each match: build the dedupeKey, attempt to claim it (`notificationLog.create` in a try/catch on P2002 → skip if it already exists), then deliver to the student's guardians on the configured channels and update the log's `recipientCount`/`channels`.
- **`notifyResultsReady(schoolId, release, classId, termId)`** — called from `ReleaseService.release` after the Release row exists; if `resultsReadyEnabled`, for each enrolled student's guardians send "results are ready", deduped per `(releaseId, studentId)`.
- **`dispatchScheduledAnnouncements(now)`** — find `Announcement` with `status="SCHEDULED"` and `scheduledFor <= now`; for each, run the existing announcement delivery, set `status="SENT"`, dedupe per announcement id.
- **`deliver(schoolId, recipients, message, subject, channels)`** — shared helper (extracted from `collections.sendReminder`): per-recipient SMS/email on the selected channels, per-recipient failures non-fatal, returns `recipientCount` + channels actually used. Reused by all three triggers and (optionally) `collections.sendReminder`.

**Cron wrappers** (`NotificationsCron`, thin): `@Cron` daily 07:00 → `runFeeReminders(new Date())`; `@Cron` every 15 min → `dispatchScheduledAnnouncements(new Date())`. Registered via `ScheduleModule.forRoot()`. Cron does no logic itself (keeps everything unit-testable via the injected `now`).

## API & Web

- **`GET /v1/notifications/settings`** + **`PUT /v1/notifications/settings`** (`school.manage`) — per-school settings; GET upserts defaults on first read; PUT validates `reminderOffsetDays` are integers in a sane range (e.g. −30..30) and `channels ⊆ {SMS, EMAIL}`.
- **Announcement create** extended: optional `scheduledFor` (future ISO datetime) → stored `status="SCHEDULED"`, not sent now; omitted → current immediate behavior (`status="SENT"`). Listing shows scheduled vs sent.
- **`ReleaseService.release`** calls `notifyResultsReady` after committing (non-fatal — a notification failure must never break a release).
- **Web:** Settings → **Notifications** (toggle fee reminders + results-ready, edit offset days, pick channels); announcement composer gains a **"Send later"** datetime; the announcements list distinguishes Scheduled from Sent. `@mymakaranta/ui`, teal/lime.

## Testing

- **`runFeeReminders(fixedNow)`:** an unpaid installment due at each configured offset → guardians notified (log-adapter SMS/email) + a `NotificationLog` row; a **second run the same day → no duplicate** (dedupe); zero-balance invoice skipped; `feeRemindersEnabled=false` → nothing; channel subset honored (e.g. SMS-only school sends no email); a no-schedule invoice reminds off `invoice.dueDate`.
- **`notifyResultsReady`:** after a release, each enrolled student's guardians notified once; a re-call → no duplicate; `resultsReadyEnabled=false` → nothing; a release-path failure in notify does not roll back the release.
- **`dispatchScheduledAnnouncements`:** `SCHEDULED` with `scheduledFor <= now` sent + flipped to `SENT`; future `scheduledFor` untouched; immediate announcements (null) unaffected.
- **Settings:** GET seeds defaults; PUT validation (bad offset / bad channel rejected); tenant-scoped.
- **Cross-tenant:** a school's reminder/results job targets only its own students/guardians; a second school's data is never contacted.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- WhatsApp channel (EN-2); per-recipient opt-out / preferences / reusable templates (EN-3).
- Retry/backoff queue + delivery-status webhooks.
- Attendance / low-balance / birthday alerts.
- Per-school timezone (v1 fixed **Africa/Lagos**); per-parent quiet hours.
- SMS cost budgeting / rate caps; digest batching.
- Sub-daily reminder precision (reminders evaluated once daily).
