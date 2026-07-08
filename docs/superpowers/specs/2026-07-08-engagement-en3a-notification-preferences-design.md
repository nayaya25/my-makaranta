# Engagement EN-3a — Notification Preferences + Unified Delivery — Design Spec

> **Status:** Approved (2026-07-08) · **Workstream 2 (Engagement), EN-3 sub-project 1 of 3** (Preferences+unified delivery → templates → delivery-log/retry).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Give parents per-recipient control over what reaches them (mute channels and/or categories) and route every outbound message through one preference-aware delivery path — so announcements, fee reminders, results-ready, and the manual collections reminders all respect the school's channel settings **and** each parent's opt-outs. This also fixes the tracked gap where `collections` reminders bypass settings/WhatsApp.

## Context (existing code this builds on)

- Three separate send paths today: `NotificationsService.deliver(schoolId, recipients:{phone,email}[], subject, message, channels)` (automated reminders + results-ready), `AnnouncementsService.deliverAnnouncement(ann, recipients)` (per-recipient SMS/email/WhatsApp with `AnnouncementRecipient.smsSent/emailSent/whatsappSent`), and `CollectionsService.sendReminder`/`sendBulkReminders` (hardcoded SMS+email, ignores `NotificationSettings.channels` + WhatsApp).
- Channels are string literals `"SMS" | "EMAIL" | "WHATSAPP"`; `SmsService.send(phone,msg)`, `EmailService.send({to,subject,html,text})`, `WhatsAppService.send(phone,msg)` all exist (mock adapters in dev/test).
- `NotificationSettings {schoolId @unique, channels String[] (default ["SMS","EMAIL"]), feeRemindersEnabled, reminderOffsetDays, resultsReadyEnabled}` gates the automated jobs' channels. `NotificationLog` = batch dedupe/audit.
- `Parent {id, schoolId, phone, email?}`; `Guardian` links student↔parent. Announcement `Recipient {recipientType:"PARENT"|"STAFF", recipientId}` — for PARENT, `recipientId` is the `Parent.id`.
- The `notifications` module already imports `AnnouncementsModule` (for the scheduled-announcement cron), so making announcements import back into `notifications` would create a cycle — the shared logic must live in a module that depends on neither.
- New tenant tables follow the assessment precedent (no per-table RLS). Build invariant: no `apps/api/src`→`prisma/` import; prod build emits `dist/main.js`.

## Decisions (locked)

