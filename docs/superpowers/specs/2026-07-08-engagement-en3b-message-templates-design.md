# Engagement EN-3b — Message Templates — Design Spec

> **Status:** Approved (2026-07-08) · **Workstream 2 (Engagement), EN-3 sub-project 2 of 3** (Preferences ✓ → Templates → delivery-log/retry).
> Terminal next step: `superpowers:writing-plans`.

## Goal

Let schools customize the wording of the auto-generated notification messages (fee installment reminders, fee balance reminders, results-ready) via editable, variable-based templates — with the current wording as built-in defaults, so nothing changes until a school opts to edit.

## Context (existing code this builds on)

Three hardcoded system-message strings today:
- `notifications.service.ts:195` (automated fee reminder): `Dear Parent, ${studentName}'s ${what} of ${naira(amountKobo)} is due ${dueDateStr}. Kindly settle it. Thank you.` — the automated job's per-installment **and** no-schedule-invoice reminders (both have amount + due date).
- `notifications.service.ts:252` (results-ready): `Dear Parent, ${studentName}'s results are now ready. Please log in to view the report card.`
- `collections.service.ts:83` (manual "Remind" reminder): `Dear Parent, ${studentName}'s ${termLabel} fees balance is ${naira(balance)}. Kindly settle it. Thank you.`

Announcements are staff-authored free text (title/body) — **not** templated. All three sites now render via the EN-3a unified path (`NotificationDispatchService.sendToRecipient`), so they build a `message` string then dispatch. The `notification-dispatch` core module (`apps/api/src/core/notification-dispatch/`) is `@Global`, imported by `notifications` + `fees` — the natural home for template rendering (no new cross-module wiring, no cycle). `naira(kobo)` formats money; amounts are integer kobo. New tenant tables: no per-table RLS. Build invariant: no `apps/api/src`→`prisma/` import; prod build emits `dist/main.js`.

## Decisions (locked)

1. **Template set:** three keys, one per existing system message — `FEE_INSTALLMENT_REMINDER`, `FEE_BALANCE_REMINDER`, `RESULTS_READY`.
2. **Variables:** `{{var}}` mustache syntax; each key has a fixed allowed-variable set; **saving a template that references an unknown variable is rejected** (`BadRequestException`). Render is plain substitution (all known vars always supplied; a missing var renders empty).
3. **Defaults/override:** built-in default body per key lives in code; a `MessageTemplate` row exists for a school **only when customized**; render uses override-or-default; reset = delete the row.
4. **One body per key** across SMS/email/WhatsApp (matches today).

## Template registry (code)

In `notification-dispatch` (e.g. `message-template.registry.ts`):
```ts
export const MESSAGE_TEMPLATES = {
  FEE_INSTALLMENT_REMINDER: {
    variables: ["studentName", "amount", "dueDate"],
    default: "Dear Parent, {{studentName}}'s fees installment of {{amount}} is due {{dueDate}}. Kindly settle it. Thank you.",
  },
  FEE_BALANCE_REMINDER: {
    variables: ["studentName", "termLabel", "balance"],
    default: "Dear Parent, {{studentName}}'s {{termLabel}} fees balance is {{balance}}. Kindly settle it. Thank you.",
  },
  RESULTS_READY: {
    variables: ["studentName"],
    default: "Dear Parent, {{studentName}}'s results are now ready. Please log in to view the report card.",
  },
} as const;
export type MessageTemplateKey = keyof typeof MESSAGE_TEMPLATES;
```

## Data model

```prisma
model MessageTemplate {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id])
  key       String
  body      String
  updatedAt DateTime @updatedAt
  @@unique([schoolId, key])
}
```
Added to `TENANT_MODELS`; `School` back-relation. Migration `message_templates`.

## Rendering & service

