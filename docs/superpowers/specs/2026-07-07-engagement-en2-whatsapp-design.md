# Engagement EN-2 — WhatsApp Channel — Design Spec

> **Status:** Approved (2026-07-07) · **Workstream 2 (Engagement), sub-project 2** (Scheduled ✓ → WhatsApp → Preferences/templates).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Add WhatsApp as a first-class delivery channel alongside SMS and email — usable by announcements, fee reminders, and results-ready alerts — via a provider-adapter that mocks in dev/test and talks to the Meta Cloud API in production, so it is fully buildable and testable now and goes live when credentials + an approved template are supplied.

## Context (existing code this builds on)

- `SmsService` (`apps/api/src/core/auth/sms.service.ts`): `send(phone: string, message: string): Promise<void>`; provider chosen by `SMS_PROVIDER` (`mock` logs / `termii` HTTP). WhatsApp mirrors this exactly.
- `EmailService` (`EMAIL_SERVICE` token; `send({to, subject, html, text})`); log-adapter in tests.
- Channels are string literals `"SMS" | "EMAIL"`, validated with `@IsIn(["SMS","EMAIL"], {each:true})` in `announcements/dto.ts` + `notifications/dto/notifications.dto.ts`, and branched in `announcements.service` (`wantSms`/`wantEmail` → send → set `AnnouncementRecipient.smsSent`/`emailSent`) and `notifications.service.deliver()` (`channels.includes("SMS"|"EMAIL")` → send; accumulates `channelsUsed`, stored in `NotificationLog.channels`).
- `AnnouncementRecipient` tracks `smsSent`/`emailSent` booleans. `NotificationSettings.channels String[]` (default `["SMS","EMAIL"]`) gates reminders/results-ready channels.
- Parents/staff carry a `phone` (used by SMS). New tenant tables follow the assessment precedent (no per-table RLS). Build invariant: no `apps/api/src` import from top-level `prisma/`; prod build emits `dist/main.js`. Dependency policy: prefer no new deps — the Meta adapter uses the global `fetch` (as `SmsService`/Termii already does).

## Decisions (locked)

1. **Provider depth:** a full channel via `WhatsAppService` with `WHATSAPP_PROVIDER=mock|meta` (default `mock`), mirroring `SmsService`; a **Meta Cloud API** real adapter behind env creds.
2. **Templates:** a **single configurable approved template** (`WHATSAPP_TEMPLATE_NAME` + `WHATSAPP_TEMPLATE_LANG`) whose one body parameter receives the composed message text; the `meta` adapter fills it, `mock` ignores it.
3. **Wiring:** `"WHATSAPP"` added everywhere `"SMS"/"EMAIL"` appear — DTO validators, announcement send loop (+`AnnouncementRecipient.whatsappSent`), notification `deliver()`, settings channels/validation, and web channel pickers.
4. **No new models** beyond the `whatsappSent` column.

## Data model

```prisma
model AnnouncementRecipient {   // + one field
  whatsappSent Boolean @default(false)
}
```
Migration name: `whatsapp_channel`. Existing rows default `whatsappSent=false`.

## WhatsAppService (`apps/api/src/core/whatsapp/`)

New global module mirroring the email module's shape, or a plain `@Injectable()` like `SmsService` (follow the `SmsService` pattern — simplest):

```ts
@Injectable()
export class WhatsAppService {
  private readonly provider = process.env.WHATSAPP_PROVIDER ?? "mock";  // mock | meta
  async send(phone: string, message: string): Promise<void> {
    if (this.provider === "meta") return this.sendViaMeta(phone, message);
    // mock: log only (dev/test)
  }
  private async sendViaMeta(phone: string, message: string): Promise<void> {
    // POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
    // headers: Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
    // body: { messaging_product:"whatsapp", to: <phone digits, no +>,
    //         type:"template",
    //         template:{ name: WHATSAPP_TEMPLATE_NAME, language:{ code: WHATSAPP_TEMPLATE_LANG },
    //                    components:[{ type:"body", parameters:[{ type:"text", text: message }] }] } }
    // throw on !res.ok (per-recipient callers already swallow)
  }
}
```
Env: `WHATSAPP_PROVIDER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` (default e.g. `en`), optional `WHATSAPP_GRAPH_VERSION` (default `v21.0`). Phone normalized to international digits (strip leading `+`), like Termii.

