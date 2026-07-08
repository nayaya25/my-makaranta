# Engagement EN-2 — WhatsApp Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WhatsApp as a delivery channel across announcements, fee reminders, and results-ready alerts, via a mock/Meta provider adapter that mirrors `SmsService`.

**Architecture:** A global `WhatsAppService` (`WHATSAPP_PROVIDER=mock|meta`) with the same `send(phone, message)` shape as `SmsService`, so the existing announcement loop + notification `deliver()` treat WhatsApp as one more channel. `"WHATSAPP"` is added to channel validators/branches; `AnnouncementRecipient` gains `whatsappSent`.

**Tech Stack:** NestJS 11, Prisma (PostgreSQL), global `fetch` (no new deps), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- **No new npm deps** — the Meta adapter uses the global `fetch` (as `SmsService`/Termii does). Multi-tenant: WhatsApp rides the existing per-recipient/per-school `deliver()` + announcement paths (already tenant/cross-tenant safe from EN-1); this task adds no new query scoping concerns.
- **Build invariant:** NO `apps/api/src/` import from top-level `apps/api/prisma/`; prod build emits `dist/main.js` (`npx tsc -p tsconfig.build.json && find dist -name main.js`).
- Provider default `mock` (logs, no network) so everything is testable now; the `meta` adapter is exercised only via a stubbed `fetch`. Per-recipient send failures stay non-fatal (existing try/catch pattern).
- Channel literal set becomes `"SMS" | "EMAIL" | "WHATSAPP"` everywhere it appears. `NotificationSettings.channels` default stays `["SMS","EMAIL"]` (WhatsApp opt-in).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'` (this overrides `.env`; never use the Neon URL; never edit `.env`). `prisma migrate dev` needs a TTY — hand-write SQL + `migrate deploy` + `generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + `pnpm --filter @mymakaranta/web lint`. API jest `--runInBand`; reset DB before full runs. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `AnnouncementRecipient.whatsappSent`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`AnnouncementRecipient` + `whatsappSent Boolean @default(false)`)
- Create: `apps/api/prisma/migrations/20260707120000_whatsapp_channel/migration.sql`
- Test: `apps/api/src/modules/announcements/whatsapp-recipient-model.spec.ts`

**Interfaces:** Produces `AnnouncementRecipient.whatsappSent`.

- [ ] **Step 1:** add `whatsappSent Boolean @default(false)` to `AnnouncementRecipient` in `schema.prisma`.
- [ ] **Step 2:** write migration `.../20260707120000_whatsapp_channel/migration.sql`:

```sql
ALTER TABLE "AnnouncementRecipient" ADD COLUMN "whatsappSent" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Failing test** `whatsapp-recipient-model.spec.ts`: create School + Announcement + AnnouncementRecipient; assert `whatsappSent` defaults `false` and can be set `true`.
- [ ] **Step 4:** `migrate deploy` + `generate`. **Step 5:** run — PASS. **Step 6:** build → `dist/main.js`. **Step 7: Commit** (`feat(announcements): whatsappSent delivery-tracking column`).

---

### Task 2: `WhatsAppService` + global module

**Files:**
- Create: `apps/api/src/core/whatsapp/whatsapp.service.ts`, `apps/api/src/core/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `WhatsAppModule`)
- Test: `apps/api/src/core/whatsapp/whatsapp.service.spec.ts`

**Interfaces:** Produces `WhatsAppService.send(phone: string, message: string): Promise<void>`; global `WhatsAppModule` exporting it.

- [ ] **Step 1: Failing test** `whatsapp.service.spec.ts`:
  - default provider (`WHATSAPP_PROVIDER` unset) → `send("2348012345678","hi")` resolves, does NOT call `fetch` (spy `global.fetch`).
  - with `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID=PNID`, `WHATSAPP_ACCESS_TOKEN=Tok`, `WHATSAPP_TEMPLATE_NAME=fees`, `WHATSAPP_TEMPLATE_LANG=en`: stub `global.fetch` → resolve `{ok:true}`; `send("+2348012345678","Hello")` calls `fetch` once with URL `https://graph.facebook.com/v21.0/PNID/messages`, header `Authorization: Bearer Tok`, and a JSON body `{messaging_product:"whatsapp", to:"2348012345678", type:"template", template:{name:"fees", language:{code:"en"}, components:[{type:"body", parameters:[{type:"text", text:"Hello"}]}]}}` (assert parsed body deep-equals). `fetch` resolving `{ok:false,status:400,text:async()=>"bad"}` → `send` throws. (Restore env + fetch in afterEach.)

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `whatsapp.service.ts` (mirror `sms.service.ts`):

