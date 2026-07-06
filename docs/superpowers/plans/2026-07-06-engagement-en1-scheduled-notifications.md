# Engagement EN-1 — Scheduled & Automated Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate parent notifications — installment-aware fee reminders, results-ready on release, and send-later announcements — over existing SMS/email, per-school configurable, with dedupe.

**Architecture:** A `notifications` module with a `NotificationsService` whose logic methods take `now: Date` (so cron is a thin, untested wrapper and the logic is unit-tested with a fixed clock). A per-school `NotificationSettings` + a `NotificationLog` (unique dedupe key). The jobs are the one cross-tenant path — they iterate schools and scope every query by `schoolId`. Delivery reuses `SmsService`/`EmailService` via a shared `deliver()`.

**Tech Stack:** NestJS 11 + `@nestjs/schedule@^6`, Prisma (PostgreSQL), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: normal request paths scope by `schoolId` via `TenantContext`; **the scheduled jobs run with NO TenantContext** — they must iterate schools and pass `schoolId` explicitly into every query (never rely on `$use`). (Memories: tenant-idor-rule, prisma-tenant-scope-explicitly.)
- **Build invariant:** NO file under `apps/api/src/` imports from top-level `apps/api/prisma/`. Prod build must emit `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Notification failures are **non-fatal**: a delivery or notify error must never break the triggering action (release, invoice, announcement) — wrap in try/catch, per-recipient failures already swallowed by the existing pattern.
- Dedupe: `NotificationLog @@unique([schoolId, dedupeKey])`; claim-before-send (create → on P2002 skip) so re-runs and multiple instances never double-send.
- Dates compared **date-only in Africa/Lagos** (UTC+1, no DST). Amounts integer **kobo**.
- New dep `@nestjs/schedule@^6` (NestJS 11 compatible) — run `pnpm audit` after adding (dependency policy). New tenant tables: NO per-table RLS (assessment precedent).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never edit `.env`. `prisma migrate dev` needs a TTY — hand-write SQL + `prisma migrate deploy` + `prisma generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`; reset DB before full runs. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — settings + log + announcement scheduling

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`NotificationSettings`, `NotificationLog`, `Announcement.scheduledFor`/`status` + `School` back-relations)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (`TENANT_MODELS` += `"NotificationSettings"`, `"NotificationLog"`)
- Create: `apps/api/prisma/migrations/20260706130000_scheduled_notifications/migration.sql`
- Test: `apps/api/src/modules/notifications/notification-model.spec.ts`

**Interfaces:** Produces `prisma.notificationSettings`, `prisma.notificationLog`; `Announcement.scheduledFor`/`status`.

- [ ] **Step 1: Add models to `schema.prisma`** exactly as in the spec's Data model section; add `scheduledFor DateTime?` + `status String @default("SENT")` to `Announcement`; `School` back-relations `notificationSettings NotificationSettings?  notificationLogs NotificationLog[]`.
- [ ] **Step 2: Add both new models to `TENANT_MODELS`.**
- [ ] **Step 3: Write the migration** `.../20260706130000_scheduled_notifications/migration.sql`:

```sql
CREATE TABLE "NotificationSettings" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "feeRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "reminderOffsetDays" INTEGER[] NOT NULL DEFAULT ARRAY[-3, 0, 3],
  "resultsReadyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY['SMS','EMAIL'],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationSettings_schoolId_key" ON "NotificationSettings"("schoolId");

CREATE TABLE "NotificationLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "channels" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationLog_schoolId_dedupeKey_key" ON "NotificationLog"("schoolId","dedupeKey");
CREATE INDEX "NotificationLog_schoolId_kind_createdAt_idx" ON "NotificationLog"("schoolId","kind","createdAt");

