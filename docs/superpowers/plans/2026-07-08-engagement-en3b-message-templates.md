# Engagement EN-3b — Message Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editable, variable-based templates (with code defaults) for the three auto-generated notification messages — fee installment reminder, fee balance reminder, results-ready.

**Architecture:** A code template registry + a `MessageTemplate` override row per (school,key) in the shared `notification-dispatch` core module; `MessageTemplateService.render/list/set/reset` + pure `renderTemplate`/`validateTemplate`. The three send sites render via the service. A `school.manage` templates API + a web editor.

**Tech Stack:** NestJS 11, Prisma (PostgreSQL), Next.js 15 + `@mymakaranta/ui`, jest (`--runInBand`), tsc/next lint.

## Global Constraints

- Multi-tenant: scope every read/write by `schoolId`; validate the `key` against the registry. (Memory: tenant-idor-rule.)
- Variables: `{{name}}` syntax; each key has a fixed allowed set; **`set` rejects a body referencing an unknown variable** (`BadRequestException`). Render substitutes known vars; a missing var → empty string.
- Defaults live in code; a `MessageTemplate` row exists only when a school customizes; render = override-or-default; reset = delete the row.
- One rendered body per key across SMS/email/WhatsApp. Email subject lines are NOT templated in v1.
- **Build invariant:** no `apps/api/src`→top-level `prisma/` import; prod build emits `dist/main.js`. Template rendering lives in the `notification-dispatch` core module (`@Global`, already imported by `notifications` + `fees` — no new cycle).
- Local test DB only: prefix API prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'` (overrides `.env`; never use Neon; never edit `.env`). `prisma migrate dev` needs a TTY — hand-write SQL + `migrate deploy` + `generate`.
- Windows: no `next build`/dev servers. Web verify: `pnpm --filter @mymakaranta/web exec tsc --noEmit` + lint. API jest `--runInBand`; reset DB before full runs. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `MessageTemplate`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model + `School` back-relation)
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (`TENANT_MODELS` += `"MessageTemplate"`)
- Create: `apps/api/prisma/migrations/20260708130000_message_templates/migration.sql`
- Test: `apps/api/src/core/notification-dispatch/message-template-model.spec.ts`

- [ ] **Step 1:** add to `schema.prisma`:
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
+ `School { messageTemplates MessageTemplate[] }`.
- [ ] **Step 2:** `TENANT_MODELS` += `"MessageTemplate"`.
- [ ] **Step 3:** migration `.../20260708130000_message_templates/migration.sql`:
```sql
CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_schoolId_key_key" ON "MessageTemplate"("schoolId","key");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```
- [ ] **Step 4: Failing test**: create School + MessageTemplate; `@@unique([schoolId,key])` rejects a duplicate `(schoolId,key)`; a second school can create the same `key`.
- [ ] **Step 5:** `migrate deploy` + `generate`. **Step 6:** run — PASS. **Step 7:** build → `dist/main.js`. **Step 8: Commit** (`feat(notifications): MessageTemplate model`).

---

### Task 2: Registry + render/validate + `MessageTemplateService`

**Files:**
- Create: `apps/api/src/core/notification-dispatch/message-template.registry.ts`, `message-template.util.ts`, `message-template.service.ts`, `dto/message-template.dto.ts`
- Modify: `apps/api/src/core/notification-dispatch/notification-dispatch.module.ts` (provide + export `MessageTemplateService`)
- Test: `message-template.util.spec.ts`, `message-template.service.spec.ts`

**Interfaces:**
- `message-template.registry.ts`: `MESSAGE_TEMPLATES` (the 3 keys with `variables` + `default` per the spec) + `type MessageTemplateKey`.
- `message-template.util.ts`: `renderTemplate(body: string, vars: Record<string,string>): string`; `validateTemplate(key: string, body: string): void`.
- `MessageTemplateService`: `render(schoolId, key: MessageTemplateKey, vars): Promise<string>`; `list(schoolId): Promise<{key; body; isCustomized; allowedVariables: string[]; defaultBody: string}[]>`; `set(schoolId, key: string, body: string): Promise<void>`; `reset(schoolId, key: string): Promise<void>`.
- `SetMessageTemplateDto {body: string}`.

