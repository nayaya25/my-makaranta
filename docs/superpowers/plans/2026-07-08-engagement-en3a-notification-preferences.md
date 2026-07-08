# Engagement EN-3a — Notification Preferences + Unified Delivery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-parent channel/category opt-outs, enforced by routing every outbound message (announcements, reminders, results-ready, manual collections reminders) through one preference-aware delivery path.

**Architecture:** A standalone `notification-dispatch` core module (`PreferenceService` + `NotificationDispatchService`) that imports neither `announcements` nor `notifications` (no DI cycle); all three send paths import it. A `NotificationPreference` row per parent (`mutedChannels`, `mutedCategories`). Parent + staff APIs to read/set prefs.

**Tech Stack:** NestJS 11, Prisma (PostgreSQL), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate request-supplied ids (parentId) against the school before use. Parent self-serve routes resolve the parent from the caller's identity (`identityType==="PARENT"` → `identityId` is the `Parent.id`); a parent may only read/set their own prefs. (Memories: tenant-idor-rule.)
- Preferences apply to **PARENT** recipients only; STAFF are never filtered. Empty `mutedChannels`/`mutedCategories` = receive everything.
- Categories: `"FEE_REMINDER" | "RESULTS_READY" | "ANNOUNCEMENT"`. Channels: `"SMS" | "EMAIL" | "WHATSAPP"`.
- **The `notification-dispatch` module must not import `announcements` or `notifications`** (they import it) — avoids the existing cycle (`notifications`→`announcements` via the cron).
- **Build invariant:** no `apps/api/src`→top-level `prisma/` import; prod build emits `dist/main.js`.
- Non-fatal delivery: per-recipient send failures swallowed (existing pattern).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'` (overrides `.env`; never use Neon; never edit `.env`). `prisma migrate dev` needs a TTY — hand-write SQL + `migrate deploy` + `generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + lint. API jest `--runInBand`; reset DB before full runs. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Execution note:** Tasks 3/4/5 each modify a different service but all commit to this branch — run them **serially** (not parallel subagents) to avoid a git-index race (see the parallel-commit lesson).

---

### Task 1: Schema — `NotificationPreference`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model + `School`/`Parent` back-relations)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (`TENANT_MODELS` += `"NotificationPreference"`)
- Create: `apps/api/prisma/migrations/20260708120000_notification_preferences/migration.sql`
- Test: `apps/api/src/core/notification-dispatch/notification-preference-model.spec.ts`

- [ ] **Step 1:** add to `schema.prisma`:
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
add back-relations `School { notificationPreferences NotificationPreference[] }`, `Parent { notificationPreference NotificationPreference? }`.
- [ ] **Step 2:** `TENANT_MODELS` += `"NotificationPreference"`.
- [ ] **Step 3:** migration `.../20260708120000_notification_preferences/migration.sql`:
```sql
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "parentId" TEXT NOT NULL,
  "mutedChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mutedCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_parentId_key" ON "NotificationPreference"("parentId");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
- [ ] **Step 4: Failing test**: create School+Parent+NotificationPreference; defaults are empty arrays; `@@unique(parentId)` rejects a second row; deleting the parent cascades the pref.
- [ ] **Step 5:** `migrate deploy` + `generate`. **Step 6:** run — PASS. **Step 7:** build → `dist/main.js`. **Step 8: Commit** (`feat(notifications): NotificationPreference model`).

---

### Task 2: `notification-dispatch` core module (`PreferenceService` + `NotificationDispatchService`)

**Files:**
- Create: `apps/api/src/core/notification-dispatch/notification-category.ts`, `preference.service.ts`, `notification-dispatch.service.ts`, `dto/preference.dto.ts`, `notification-dispatch.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `NotificationDispatchModule`)
- Test: `preference.service.spec.ts`, `notification-dispatch.service.spec.ts`

**Interfaces:**
- `notification-category.ts`: `export const NOTIFICATION_CATEGORIES = ["FEE_REMINDER","RESULTS_READY","ANNOUNCEMENT"] as const; export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number]; export const NOTIFICATION_CHANNELS = ["SMS","EMAIL","WHATSAPP"] as const;`
- `PreferenceService`:
  - `loadPreferences(schoolId, parentIds: string[]): Promise<Map<string,{mutedChannels:string[];mutedCategories:string[]}>>`
  - `effectiveChannels(pref: {mutedChannels:string[];mutedCategories:string[]} | undefined, category: string, requested: string[]): string[]`
  - `getForParent(schoolId, parentId): Promise<{mutedChannels:string[];mutedCategories:string[]}>` (defaults if no row)
  - `setForParent(schoolId, parentId, dto: SetPreferenceDto): Promise<...>` (validate + upsert; parent must belong to school)