ALTER TABLE "Announcement" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SENT';

ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Failing test** `notification-model.spec.ts`: create School + `NotificationSettings` (defaults present: `reminderOffsetDays=[-3,0,3]`, `channels=["SMS","EMAIL"]`); `@@unique([schoolId])` rejects a second settings row; `NotificationLog` `@@unique([schoolId, dedupeKey])` rejects a duplicate dedupeKey (P2002); an existing `Announcement` reads `status="SENT"`.
- [ ] **Step 5: `migrate deploy` + `generate`.** **Step 6: run — PASS.** **Step 7: build → `dist/main.js`.** **Step 8: Commit** (`feat(notifications): settings + log models + announcement scheduling fields`).

---

### Task 2: Date util + `NotificationSettingsService`

**Files:**
- Create: `apps/api/src/modules/notifications/notify-date.util.ts`
- Create: `apps/api/src/modules/notifications/dto/notifications.dto.ts`
- Create: `apps/api/src/modules/notifications/notification-settings.service.ts`
- Test: `apps/api/src/modules/notifications/notify-date.util.spec.ts`, `notification-settings.service.spec.ts`

**Interfaces:**
- Produces:
  - `lagosDateStr(d: Date): string` → `YYYY-MM-DD` in Africa/Lagos (UTC+1); `shiftDateStr(yyyyMmDd: string, days: number): string`; `sameLagosDay(a: Date, b: Date): boolean`.
  - `NotificationSettingsService.get(schoolId)` (upsert defaults, returns row); `NotificationSettingsService.update(schoolId, dto: UpdateNotificationSettingsDto)`.
  - `UpdateNotificationSettingsDto { feeRemindersEnabled?, reminderOffsetDays?: number[], resultsReadyEnabled?, channels?: string[] }`.

- [ ] **Step 1: Failing tests.** util: `lagosDateStr(new Date("2026-07-06T23:30:00Z"))` → `"2026-07-07"` (UTC+1 rolls over); `shiftDateStr("2026-07-06", -3)` → `"2026-07-03"`, `shiftDateStr("2026-07-06", 3)` → `"2026-07-09"`. settings: `get` on a fresh school returns defaults (and persists one row; second `get` returns the same row); `update` sets fields; `update` rejects an offset outside −30..30 and a channel not in {SMS,EMAIL} (`BadRequestException`); tenant-scoped by the passed `schoolId`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `notify-date.util.ts`:

```ts
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST
export function lagosDateStr(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}
export function shiftDateStr(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function sameLagosDay(a: Date, b: Date): boolean {
  return lagosDateStr(a) === lagosDateStr(b);
}
```
`NotificationSettingsService.get`: `prisma.notificationSettings.upsert({ where:{schoolId}, create:{schoolId}, update:{} })` (defaults from schema). `update`: validate `reminderOffsetDays` all integers in −30..30 and `channels ⊆ ["SMS","EMAIL"]` (else `BadRequestException`), then `update({ where:{schoolId}, data:{...} })` (call `get` first to ensure the row exists). DTO uses class-validator (`@IsArray`, `@IsInt({each})`, `@IsIn(["SMS","EMAIL"], {each:true})`, all `@IsOptional`).
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** (`feat(notifications): Lagos date util + per-school settings service`).

---

### Task 3: `deliver` helper + `runFeeReminders`

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Test: `apps/api/src/modules/notifications/fee-reminders.spec.ts`

**Interfaces:**
- Consumes: `SmsService.send`, `EmailService.send` (inject like `collections.service.ts`), `NotificationSettingsService`, `allocatePayments` (`../fees/installment.util`), the date util. Produces:
  - `deliver(schoolId, recipients: {phone: string; email: string | null}[], subject: string, message: string, channels: string[]): Promise<{recipientCount: number; channelsUsed: string[]}>`.
  - `runFeeReminders(now: Date): Promise<void>`.