1. **Opt-out dimensions:** per parent, two lists — `mutedChannels` (⊆ SMS/EMAIL/WHATSAPP) and `mutedCategories` (⊆ FEE_REMINDER/RESULTS_READY/ANNOUNCEMENT). A send is suppressed for a recipient if its **category is muted** (skip entirely) or its **channel is muted** (drop that channel).
2. **Managed by:** both the parent (self-serve in the portal) and staff (`school.manage`, on the parent's behalf).
3. **Consolidation:** all send paths (automated notifications, results-ready, announcements, manual collections reminders) route through one preference-aware dispatch.
4. **Applies to:** PARENT recipients only; STAFF always receive (no filtering).

## Architecture — shared dispatch module (no DI cycle)

New module `apps/api/src/core/notification-dispatch/` (depends only on `SmsService`, `EmailService` (`EMAIL_SERVICE`), `WhatsAppService`, `PrismaService` — imports neither `announcements` nor `notifications`, so all three can import it):

- `PreferenceService`
  - `loadPreferences(schoolId: string, parentIds: string[]): Promise<Map<string, { mutedChannels: string[]; mutedCategories: string[] }>>` — one `findMany`, no N+1.
  - `effectiveChannels(pref: {mutedChannels; mutedCategories} | undefined, category: string, requested: string[]): string[]` — returns `[]` if `pref?.mutedCategories.includes(category)`, else `requested.filter(c => !pref?.mutedChannels.includes(c))`. `undefined` pref (incl. all STAFF) → `requested` unchanged.
  - `getForParent(schoolId, parentId)` / `setForParent(schoolId, parentId, {mutedChannels?, mutedCategories?})` — upsert; validates each entry ⊆ the allowed channel/category sets.
- `NotificationDispatchService`
  - `sendToRecipient(r: {parentId?: string | null; phone: string; email: string | null}, subject: string, message: string, channels: string[]): Promise<{smsSent: boolean; emailSent: boolean; whatsappSent: boolean}>` — the per-channel try/catch primitive (SMS→phone, EMAIL→email if present, WHATSAPP→phone), non-fatal, returning which succeeded.

`NotificationCategory = "FEE_REMINDER" | "RESULTS_READY" | "ANNOUNCEMENT"` exported as a shared constant. This module is `@Global` (like email/whatsapp) or explicitly imported by the three consuming modules.

## Data model (additive)

```prisma
model NotificationPreference {
  id              String   @id @default(cuid())
  schoolId        String
  school          School   @relation(fields: [schoolId], references: [id])
  parentId        String   @unique
  parent          Parent   @relation(fields: [parentId], references: [id], onDelete: Cascade)
  mutedChannels   String[] @default([])
  mutedCategories String[] @default([])
  updatedAt       DateTime @updatedAt
}
```
Added to `TENANT_MODELS`; `School`/`Parent` back-relations. Migration `notification_preferences`.

## Wiring the send paths

For each path: collect the PARENT recipients' `parentId`s → `loadPreferences` once → per recipient compute `effectiveChannels(pref, category, baseChannels)` → if non-empty, `sendToRecipient(...)` and record the result in that path's own bookkeeping.

- **`NotificationsService.deliver`** gains a `category` arg; recipients gain `parentId`. `runFeeReminders` passes `FEE_REMINDER`; `notifyResultsReady` passes `RESULTS_READY`. `channelsUsed`/`NotificationLog.channels` reflect only channels actually sent (post-preference).
- **`AnnouncementsService.deliverAnnouncement`** (category `ANNOUNCEMENT`): PARENT recipients (`recipientId` = parentId) are preference-filtered; STAFF pass through; `AnnouncementRecipient.{smsSent,emailSent,whatsappSent}` set from the primitive's return. A parent who muted `ANNOUNCEMENT` gets no rows marked sent.
- **`CollectionsService.sendReminder`/`sendBulkReminders`** (category `FEE_REMINDER`): base channels = the school's `NotificationSettings.channels` (via `NotificationSettingsService.get`), then per-parent prefs; send via the primitive. **Fixes the tracked gap** (now honors settings + WhatsApp + prefs). `FeeReminder` log still written with the channels actually used.

## API & Web

- **Parent self-serve:** `GET /v1/parent/notification-preferences` + `PUT /v1/parent/notification-preferences {mutedChannels?, mutedCategories?}` (parent's own identity via `childStudentIds`-style parent resolution; a parent can only read/set their own).
- **Staff:** `GET /v1/parents/:parentId/notification-preferences` + `PUT …` (`@RequirePermissions("school.manage")`, tenant-scoped; validate the parent belongs to the school).
- Validation: `mutedChannels ⊆ {SMS,EMAIL,WHATSAPP}`, `mutedCategories ⊆ {FEE_REMINDER,RESULTS_READY,ANNOUNCEMENT}` (else `BadRequestException`).
- **Web:** parent portal **Notification preferences** screen (per-channel + per-category toggles, "muted" = opted out); a preferences panel on the staff-side parent/guardian detail. `@mymakaranta/ui`, teal/lime.

## Testing

- **`effectiveChannels`:** category muted → `[]`; a muted channel dropped from `requested`; both empty/undefined → `requested` unchanged; STAFF (no pref) unaffected.
- **`deliver` (notifications):** a parent muting `SMS` gets a fee reminder on email/WhatsApp only; a parent muting `FEE_REMINDER` gets nothing; `NotificationLog.channels` reflects post-preference channels; results-ready respects `RESULTS_READY` mute.
- **Announcements:** a parent muting `ANNOUNCEMENT` → not sent to them (no `*Sent` flags), others + all staff still delivered; a parent muting `WHATSAPP` still gets SMS/email.
- **Collections:** `sendReminder` now uses the school's `NotificationSettings.channels` (incl. WhatsApp) and applies parent prefs; a parent muting `FEE_REMINDER` is skipped; `FeeReminder.recipientCount` counts only delivered.
- **Preferences API:** parent get/set only their own (foreign parent → forbidden/NotFound); staff get/set scoped to school; validation rejects bad channel/category.
- **Regression:** with no `NotificationPreference` rows, announcements/notifications behavior is unchanged; collections change (honoring settings channels) is the only intended behavior shift — assert it explicitly.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Per-staff preferences (parents-only in v1).
- Quiet-hours / time-of-day windows; per-child (vs per-parent) preferences.
- Unsubscribe links / STOP-keyword handling in outbound messages.
- EN-3b message templates; EN-3c per-recipient delivery log + retry.
- OTP/auth messages (remain outside this pipeline).