- [ ] **Step 1: Failing tests.**
  - `renderTemplate("Hi {{studentName}}, {{studentName}}!", {studentName:"Ada"})` → `"Hi Ada, Ada!"`; `renderTemplate("Bal {{balance}}", {})` → `"Bal "`; text w/o placeholders unchanged.
  - `validateTemplate("FEE_INSTALLMENT_REMINDER", "{{studentName}} {{amount}} {{dueDate}}")` passes; `validateTemplate("RESULTS_READY", "{{studentName}} {{amount}}")` → `BadRequestException` (amount not allowed); `validateTemplate("NOPE", "x")` → `BadRequestException`.
  - `MessageTemplateService`: `render` with no row → the code default rendered; after `set(schoolId,"RESULTS_READY","Hello {{studentName}}")`, `render` → `"Hello Ada"`; `set` with a bad var throws; `reset` → back to default; `list` returns all 3 keys with `isCustomized` reflecting overrides; scoped by schoolId (another school unaffected).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
```ts
// message-template.util.ts
import { BadRequestException } from "@nestjs/common";
import { MESSAGE_TEMPLATES } from "./message-template.registry";
const VAR_RE = /\{\{\s*(\w+)\s*\}\}/g;
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(VAR_RE, (_m, name: string) => vars[name] ?? "");
}
export function validateTemplate(key: string, body: string): void {
  const spec = (MESSAGE_TEMPLATES as Record<string, { variables: readonly string[] }>)[key];
  if (!spec) throw new BadRequestException(`Unknown template key: ${key}`);
  const used = [...body.matchAll(VAR_RE)].map((m) => m[1]);
  const bad = [...new Set(used.filter((v) => !spec.variables.includes(v)))];
  if (bad.length) throw new BadRequestException(`Unknown template variable(s): ${bad.join(", ")}`);
}
```
`MessageTemplateService.render`: `const row = await prisma.messageTemplate.findFirst({where:{schoolId, key}}); const body = row?.body ?? MESSAGE_TEMPLATES[key].default; return renderTemplate(body, vars);`. `set`: `validateTemplate(key, body)` then `upsert({where:{schoolId_key:{schoolId,key}}, create:{schoolId,key,body}, update:{body}})`. `reset`: `deleteMany({where:{schoolId,key}})`. `list`: map `Object.keys(MESSAGE_TEMPLATES)` with the school's rows. DTO uses class-validator (`@IsString @IsNotEmpty body`). Provide + export `MessageTemplateService` from `notification-dispatch.module.ts`.
- [ ] **Step 4: Run — PASS.** **Step 5:** build → `dist/main.js`. **Step 6: Commit** (`feat(notifications): message template registry + render/validate + service`).

---

### Task 3: Render templates at the 3 send sites

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts` (fee reminder + results-ready messages), `apps/api/src/modules/fees/collections.service.ts` (balance reminder)
- Test: `apps/api/src/modules/notifications/message-template-wiring.spec.ts`

**Interfaces:** Consumes `MessageTemplateService.render` (global module — add to constructors).

- [ ] **Step 1: Failing test** `message-template-wiring.spec.ts`:
  - Default rendered strings match today exactly: fee installment reminder = `Dear Parent, {name}'s fees installment of {amount} is due {date}. Kindly settle it. Thank you.`; results-ready = `Dear Parent, {name}'s results are now ready. Please log in to view the report card.`; collections balance = `Dear Parent, {name}'s {termLabel} fees balance is {amount}. Kindly settle it. Thank you.` (assert exact sent text via spies/log adapter with a known student/amount).
  - A customized template (set `RESULTS_READY` to `"Results out for {{studentName}}"`) changes the results-ready message actually sent.
  - The automated **no-schedule** reminder now renders `FEE_INSTALLMENT_REMINDER` (assert the "fees installment … is due" wording, not the old "fees balance").
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** In `notifications.service` inject `MessageTemplateService`. Replace the fee-reminder inline `message` (both installment + no-schedule callers of `sendFeeReminder`) with `await this.templates.render(schoolId, "FEE_INSTALLMENT_REMINDER", { studentName, amount: naira(amountKobo), dueDate: dueDateStr })` — drop the now-unused `isInstallment`/`what` branch. Replace the results-ready inline `message` with `await this.templates.render(schoolId, "RESULTS_READY", { studentName })`. In `collections.service` inject `MessageTemplateService`; replace the `msg` string with `await this.templates.render(schoolId, "FEE_BALANCE_REMINDER", { studentName: `${student.firstName} ${student.lastName}`, termLabel, balance: naira(balance) })`.
- [ ] **Step 4: Run — PASS** (+ existing notifications/fees/collections specs green — update any that asserted the old no-schedule "fees balance" wording). **Step 5: Commit** (`feat(notifications): render fee reminders + results-ready + collections via templates`).