- [ ] **Step 1: Failing test** `fee-reminders.spec.ts` (use the email **log adapter** + a stub/spy SMS; seed school + `NotificationSettings` defaults, class level, term, invoice for a student with a MF-2 schedule + guardians):
  - An installment due `today+3` (Lagos), balance > 0 → `runFeeReminders(now)` sends to guardians (assert SMS/email invoked) and writes a `NotificationLog` (`kind=FEE_REMINDER`, dedupeKey contains the installmentId + offset + date).
  - **Second `runFeeReminders(now)` same day → no new send / no new log** (dedupe).
  - Zero-balance invoice → skipped; `feeRemindersEnabled=false` → nothing; `channels=["SMS"]` → no email sent.
  - An invoice with NO installments but `dueDate == today` → reminded off the invoice dueDate.
  - **Cross-tenant:** a second school's student due today is NOT contacted when only the first school is processed (or: both processed, each only its own).

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `runFeeReminders(now)`: `const today = lagosDateStr(now)`; for each `school` in `prisma.school.findMany({select:{id}})`: `settings = await this.settings.get(school.id)`; if `!settings.feeRemindersEnabled` continue; for each `offset` of `settings.reminderOffsetDays`: `targetDate = shiftDateStr(today, -offset)`; find candidate installments — `prisma.installment.findMany({ where:{ schoolId: school.id }, include:{ invoice:{ include:{ student:{ include:{ guardians:{ include:{ parent:true } } } } } } } })` then filter in JS to `lagosDateStr(inst.dueDate)===targetDate && inst.invoice.balance>0 && not-fully-paid` (use `allocatePayments` per invoice to know the installment's outstanding), PLUS invoices with **no** installments where `lagosDateStr(invoice.dueDate)===targetDate && balance>0`. (Query installments/invoices scoped to `school.id`.) For each target: `dedupeKey = FEE_REMINDER:<installmentId|invoiceId>:<offset>:<targetDate>`; claim via `try { await prisma.notificationLog.create({data:{schoolId:school.id, kind:"FEE_REMINDER", dedupeKey}}) } catch(P2002){ continue }`; build guardian recipients + a message (reuse the `collections` wording w/ the installment amount + due date); `const {recipientCount, channelsUsed} = await this.deliver(...)`; `await prisma.notificationLog.update({where:{schoolId_dedupeKey:{...}}, data:{recipientCount, channels: channelsUsed.join(",")}})`. `deliver` = the extracted guardian-loop (SMS if channels includes "SMS"; email if includes "EMAIL" and email present; per-recipient try/catch).
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** (`feat(notifications): deliver helper + installment-aware fee reminders (dedupe)`).

---

### Task 4: `notifyResultsReady` + release hook

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (add `notifyResultsReady`)
- Modify: `apps/api/src/modules/assessment/release.service.ts` (call it after release; inject `NotificationsService`)
- Modify: `apps/api/src/modules/assessment/*.module.ts` (import notifications so release can use it — or expose via a shared module; wire per existing DI)
- Test: `apps/api/src/modules/notifications/results-ready.spec.ts`

**Interfaces:** Produces `notifyResultsReady(schoolId: string, releaseId: string, classId: string, termId: string): Promise<void>`.

- [ ] **Step 1: Failing test:** after `notifyResultsReady`, guardians of the class's enrolled students (for the term) are notified once; a re-call → no duplicate (dedupe `RESULTS_READY:<releaseId>:<studentId>`); `resultsReadyEnabled=false` → nothing; the release itself still succeeds if notify throws (wrap the call site). Also a `release.service` test: calling `release` triggers a notification (spy) and a notify failure does not roll back the Release row.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `notifyResultsReady`: `settings = await this.settings.get(schoolId)`; if `!settings.resultsReadyEnabled` return; load enrolled students for `(classId, termId)` via `prisma.enrollment.findMany({ where:{ classId, termId, class:{ schoolId } }, include:{ student:{ include:{ guardians:{ include:{ parent:true } } } } } })`; for each student: dedupeKey `RESULTS_READY:<releaseId>:<studentId>`, claim (P2002→skip), `deliver` "results are ready" message on `settings.channels`, update log. In `release.service.ts`, after the Release row is committed (both EY + numeric paths), `try { await this.notifications.notifyResultsReady(schoolId, release.id, classId, termId); } catch { /* non-fatal */ }`. Ensure DI: add `NotificationsModule` (exports `NotificationsService`) to the assessment module's imports.
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** (`feat(notifications): results-ready alert on release (non-fatal, deduped)`).

---

### Task 5: Scheduled announcements

**Files:**
- Modify: `apps/api/src/modules/announcements/announcements.service.ts` (accept `scheduledFor`; add a `sendAnnouncement(id)` reusable path; add `dispatchScheduledAnnouncements(now)`) and `dto.ts` (+`scheduledFor?`)
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (delegate `dispatchScheduledAnnouncements(now)` OR keep it in announcements — see note) 
- Test: `apps/api/src/modules/announcements/scheduled-announcements.spec.ts`

**Interfaces:** Produces `dispatchScheduledAnnouncements(now: Date): Promise<void>`; announcement create stores `status="SCHEDULED"` + `scheduledFor` when a future `scheduledFor` is given.

- [ ] **Step 1: Failing test:** creating an announcement with a future `scheduledFor` → stored `status="SCHEDULED"`, NOT delivered now (no SMS/email); `dispatchScheduledAnnouncements(now)` with `now >= scheduledFor` delivers it (SMS/email per its channels) + flips `status="SENT"`; a still-future one is untouched; a normal create (no `scheduledFor`) delivers immediately + `status="SENT"` (regression); dispatch is idempotent (already-SENT not re-sent; dedupe `SCHEDULED_ANNOUNCEMENT:<id>` or the `status` flip guards it).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Refactor `announcements.service` so the create's delivery body becomes a private `deliverAnnouncement(ann)` reused by both immediate create and `dispatchScheduledAnnouncements`. Create: if `dto.scheduledFor` is a future date → persist the `Announcement` (+recipients) with `status="SCHEDULED"`, `scheduledFor`, and **skip** delivery; else deliver now + `status="SENT"`. `dispatchScheduledAnnouncements(now)`: `prisma.announcement.findMany({ where:{ status:"SCHEDULED", scheduledFor:{ lte: now } } })` (cross-tenant; process each by its `schoolId`), `deliverAnnouncement(ann)`, `update status="SENT"`. (Keep this method in `announcements.service`; the cron in Task 6 calls it — inject `AnnouncementsService` into the cron.)
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** (`feat(announcements): schedule send-later + dispatch due scheduled announcements`).

---

### Task 6: Module + cron wrappers + settings controller + dep

**Files:**
- Modify: `apps/api/package.json` (add `@nestjs/schedule@^6`) — run `pnpm add @nestjs/schedule@^6 --filter @mymakaranta/api` (or edit + `pnpm install`), then `pnpm audit`.
- Create: `apps/api/src/modules/notifications/notifications.cron.ts`, `notifications.controller.ts`, `notifications.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `ScheduleModule.forRoot()` + `NotificationsModule`)
- Test: `apps/api/src/modules/notifications/notifications.controller.spec.ts`

**Interfaces:** `NotificationsModule` exports `NotificationsService` + `NotificationSettingsService`; controller routes `GET/PUT /v1/notifications/settings` (`school.manage`).

- [ ] **Step 1: Add the dependency** + `pnpm install` + `pnpm audit` (note any advisories in the report).
- [ ] **Step 2: `notifications.cron.ts`** — `@Injectable()` with `constructor(private notifications, private announcements)`; `@Cron("0 7 * * *")` `nightlyFeeReminders() { return this.notifications.runFeeReminders(new Date()); }` and `@Cron(CronExpression.EVERY_15_MINUTES)` `dispatchScheduled() { return this.announcements.dispatchScheduledAnnouncements(new Date()); }`. No logic beyond calling with `new Date()`.
- [ ] **Step 3: `notifications.controller.ts`** `@Controller("v1/notifications")`: `GET settings` + `PUT settings` (`@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermissions("school.manage")`, `TenantContext.schoolIdOrThrow()` → service).
- [ ] **Step 4: `notifications.module.ts`** (providers `NotificationsService`, `NotificationSettingsService`, `NotificationsCron`; controller; imports the modules providing Sms/Email + `AnnouncementsModule` for the cron; exports the two services). In `app.module.ts` add `ScheduleModule.forRoot()` to imports + register `NotificationsModule`. Resolve the `NotificationsModule ↔ AnnouncementsModule ↔ Assessment` DI (use `forwardRef` if a cycle appears).
- [ ] **Step 5: Test** the controller delegates (settings GET/PUT). **Step 6: run `... jest notifications --runInBand`** + `tsc --noEmit` + build `→ dist/main.js`. **Step 7: Commit** (`feat(notifications): module + cron wrappers + settings API + @nestjs/schedule`).

---

### Task 7: Web — notification settings + send-later announcement

**Files:**
- Create: `apps/web/src/app/(app)/settings/notifications/page.tsx` (+ settings-index card)
- Modify: `apps/web/src/lib/api.ts` (settings get/put types + methods; extend announcement-create with `scheduledFor`)
- Modify: the announcement composer screen (add "Send later" datetime; show Scheduled vs Sent in the list)

**Interfaces:** `interface NotificationSettings {feeRemindersEnabled;reminderOffsetDays:number[];resultsReadyEnabled;channels:string[]}`; `getNotificationSettings()`, `updateNotificationSettings(dto)`.

- [ ] **Step 1: Settings page** — toggles (fee reminders, results-ready), an offset-days editor (add/remove signed integers with helper text "negative = before due, positive = after"), channel checkboxes (SMS/Email); load via `getNotificationSettings`, save via `updateNotificationSettings`; validate offsets −30..30 client-side. Settings-index card.
- [ ] **Step 2: Announcement composer** — optional "Send later" datetime → passes `scheduledFor` on create; the announcements list badges Scheduled vs Sent.
- [ ] **Step 3: tsc + lint** (0 / no new errors). **Step 4: Commit** (`feat(web): notification settings + schedule-announcement UI`).

---

### Task 8: Regression gate

- [ ] **Step 1: Reset DB + full API suite** (`... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand`; the known unrelated `migrate-identity` pollution only appears in a non-reset full run and passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`.** **Step 3: Web gate** (`tsc --noEmit` 0 + lint no new errors). **Step 4: Commit** empty gate marker: `test: EN-1 scheduled notifications regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** settings + log + announcement fields (T1) ✓; Lagos date util + settings service w/ validation (T2) ✓; fee reminders (installment-aware, offsets, dedupe, channels, cross-tenant, no-schedule fallback) (T3) ✓; results-ready on release, non-fatal + deduped (T4) ✓; scheduled announcements send-later + dispatch (T5) ✓; cron wrappers + `@nestjs/schedule` + settings API (T6) ✓; web settings + send-later (T7) ✓; tenant/cross-tenant + gate (each task + T8) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for schema, migration SQL, date util; `runFeeReminders`/`notifyResultsReady`/`dispatchScheduledAnnouncements` described with exact queries, dedupe keys, and reuse points; web tasks give exact types/methods/states.

**Type consistency:** `now: Date`-injected methods consistent T3/T4/T5↔T6 cron. `deliver(schoolId, recipients, subject, message, channels)` signature stable T3↔T4. Dedupe key formats match the spec exactly. `NotificationSettings` shape identical T2↔T7. `reminderOffsetDays: number[]` / `channels: string[]` consistent across schema, DTO, service, web. `shiftDateStr(today, -offset)` matches the spec's match rule `dueDate === today − offset`.