- `NotificationDispatchService.sendToRecipient(r: {parentId?:string|null; phone:string; email:string|null}, subject:string, message:string, channels:string[]): Promise<{smsSent:boolean;emailSent:boolean;whatsappSent:boolean}>`
- `SetPreferenceDto {mutedChannels?:string[]; mutedCategories?:string[]}`.

- [ ] **Step 1: Failing tests.**
  - `effectiveChannels`: `(undefined, "ANNOUNCEMENT", ["SMS","EMAIL"])` → `["SMS","EMAIL"]`; `({mutedChannels:["SMS"],mutedCategories:[]}, "FEE_REMINDER", ["SMS","EMAIL","WHATSAPP"])` → `["EMAIL","WHATSAPP"]`; `({mutedChannels:[],mutedCategories:["ANNOUNCEMENT"]}, "ANNOUNCEMENT", ["SMS"])` → `[]`.
  - `setForParent` validation: a channel not in NOTIFICATION_CHANNELS or category not in NOTIFICATION_CATEGORIES → `BadRequestException`; foreign parent (other school) → `NotFoundException`; valid upsert persists + `getForParent` returns it; `loadPreferences` batch returns a map keyed by parentId.
  - `sendToRecipient`: given `channels:["EMAIL","WHATSAPP"]` + a recipient with email → calls email + whatsapp (spies), returns `{emailSent:true, whatsappSent:true, smsSent:false}`; EMAIL requested but `email:null` → `emailSent:false`; a throwing channel → that flag false, others unaffected.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `effectiveChannels`: `if (pref?.mutedCategories.includes(category)) return []; return requested.filter((c) => !(pref?.mutedChannels ?? []).includes(c));`. `loadPreferences`: `findMany({where:{schoolId, parentId:{in:parentIds}}})` → Map. `getForParent`: `findFirst({where:{schoolId, parentId}})` ?? `{mutedChannels:[],mutedCategories:[]}`. `setForParent`: validate arrays ⊆ the const sets; assert `parent.findFirst({id:parentId, schoolId})`; `upsert({where:{parentId}, create:{schoolId, parentId, ...}, update:{...}})`. `sendToRecipient`: the per-channel try/catch (SMS→`sms.send(phone)`, EMAIL→`email.send` if email, WHATSAPP→`whatsapp.send(phone)`), each non-fatal, return the three booleans. `NotificationDispatchModule` `@Global()` providing + exporting both services; inject `SmsService`, `EMAIL_SERVICE`, `WhatsAppService`, `PrismaService`. Register in `app.module.ts`. (Confirm `SmsService` is importable — it's exported by `AuthModule`; if not global, provide it here or import AuthModule. Prefer importing the module that exports it.)
- [ ] **Step 4: Run — PASS.** **Step 5:** build → `dist/main.js`. **Step 6: Commit** (`feat(notifications): preference-aware dispatch core (PreferenceService + sendToRecipient)`).

---

### Task 3: Route automated notifications through prefs

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (`deliver` gains `category`; `runFeeReminders`/`notifyResultsReady` pass `parentId` + category); `notifications.module.ts` (import `NotificationDispatchModule` if not global)
- Test: `apps/api/src/modules/notifications/notifications-preferences.spec.ts`

**Interfaces:** Consumes `PreferenceService` + `NotificationDispatchService`. `deliver(schoolId, category, recipients:{parentId?:string|null;phone;email}[], subject, message, channels)`.

- [ ] **Step 1: Failing test:** a parent muting `SMS` → fee reminder delivered on `EMAIL`/`WHATSAPP` only (spies) and `NotificationLog.channels` excludes SMS; a parent muting `FEE_REMINDER` → nothing sent to them, no `NotificationLog` claim wasted (or claim then zero recipients — assert no send); results-ready respects `RESULTS_READY` mute. Seed prefs directly via prisma.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `deliver`: add `category` param; collect `parentId`s from recipients; `const prefs = await this.preferences.loadPreferences(schoolId, parentIds)`; per recipient `const eff = this.preferences.effectiveChannels(recipient.parentId ? prefs.get(recipient.parentId) : undefined, category, channels)`; if `eff.length` → `const res = await this.dispatch.sendToRecipient(recipient, subject, message, eff)` and fold `res` into `channelsUsed`/`recipientCount`. Update `runFeeReminders` (the guardian recipient build) + `notifyResultsReady` to include `parentId` on each recipient and pass the category (`FEE_REMINDER`/`RESULTS_READY`). Remove the old inline SMS/email/whatsapp branches from `deliver` (now via `sendToRecipient`).
- [ ] **Step 4: Run — PASS** (+ existing notifications specs green — update any `deliver(...)` call sites for the new `category` arg). **Step 5: Commit** (`feat(notifications): fee reminders + results-ready respect parent preferences`).

---

### Task 4: Route announcements through prefs

**Files:**
- Modify: `apps/api/src/modules/announcements/announcements.service.ts` (`deliverAnnouncement`), `announcements.module.ts` (import dispatch module if not global)
- Test: `apps/api/src/modules/announcements/announcements-preferences.spec.ts`

**Interfaces:** Consumes `PreferenceService` + `NotificationDispatchService` with category `ANNOUNCEMENT`.

- [ ] **Step 1: Failing test:** an announcement to a parent who muted `ANNOUNCEMENT` → not delivered to them (no `smsSent/emailSent/whatsappSent` on their `AnnouncementRecipient`), but delivered to another parent + to STAFF (staff never filtered); a parent muting `WHATSAPP` still gets SMS/email; `getRecipients` counts reflect actual sends.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** In `deliverAnnouncement`, batch-load prefs for the PARENT contacts (`parentId = recipientId` for PARENT). Per contact: if PARENT, `eff = effectiveChannels(prefs.get(id), "ANNOUNCEMENT", requestedChannels)`; if STAFF, `eff = requestedChannels`. If `eff.length`, `const res = await this.dispatch.sendToRecipient({parentId: type==="PARENT"?id:null, phone, email}, ann.title, text, eff)`; set `AnnouncementRecipient.{smsSent,emailSent,whatsappSent}` from `res`. Drop the inline per-channel sends (now via `sendToRecipient`); keep the `updateMany` recording.
- [ ] **Step 4: Run — PASS** (+ existing announcements/scheduled/whatsapp specs green). **Step 5: Commit** (`feat(announcements): respect parent notification preferences`).

---

### Task 5: Route collections reminders through prefs + settings (bug fix)

**Files:**
- Modify: `apps/api/src/modules/fees/collections.service.ts` (`sendReminder`, `sendBulkReminders`), `fees.module.ts` (import dispatch module + `NotificationSettingsService`'s module if needed)
- Test: `apps/api/src/modules/fees/collections-preferences.spec.ts`

**Interfaces:** Consumes `PreferenceService`, `NotificationDispatchService`, `NotificationSettingsService.get(schoolId)` (for the base channel set). Category `FEE_REMINDER`.

- [ ] **Step 1: Failing test:** with a school whose `NotificationSettings.channels = ["SMS","EMAIL","WHATSAPP"]`, `sendReminder(invoiceId)` sends on all three (previously SMS+email only) — assert WhatsApp spy called; a guardian-parent who muted `SMS` gets email/WhatsApp only; a parent who muted `FEE_REMINDER` is skipped; `FeeReminder.recipientCount` counts only delivered. (Seed prefs + settings via prisma.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** In `sendReminder`/`sendBulkReminders`: `const base = (await this.settings.get(schoolId)).channels` as the requested channels (replacing the hardcoded SMS+email); build guardian recipients with `parentId`; `loadPreferences`; per parent `eff = effectiveChannels(pref, "FEE_REMINDER", base)`; if `eff.length` `sendToRecipient(...)`; count delivered; write `FeeReminder` with the channels actually used. Inject `PreferenceService`, `NotificationDispatchService`, `NotificationSettingsService` (ensure their modules are imported/global).
- [ ] **Step 4: Run — PASS** (+ existing fees/collections specs green — this is the intended behavior change, update those assertions if they asserted the old hardcoded SMS+email). **Step 5: Commit** (`fix(fees): collections reminders honor settings channels + WhatsApp + parent preferences`).

---

### Task 6: Preferences API — parent self-serve + staff

**Files:**
- Modify: `apps/api/src/modules/parent/parent.controller.ts` + `parent.service.ts` (parent get/set own prefs)
- Modify: `apps/api/src/modules/sis/parents.controller.ts` + `parents.service.ts` (staff get/set a parent's prefs) — or wherever `v1/parents` lives
- Test: `apps/api/src/modules/parent/parent-preferences.spec.ts`

**Interfaces:** Consumes `PreferenceService.getForParent`/`setForParent`.

- [ ] **Step 1: Failing test:** parent `getNotificationPreferences()`/`setNotificationPreferences(dto)` operate on the caller's own `parentId` (from identity); a non-parent user → guarded/empty. Staff `GET/PUT /v1/parents/:parentId/notification-preferences` scoped to school (foreign parent → NotFound), `school.manage` required; validation rejects a bad channel/category.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Parent controller: `@Get("notification-preferences")` + `@Put("notification-preferences")` (`@RequirePermissions("fees.pay.own")` — the existing parent-scoped perm, or the parent guard used by other `v1/parent` routes; resolve `parentId` from `user.identityId` when `identityType==="PARENT"`, else `ForbiddenException`) → `PreferenceService.getForParent/setForParent(schoolId, parentId, dto)`. Staff controller (`v1/parents`): `@Get(":parentId/notification-preferences")` + `@Put(":parentId/notification-preferences")` (`@RequirePermissions("school.manage")`) → same service (validates parent∈school). DTO `SetPreferenceDto` (from Task 2) with class-validator.
- [ ] **Step 4: Run — PASS.** **Step 5: Commit** (`feat(notifications): parent + staff notification-preference APIs`).

---

### Task 7: Web — preference screens + API client

**Files:**
- Modify: `apps/web/src/lib/api.ts` (types + methods: `getMyNotificationPreferences`, `setMyNotificationPreferences`, `getParentNotificationPreferences(parentId)`, `setParentNotificationPreferences(parentId, dto)`)
- Create: `apps/web/src/app/(app)/parent/preferences/page.tsx` (parent self-serve)
- Modify: staff parent/guardian detail (add a preferences panel) — find under `apps/web/src/app/(app)/` (students/[id] guardians, or a parents screen)

**Interfaces:** `interface NotificationPreference {mutedChannels:string[]; mutedCategories:string[]}`.

- [ ] **Step 1:** API client types + 4 methods. Parent portal **Notification preferences** page: for each channel (SMS/Email/WhatsApp) and each category (Fee reminders/Results ready/Announcements) a toggle where "on" = receive (i.e. NOT in the muted list); save maps toggles → `mutedChannels`/`mutedCategories`. Staff panel: same control on a parent's detail. Loading/empty/saved states. `@mymakaranta/ui`, teal/lime.
- [ ] **Step 2: tsc + lint** (0 / no new errors). **Step 3: Commit** (`feat(web): notification preference screens (parent + staff)`).

---

### Task 8: Regression gate

- [ ] **Step 1: Reset DB + full API suite** (`... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand`; known unrelated `migrate-identity` pollution only in a non-reset full run, passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`.** **Step 3: Web gate** (`tsc --noEmit` 0 + lint no new errors). **Step 4: Commit** empty gate marker: `test: EN-3a notification preferences regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** NotificationPreference channel+category opt-out (T1) ✓; shared no-cycle dispatch module w/ effectiveChannels + sendToRecipient + preference get/set/validate (T2) ✓; automated notifications wired (T3) ✓; announcements wired, staff unfiltered (T4) ✓; collections reworked to settings.channels + WhatsApp + prefs — the tracked fix (T5) ✓; parent + staff APIs (T6) ✓; web parent + staff screens (T7) ✓; parents-only, tenant/ownership, regressions, gate (each task + T8) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code/SQL for schema, migration, `effectiveChannels`; precise wiring diffs against the current `deliver`/`deliverAnnouncement`/`sendReminder` shapes; web task gives exact types/methods + the toggle→muted-list mapping.

**Type consistency:** `effectiveChannels(pref|undefined, category, requested)` + `sendToRecipient({parentId?,phone,email}, subject, message, channels)` signatures identical across T2 (defined) and T3/T4/T5 (consumed). `NotificationCategory`/channel const sets shared from `notification-category.ts`. `SetPreferenceDto {mutedChannels?, mutedCategories?}` consistent T2↔T6↔T7. `recipients` carry `parentId` in every path so preferences resolve.