```ts
import { Injectable, Logger } from "@nestjs/common";

/** WhatsApp sender. Provider chosen by WHATSAPP_PROVIDER: "mock" (dev/test) or "meta" (Cloud API).
 *  Meta requires a pre-approved template; the composed message is passed as the single body param. */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private get provider() { return process.env.WHATSAPP_PROVIDER ?? "mock"; }

  async send(phone: string, message: string): Promise<void> {
    if (this.provider === "meta") { await this.sendViaMeta(phone, message); return; }
    this.logger.log(`[MOCK WHATSAPP] to ${phone}: ${message}`);
  }

  private async sendViaMeta(phone: string, message: string): Promise<void> {
    const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: message }] }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }
}
```
Read `provider` via a getter (not a constructor field) so per-test `process.env` changes take effect. `whatsapp.module.ts`: `@Global() @Module({ providers:[WhatsAppService], exports:[WhatsAppService] })`. Register `WhatsAppModule` in `app.module.ts` imports.

- [ ] **Step 4: Run — PASS.** **Step 5:** build → `dist/main.js`. **Step 6: Commit** (`feat(whatsapp): WhatsAppService (mock + Meta Cloud API) + global module`).

---

### Task 3: Wire WhatsApp into announcements

**Files:**
- Modify: `apps/api/src/modules/announcements/dto.ts` (channel enum), `announcements.service.ts` (deliver loop + create filter + getRecipients aggregate), `announcements.module.ts` (inject `WhatsAppService` — global, so just add to constructor)
- Test: `apps/api/src/modules/announcements/announcements-whatsapp.spec.ts`

**Interfaces:** Consumes `WhatsAppService`. Produces: announcements deliver on `WHATSAPP`; `getRecipients` returns `whatsappCount`.

- [ ] **Step 1: Failing test** `announcements-whatsapp.spec.ts` (use a spy on `WhatsAppService.send`; seed school + parent recipient):
  - `create` with `channels:["WHATSAPP"]` (or `["SMS","WHATSAPP"]`) → `whatsapp.send(phone, text)` invoked per contact, and `AnnouncementRecipient.whatsappSent=true`.
  - `create` with `channels:["EMAIL"]` → `whatsapp.send` NOT called (regression).
  - `getRecipients(id)` returns `whatsappCount` matching the number with `whatsappSent`.

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `dto.ts`: `@IsIn(["SMS","EMAIL","WHATSAPP"], {each:true})` on `channels`. `announcements.service.ts`: inject `private whatsapp: WhatsAppService`; in `deliverAnnouncement`, widen `selected = ann.channels.filter((c) => c === "SMS" || c === "EMAIL" || c === "WHATSAPP")`, add `const wantWhatsapp = selected.includes("WHATSAPP")`, extend the guard to `!(wantSms||wantEmail||wantWhatsapp)`, and per contact add `let whatsappSent = false; if (wantWhatsapp) { try { await this.whatsapp.send(c.phone, text); whatsappSent = true; } catch {} }`, include `whatsappSent` in the `updateMany` data and the `if (smsSent||emailSent||whatsappSent)` guard. In `create`, widen the `selected` filter identically so `channels` persists `WHATSAPP`. In `getRecipients`, add `whatsappCount: rows.filter((r) => r.whatsappSent).length` and `whatsappSent: r.whatsappSent` on each row.

- [ ] **Step 4: Run — PASS** (+ existing announcements/scheduled-announcements specs green). **Step 5: Commit** (`feat(announcements): WhatsApp delivery channel + whatsapp count`).

---