- `renderTemplate(body: string, vars: Record<string,string>): string` — replaces every `{{name}}` with `vars[name] ?? ""` (pure).
- `validateTemplate(key: MessageTemplateKey, body: string): void` — extracts `{{...}}` names from `body`; if any ∉ `MESSAGE_TEMPLATES[key].variables` → `BadRequestException` listing the offending names. (Unknown key → `BadRequestException`.)
- `MessageTemplateService` (in `notification-dispatch`, exported):
  - `render(schoolId, key, vars): Promise<string>` — `body = (override row for (schoolId,key))?.body ?? MESSAGE_TEMPLATES[key].default`; return `renderTemplate(body, vars)`.
  - `list(schoolId): Promise<{key, body, isCustomized, allowedVariables, defaultBody}[]>` — all keys, override-or-default.
  - `set(schoolId, key, body)` — `validateTemplate` then upsert `@@unique([schoolId,key])`.
  - `reset(schoolId, key)` — `deleteMany({schoolId, key})`.

## Wiring the three send sites

- **`notifications.service`** automated fee reminder → `message = await templates.render(schoolId, "FEE_INSTALLMENT_REMINDER", { studentName, amount: naira(amountKobo), dueDate: dueDateStr })` (replaces the inline string for both installment + no-schedule cases; the old `isInstallment`/`what` wording distinction collapses into the template). Results-ready → `render(schoolId, "RESULTS_READY", { studentName })`.
- **`collections.service`** manual reminder → `render(schoolId, "FEE_BALANCE_REMINDER", { studentName, termLabel, balance: naira(balance) })`.
- These services already inject the `notification-dispatch` providers (EN-3a); add `MessageTemplateService`. `email` subject lines stay as-is (not templated in v1).

## API & Web (`@RequirePermissions("school.manage")`, tenant-scoped)

- `GET /v1/notifications/templates` → `[{key, body, isCustomized, allowedVariables, defaultBody}]` for all registry keys.
- `PUT /v1/notifications/templates/:key` `{body}` → validate + upsert (`key` must be a registry key).
- `DELETE /v1/notifications/templates/:key` → reset (delete the override row).
- **Web:** a **Message templates** settings screen — per key: label, editable textarea (pre-filled with current body), the key's `{{variables}}` shown as insert chips, a live sample preview (substituting placeholder sample values), Save, and **Reset to default** (shown only when `isCustomized`). `@mymakaranta/ui`, teal/lime.

## Testing

- **`renderTemplate`:** substitutes single + repeated `{{var}}`; a var absent from `vars` → empty; text without placeholders unchanged.
- **`validateTemplate`:** a body using only allowed vars passes; an unknown `{{foo}}` → `BadRequestException`; unknown key → `BadRequestException`.
- **`MessageTemplateService`:** no override → renders the code default; after `set`, `render` uses the custom body; `reset` reverts to default; `list` reports `isCustomized` correctly; all scoped by `schoolId`.
- **API:** get returns all 3 keys with defaults + allowed vars; put validates + persists; delete resets; `school.manage` enforced; tenant-scoped (a school can't read/set another's).
- **Wiring:** a customized `FEE_INSTALLMENT_REMINDER` changes the message the automated reminder actually sends (assert via the dispatch/log-adapter); results-ready + collections likewise. **Regression:** with no overrides, the rendered text equals the current hardcoded strings for the installment reminder, results-ready, and collections balance reminder (assert exact strings). **One intended wording change:** the automated *no-schedule-invoice* reminder previously said "fees balance" (via the `isInstallment=false` branch); it now renders `FEE_INSTALLMENT_REMINDER` ("fees installment … is due"). This collapses the `isInstallment`/`what` branch — assert the new rendered string explicitly rather than the old one.
- Windows gate: `tsc --noEmit` + jest `--runInBand` + web `tsc`/`lint`; build emits `dist/main.js`.

## Out of scope (fast-follows)

- Per-channel template variants (shorter SMS vs richer email/WhatsApp).
- Per-language templates (using `Parent.preferredLang`).
- Templating staff-authored announcements (they are already free text).
- Rich/HTML email templates + WYSIWYG editor.
- Template versioning/history/audit of edits.
- Templating the email **subject** lines (v1 templates the body only).