## Channel wiring

- **DTOs:** `announcements/dto.ts` + `notifications/dto/notifications.dto.ts` → `@IsIn(["SMS","EMAIL","WHATSAPP"], {each:true})`.
- **`announcements.service`:** inject `WhatsAppService`; `wantWhatsapp = selected.includes("WHATSAPP")`; per contact, if `wantWhatsapp` `await this.whatsapp.send(phone, text)` (try/catch, non-fatal) and set `whatsappSent=true` via the same `updateMany` that sets `smsSent`/`emailSent`; the recipients/aggregates (`getRecipients`) include `whatsappCount`. `selected` filter widened to include `"WHATSAPP"`.
- **`notifications.service.deliver()`:** inject `WhatsAppService`; `if (channels.includes("WHATSAPP")) { try { await this.whatsapp.send(r.phone, message); channelsUsed.add("WHATSAPP"); } catch {} }`. So fee reminders + results-ready deliver on WhatsApp when the school's settings include it.
- **`NotificationSettings`:** validation allows `WHATSAPP`; default stays `["SMS","EMAIL"]` (WhatsApp is opt-in per school). No schema change (channels is already `String[]`).
- **Module wiring:** expose `WhatsAppService` so both `announcements` and `notifications` modules can inject it (a global `WhatsAppModule`, mirroring how SMS/email are provided).

## Web

- Announcement composer: add a **WhatsApp** channel checkbox (alongside SMS/Email).
- Notification settings: add **WhatsApp** to the channel checkboxes.
- A small inline hint on both: "WhatsApp requires provider setup (Meta) + an approved template." The announcements delivery view shows WhatsApp sent-count.
- `@mymakaranta/ui`, teal/lime.

## Testing

- **`WhatsAppService` (mock):** `send` resolves without throwing and does not hit the network when `WHATSAPP_PROVIDER` unset/`mock`.
- **Meta adapter payload:** with `WHATSAPP_PROVIDER=meta` + env creds set, `send` calls `fetch` (spy) with the Graph URL + Bearer auth + the exact template payload (name/lang, `to` digits without `+`, body parameter = message); `!res.ok` → throws. (No live network — `fetch` is stubbed.)
- **Announcement wiring:** an announcement with `channels` including `WHATSAPP` invokes `whatsapp.send` per contact and sets `whatsappSent=true`; `getRecipients` reports a WhatsApp count; SMS/EMAIL-only announcements never call `whatsapp.send` (regression).
- **Notification wiring:** a fee reminder / results-ready for a school whose settings channels include `WHATSAPP` invokes `whatsapp.send` and records `WHATSAPP` in `NotificationLog.channels`; a school without it does not.
- **Settings:** `PUT` accepts `channels:["SMS","WHATSAPP"]`; rejects an unknown channel.
- **Migration:** `whatsappSent` defaults false; existing announcement flows unaffected.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Per-notification-kind template registry (v1 = one configurable template).
- Per-parent WhatsApp opt-in/opt-out + consent tracking (→ EN-3 preferences).
- Inbound WhatsApp / two-way replies; delivery-status webhooks (read/delivered receipts).
- Termii (or other BSP) WhatsApp adapter — Meta only in v1.
- Media/attachment (image/PDF) WhatsApp messages (e.g. sending the statement/receipt as a document).
- Per-school template/creds stored in DB (v1 uses process-level env; multi-tenant WhatsApp sender identity is a later concern).