---

### Task 4: Templates API

**Files:**
- Create: `apps/api/src/modules/notifications/message-templates.controller.ts`
- Modify: `apps/api/src/modules/notifications/notifications.module.ts` (add the controller)
- Test: `apps/api/src/modules/notifications/message-templates.controller.spec.ts`

**Interfaces:** Consumes `MessageTemplateService` (global). Routes under `v1/notifications/templates`, `school.manage`.

- [ ] **Step 1:** `message-templates.controller.ts` `@Controller("v1/notifications/templates")` (`@UseGuards(JwtAuthGuard, PermissionGuard)` + `@RequirePermissions("school.manage")`, `TenantContext.schoolIdOrThrow()`): `GET /` → `service.list(schoolId)`; `PUT /:key` `{body}` → `service.set(schoolId, key, body)`; `DELETE /:key` → `service.reset(schoolId, key)`.
- [ ] **Step 2:** register the controller in `notifications.module.ts`.
- [ ] **Step 3: Test** (integration or delegation): `list` returns 3 keys with defaults + `allowedVariables`; `PUT` a valid body persists (`list` shows `isCustomized:true`); `PUT` a bad variable → 400; `DELETE` resets. (Guard/tenant covered by the service + guard.)
- [ ] **Step 4: Run — PASS** (`... jest message-templates --runInBand`) + build emits `dist/main.js`. **Step 5: Commit** (`feat(notifications): message templates API`).

---

### Task 5: Web — templates editor

**Files:**
- Modify: `apps/web/src/lib/api.ts` (types + methods)
- Create: `apps/web/src/app/(app)/settings/message-templates/page.tsx` (+ settings-index card)

**Interfaces:** `interface MessageTemplate {key; body; isCustomized; allowedVariables:string[]; defaultBody:string}`; methods `listMessageTemplates()`, `setMessageTemplate(key, body)`, `resetMessageTemplate(key)`.

- [ ] **Step 1:** API client types + 3 methods (`GET /v1/notifications/templates`, `PUT /:key`, `DELETE /:key`). Settings page: for each returned template — a human label (map key→label), an editable textarea (pre-filled with `body`), the `allowedVariables` as clickable insert-chips (insert `{{var}}` at cursor/append), a live **preview** (substitute sample values for each var), **Save**, and **Reset to default** (shown when `isCustomized`). Client-side: warn if the body references a token not in `allowedVariables` (mirror server validation) before Save. Add a "Message templates" card to the settings index. Loading/empty/saved states. `@mymakaranta/ui`, teal/lime.
- [ ] **Step 2: tsc + lint** (0 / no new errors). **Step 3: Commit** (`feat(web): message templates editor`).

---

### Task 6: Regression gate

- [ ] **Step 1: Reset DB + full API suite** (`... prisma migrate reset --force --skip-seed --skip-generate` then `... jest --runInBand`; known unrelated `migrate-identity` pollution only in a non-reset full run, passes isolated).
- [ ] **Step 2: Build emits `dist/main.js`.** **Step 3: Web gate** (`tsc --noEmit` 0 + lint no new errors). **Step 4: Commit** empty gate marker: `test: EN-3b message templates regression gate green (api <N> + dist/main.js, web tsc 0 + lint)`.

---

## Self-Review

**Spec coverage:** MessageTemplate model + override-or-default (T1/T2) ✓; 3-key registry + allowed vars (T2) ✓; `{{var}}` render + save-time validate (T2) ✓; 3 send sites render via service, incl. the intended no-schedule wording change (T3) ✓; get/put/delete API `school.manage` (T4) ✓; web editor w/ chips + preview + reset (T5) ✓; regression (defaults byte-identical for installment/results/balance) + tenant scoping + gate (T3/T4 + T6) ✓; out-of-scope not built ✓.

**Placeholder scan:** none — full code for schema, migration, `renderTemplate`/`validateTemplate`, and the service body; wiring diffs reference the exact current message strings; web task gives exact types/methods + the label/preview behavior.

**Type consistency:** `renderTemplate(body, vars)` + `validateTemplate(key, body)` + `MessageTemplateService.render/list/set/reset` signatures identical across T2 (defined) and T3/T4 (consumed). Registry keys `FEE_INSTALLMENT_REMINDER`/`FEE_BALANCE_REMINDER`/`RESULTS_READY` used identically in registry, wiring (T3), and API/web. `MessageTemplate` list shape (`key,body,isCustomized,allowedVariables,defaultBody`) consistent T2↔T4↔T5.