### Task 4: Wire WhatsApp into notifications (reminders + results-ready) + settings

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (`deliver()` + inject `WhatsAppService`), `apps/api/src/modules/notifications/dto/notifications.dto.ts` (settings channel enum)
- Test: `apps/api/src/modules/notifications/notifications-whatsapp.spec.ts`

**Interfaces:** Consumes `WhatsAppService`. Produces: `deliver()` sends on `WHATSAPP`; settings accept `WHATSAPP`.

- [ ] **Step 1: Failing test** `notifications-whatsapp.spec.ts` (spy `WhatsAppService.send`):
  - a school whose `NotificationSettings.channels` includes `WHATSAPP` → `runFeeReminders(now)` for a due installment invokes `whatsapp.send` and the `NotificationLog.channels` contains `WHATSAPP`.
  - a school without `WHATSAPP` → `whatsapp.send` not called (regression).
  - `NotificationSettingsService.update` accepts `channels:["SMS","WHATSAPP"]`; rejects `["SMS","FOO"]`.

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** `notifications.dto.ts`: widen `@IsIn(["SMS","EMAIL","WHATSAPP"], {each:true})` on `channels`; widen the service-level channel validation in `NotificationSettingsService.update` to allow `WHATSAPP`. `notifications.service.ts`: inject `private whatsapp: WhatsAppService`; in `deliver()`, after the EMAIL branch add `if (channels.includes("WHATSAPP")) { try { await this.whatsapp.send(r.phone, message); channelsUsed.add("WHATSAPP"); } catch {} }`. (Module: `WhatsAppModule` is global, so just add the constructor param.)

- [ ] **Step 4: Run — PASS** (+ existing notifications specs green). **Step 5: Commit** (`feat(notifications): WhatsApp channel for reminders + results-ready + settings`).

---

### Task 5: Web — WhatsApp channel pickers

**Files:**
- Modify: the announcement composer (channel checkboxes) + `apps/web/src/app/(app)/settings/notifications/page.tsx` (channel checkboxes) + `apps/web/src/lib/api.ts` if the channel type union is declared there.

**Interfaces:** Consumes existing announcement-create + notification-settings methods (channels arrays already pass through).

- [ ] **Step 1:** Add a **WhatsApp** checkbox to the announcement composer's channel selector and to the notification-settings channel selector; include `"WHATSAPP"` in any web-side channel type union. Add a small hint: "Requires WhatsApp provider setup + approved template." The announcement list/detail delivery view shows the WhatsApp count if it renders SMS/email counts.
- [ ] **Step 2: tsc + lint** (0 / no new errors). **Step 3: Commit** (`feat(web): WhatsApp channel option in announcements + notification settings`).

---

### Task 6: Regression gate

- [ ] **Step 1: Reset DB + full API suite** (`... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand`; known unrelated `migrate-identity` pollution only in a non-reset full run, passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`.** **Step 3: Web gate** (`tsc --noEmit` 0 + lint no new errors). **Step 4: Commit** empty gate marker: `test: EN-2 WhatsApp regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** WhatsAppService mock+Meta template adapter (T2) ✓; single configurable template via env (T2 payload) ✓; whatsappSent column (T1) ✓; channel wiring in announcements + whatsappSent + count (T3) ✓; notification deliver() + settings validation (T4) ✓; web channel pickers (T5) ✓; tests incl. meta payload via fetch-spy + regressions + gate (each task + T6) ✓; no new deps ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full `WhatsAppService` code incl. the exact Meta payload; precise edits to `deliverAnnouncement`/`create`/`getRecipients`/`deliver()`/DTOs described against the current code shapes; web task points at the concrete composer + settings screens.

**Type consistency:** `send(phone, message): Promise<void>` matches `SmsService` so `deliver()`/announcement loop are uniform. Channel union `"SMS"|"EMAIL"|"WHATSAPP"` applied identically in both DTOs + both branch sites. `whatsappSent` used consistently across schema (T1), deliver loop + aggregate (T3). Meta env var names (`WHATSAPP_PROVIDER/PHONE_NUMBER_ID/ACCESS_TOKEN/TEMPLATE_NAME/TEMPLATE_LANG/GRAPH_VERSION`) match the spec.
