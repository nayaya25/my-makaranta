# Platform & Identity Foundation — P2: Tenancy, Subdomain & White-Label — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each school into a branded **subdomain portal** (`ahlacademy.mymakaranta.com`) — resolve the tenant from the hostname, enforce it server-side, let users log in on their school's subdomain, and apply per-school white-label (logo + curated palette + motto), while hardening the P1 identity tables with RLS.

**Architecture:** Additive on top of P1. Wildcard DNS `*.mymakaranta.com` → the Next.js web app; **middleware** maps subdomain → `School.slug` → tenant context (a request header + a small public resolve endpoint). The API gains a **tenant guard** asserting `JWT.sch` equals the request's resolved school. White-label = new `School` columns + a curated palette map injected as CSS-variable overrides at the tenant root layout. Adds the deferred `rls_identity` migration.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL, Next.js 15 (App Router, middleware), `packages/ui` design tokens, Jest. Depends on P1 (`Person/Membership/Role`, `POST /auth/login`, JWT `{sub,mbr,sch,roles,perms,tv}`).

## Global Constraints

- **Prerequisite:** P1 (`feat/identity-core-p1`) is merged to `dev`; branch this off the merged `dev`.
- Multi-tenancy: every new read/write scoped by `schoolId` explicitly; the tenant guard is defense-in-depth, not a replacement for scoping (per `tenant-idor-rule`, `prisma-tenant-scope-explicitly`).
- Reserved subdomains (verbatim, lower-case): `app, www, api, admin, signup, mail, smtp, ftp, ns1, ns2, static, assets, cdn, status, help, docs, blog`.
- Slug rules (verbatim): lowercase `[a-z0-9-]`, 3–40 chars, no leading/trailing/double hyphen, not in the reserved list.
- White-label palettes are a **curated set** keyed by `School.themeKey` (default `"teal"`); arbitrary hex from schools is NOT accepted this phase.
- Base hosts: marketing on apex + `www`; the app on subdomains; `app.mymakaranta.com` (no school) = the school-chooser/login. Do NOT break the existing marketing or current `app.` deploys.
- Tests run against the local test DB: prefix prisma/jest with `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`. Never commit that string; `.superpowers/` is git-ignored.
- Use latest stable deps; no new heavy dependency without need.

## File Structure

- `apps/api/prisma/migrations/*_rls_identity/` — RLS on P1 identity tables (create).
- `apps/api/prisma/migrations/*_school_whitelabel/` — new `School` columns (create).
- `apps/api/prisma/schema.prisma` — add white-label fields to `School` (modify).
- `apps/api/src/core/tenant/slug.ts` (+ `.spec.ts`) — slug validation + reserved list (create).
- `apps/api/src/modules/structure/schools.controller.ts` + `schools.service.ts` — `GET /v1/public/tenant/:slug`, `PATCH /v1/schools/branding` (modify).
- `apps/api/src/core/tenant/tenant.guard.ts` (+ `.spec.ts`) — assert `JWT.sch` == request school (create).
- `apps/web/src/middleware.ts` — subdomain → tenant header/rewrite (create or modify).
- `apps/web/src/lib/tenant.ts` — read tenant on server + client (create).
- `apps/web/src/app/(app)/layout.tsx` — inject white-label CSS vars + logo (modify).
- `packages/ui/src/theme/palettes.ts` (+ `.spec.ts`) — curated palette map → CSS vars (create).
- `apps/web/src/app/(auth)/login/page.tsx` — resolve school from subdomain, pass `schoolId` to `/auth/login` (modify).

---

### Task 1: `rls_identity` migration (P1 review follow-up)

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_rls_identity/migration.sql`
- Test: `apps/api/src/core/identity/rls-identity.spec.ts`

**Interfaces:**
- Produces: RLS enabled with a `schoolId`-scoped policy on every P1 table that carries `schoolId` (`Membership`, `StaffProfile`, `StudentProfile`), following the exact pattern of the existing `rls_*` migrations in `apps/api/prisma/migrations`.

- [ ] **Step 1: Read an existing RLS migration** to copy the project's exact policy pattern — open the newest `*_rls_*` folder under `apps/api/prisma/migrations` and mirror its `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (current_setting('app.school_id') = "schoolId")` form (use the SAME setting name the codebase already uses — confirm it in that file).

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/core/identity/rls-identity.spec.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
describe("rls_identity", () => {
  afterAll(() => prisma.$disconnect());
  it("has RLS enabled on Membership/StaffProfile/StudentProfile", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ relname: string; relrowsecurity: boolean }>>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('Membership','StaffProfile','StudentProfile')`,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `DATABASE_URL=... pnpm exec jest rls-identity` → FAIL (RLS not enabled).

- [ ] **Step 4: Create the migration** — add `prisma/migrations/<ts>_rls_identity/migration.sql` enabling RLS + the schoolId policy on the three tables (mirror the existing pattern from Step 1). Apply with `DATABASE_URL=... pnpm exec prisma migrate dev --name rls_identity`.

- [ ] **Step 5: Run to verify it passes, then commit**

```bash
git add apps/api/prisma/migrations apps/api/src/core/identity/rls-identity.spec.ts
git commit -m "feat(identity): RLS on identity tables (P2)"
```

---

### Task 2: School white-label fields + branding update

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/modules/structure/schools.service.ts`, `schools.controller.ts`, `apps/api/src/modules/structure/dto/schools.dto.ts`
- Create: `apps/api/prisma/migrations/<ts>_school_whitelabel/migration.sql`
- Test: `apps/api/src/modules/structure/branding.spec.ts`

**Interfaces:**
- Consumes: existing `SchoolsService` (already has `setLogo`), `school.manage` permission.
- Produces: `School` gains `themeKey String @default("teal")`, `motto String?`, `type String?`, `state String?`, `technicalContactName/Phone/Email String?`. Endpoint `PATCH /v1/schools/branding` (perm `school.manage`) updating `{ themeKey?, motto?, type?, state?, technicalContact? }`, returning the updated school. `themeKey` must be one of the curated keys (Task 6's `PALETTE_KEYS`); reject others with 400.

- [ ] **Step 1: Add fields to `School` in schema.prisma** (the listed columns) and run `DATABASE_URL=... pnpm exec prisma migrate dev --name school_whitelabel`.

- [ ] **Step 2: Write the failing test** — `branding.spec.ts`: calling the service's `updateBranding(schoolId, { themeKey: "teal", motto: "X" })` persists the values; `updateBranding(schoolId, { themeKey: "not-a-key" })` throws `BadRequestException`.

```typescript
// apps/api/src/modules/structure/branding.spec.ts (skeleton — fill arrange with a created School)
it("updates branding and rejects unknown themeKey", async () => {
  // const s = await prisma.school.create(...)
  // await svc.updateBranding(s.id, { themeKey: "teal", motto: "Knowledge" })
  // expect((await prisma.school.findUnique(...)).motto).toBe("Knowledge")
  // await expect(svc.updateBranding(s.id, { themeKey: "bogus" })).rejects.toThrow(BadRequestException)
});
```

- [ ] **Step 3: Run to verify it fails.**

- [ ] **Step 4: Implement** `updateBranding` in `SchoolsService` (validate `themeKey` against the imported `PALETTE_KEYS` from `packages/ui` — if Task 6 isn't done yet, inline the literal list and replace with the import in Task 6), add `UpdateBrandingDto`, add `@Patch("v1/schools/branding")` guarded by `JwtAuthGuard + PermissionGuard("school.manage")`.

- [ ] **Step 5: Run to verify it passes, then commit**

```bash
git add apps/api/prisma apps/api/src/modules/structure
git commit -m "feat(tenant): School white-label fields + branding endpoint (P2)"
```

---

### Task 3: Slug validation + reserved list

**Files:**
- Create: `apps/api/src/core/tenant/slug.ts`, `apps/api/src/core/tenant/slug.spec.ts`

**Interfaces:**
- Produces: `RESERVED_SUBDOMAINS: Set<string>`, `validateSlug(s: string): string | null` (error message or `null`), `slugify(name: string): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/core/tenant/slug.spec.ts
import { validateSlug, slugify, RESERVED_SUBDOMAINS } from "./slug";
describe("slug", () => {
  it("accepts valid slugs", () => {
    expect(validateSlug("ahlacademy")).toBeNull();
    expect(validateSlug("st-marys-2")).toBeNull();
  });
  it("rejects invalid + reserved", () => {
    expect(validateSlug("ab")).toMatch(/3/);              // too short
    expect(validateSlug("-bad")).toMatch(/hyphen/i);
    expect(validateSlug("Bad_Caps")).toMatch(/lowercase|letters/i);
    expect(validateSlug("app")).toMatch(/reserved/i);
    expect(RESERVED_SUBDOMAINS.has("api")).toBe(true);
  });
  it("slugifies names", () => {
    expect(slugify("St. Mary's Academy")).toBe("st-marys-academy");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/core/tenant/slug.ts
export const RESERVED_SUBDOMAINS = new Set([
  "app","www","api","admin","signup","mail","smtp","ftp","ns1","ns2",
  "static","assets","cdn","status","help","docs","blog",
]);
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40);
}
export function validateSlug(s: string): string | null {
  if (!/^[a-z0-9-]+$/.test(s)) return "Use only lowercase letters, numbers and hyphens.";
  if (s.length < 3 || s.length > 40) return "Must be 3–40 characters.";
  if (s.startsWith("-") || s.endsWith("-") || s.includes("--")) return "No leading, trailing or double hyphens.";
  if (RESERVED_SUBDOMAINS.has(s)) return "That subdomain is reserved.";
  return null;
}
```

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add apps/api/src/core/tenant/slug.ts apps/api/src/core/tenant/slug.spec.ts
git commit -m "feat(tenant): slug validation + reserved subdomains (P2)"
```

---

### Task 4: Public tenant-resolve endpoint + API tenant guard

**Files:**
- Modify: `apps/api/src/modules/structure/schools.controller.ts`, `schools.service.ts`
- Create: `apps/api/src/core/tenant/tenant.guard.ts`, `apps/api/src/core/tenant/tenant.guard.spec.ts`

**Interfaces:**
- Consumes: `School.slug`, JWT `sch` claim (P1), `IdentityService`/Prisma.
- Produces:
  - `GET /v1/public/tenant/:slug` (no auth) → `{ id, name, slug, themeKey, logoUrl, motto }` or 404. Used by the web login/middleware to resolve branding. Returns ONLY public branding fields — never counts, contacts, or member data.
  - `TenantGuard` (Nest guard): reads the request's intended school from the `x-tenant-school-id` header (set by web middleware / API client) and asserts it equals `JWT.sch`; mismatch → 403. Applied globally to authed routes (alongside `JwtAuthGuard`).

- [ ] **Step 1: Write the failing test** for `TenantGuard`: a request whose `JWT.sch` matches the `x-tenant-school-id` header passes; a mismatch throws `ForbiddenException`; a request with no header (legacy/non-subdomain clients) passes (guard is a no-op when no tenant header present, so existing `app.` clients keep working).

```typescript
// apps/api/src/core/tenant/tenant.guard.spec.ts (skeleton — build an ExecutionContext stub)
it("403s when header school != JWT.sch; passes when equal or header absent", () => {
  // ctx with request.user.sch='s1', headers['x-tenant-school-id']='s1' → true
  // header 's2' → ForbiddenException
  // no header → true
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** the public resolve method on `SchoolsService` (`findPublicBySlug(slug)` selecting only public fields), the controller route, and `TenantGuard` (read `request.headers['x-tenant-school-id']`; if falsy → allow; else compare to `request.user?.sch`). Register `TenantGuard` after `JwtAuthGuard` where authed routes are wired (or as an `APP_GUARD` that no-ops without a header).

- [ ] **Step 4: Run to verify it passes (+ existing auth specs), then commit**

```bash
git add apps/api/src/core/tenant apps/api/src/modules/structure
git commit -m "feat(tenant): public resolve endpoint + tenant guard (P2)"
```

---

### Task 5: Curated palettes → CSS variables

**Files:**
- Create: `packages/ui/src/theme/palettes.ts`, `packages/ui/src/theme/palettes.spec.ts`
- Modify: `packages/ui/src/index.ts` (export)

**Interfaces:**
- Produces: `PALETTE_KEYS: readonly string[]` (incl. `"teal"` default), `paletteVars(key: string): Record<string,string>` returning CSS custom properties (e.g. `{ "--brand-500": "#066666", ... }`) for the curated key, falling back to `teal` for unknown keys.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ui/src/theme/palettes.spec.ts
import { paletteVars, PALETTE_KEYS } from "./palettes";
it("returns brand vars for known keys and falls back to teal", () => {
  expect(PALETTE_KEYS).toContain("teal");
  expect(paletteVars("teal")["--brand-500"]).toMatch(/^#/);
  expect(paletteVars("nope")).toEqual(paletteVars("teal")); // fallback
});
```

- [ ] **Step 2: Run to verify it fails** (`pnpm --filter @mymakaranta/ui exec jest palettes`, or the package's test runner).

- [ ] **Step 3: Implement** `palettes.ts`: a record of ~8 curated palettes; each maps to the `--brand-50/100/300/500/700/900` (and accent) CSS var values consistent with `packages/ui/tokens.ts`. `teal` mirrors the current default tokens. Export from `index.ts`.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add packages/ui/src/theme packages/ui/src/index.ts
git commit -m "feat(ui): curated white-label palettes -> CSS vars (P2)"
```

---

### Task 6: Web subdomain middleware + tenant context

**Files:**
- Create/Modify: `apps/web/src/middleware.ts`, `apps/web/src/lib/tenant.ts`

**Interfaces:**
- Consumes: `GET /v1/public/tenant/:slug` (Task 4).
- Produces: middleware that, for a request host `<slug>.mymakaranta.com` (and `<slug>.localhost` in dev), sets request header `x-tenant-slug`; apex/`www`/`app` pass through unchanged. `lib/tenant.ts` exposes `getTenantSlug()` (server: from header; client: from `window.location.host`).

- [ ] **Step 1: Write the failing test** for the host→slug parser (extract a pure `parseTenantHost(host: string): string | null` into `lib/tenant.ts` and unit-test it):

```typescript
// apps/web/src/lib/tenant.spec.ts
import { parseTenantHost } from "./tenant";
it("extracts slug from subdomain hosts only", () => {
  expect(parseTenantHost("ahlacademy.mymakaranta.com")).toBe("ahlacademy");
  expect(parseTenantHost("ahlacademy.localhost:3000")).toBe("ahlacademy");
  expect(parseTenantHost("app.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("www.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("mymakaranta.com")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `parseTenantHost` (strip port; reserved/`app`/`www`/apex → null; first label otherwise) and a Next.js `middleware.ts` that sets `x-tenant-slug` from it. Keep the matcher excluding `/_next`, static assets, and API rewrites.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/lib/tenant.ts apps/web/src/lib/tenant.spec.ts
git commit -m "feat(web): subdomain tenant middleware + parser (P2)"
```

---

### Task 7: White-label root layout + subdomain login wiring

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `parseTenantHost`/`getTenantSlug` (Task 6), `GET /v1/public/tenant/:slug` (Task 4), `paletteVars` (Task 5), `POST /auth/login` (P1).
- Produces: on a school subdomain, the app + login render the school's logo and inject `paletteVars(school.themeKey)` as inline CSS vars at the layout root; the login page resolves the school via the public endpoint and calls `POST /auth/login` with that `schoolId`; the API client attaches `x-tenant-school-id` to authed requests.

- [ ] **Step 1: Write the failing test** — a component/unit test that, given a resolved `themeKey`, the layout renders a `<style>`/inline style containing `--brand-500` from `paletteVars`. (If component testing isn't set up in `apps/web`, instead assert `paletteVars` is wired by unit-testing a small `brandStyle(themeKey)` helper extracted into `lib/tenant.ts` and used by the layout.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — extract `brandStyle(themeKey): React.CSSProperties` (maps `paletteVars` to a style object), apply it on the `(app)` layout root and the login page; fetch the public tenant in the login page to show the school name/logo and pass `schoolId` into `requestOtp`/`loginWithPassword`; add `x-tenant-school-id` in `lib/api.ts` authed-request headers from the stored session's `schoolId`.

- [ ] **Step 4: Run to verify it passes; typecheck web + ui, then commit**

Run: `pnpm --filter @mymakaranta/web exec tsc --noEmit` and `pnpm --filter @mymakaranta/ui exec tsc --noEmit` → exit 0.

```bash
git add apps/web packages/ui
git commit -m "feat(web): white-label theming + subdomain login wiring (P2)"
```

---

### Task 8: Regression gate + ops runbook

**Files:** Create: `docs/ops/2026-06-20-p2-subdomain-rollout.md`

- [ ] **Step 1:** `DATABASE_URL=... pnpm --filter @mymakaranta/api exec tsc --noEmit` and `... jest` → green; `pnpm --filter @mymakaranta/web exec next lint` → no errors.
- [ ] **Step 2: Write the ops runbook** documenting the **manual infra steps** this plan cannot do in code: (a) add wildcard DNS `*.mymakaranta.com` (Cloudflare) → Vercel; (b) add the wildcard domain to the Vercel web project; (c) set `prisma migrate deploy` to run the two new migrations on deploy; (d) backfill `School.slug` for existing schools that lack one and verify uniqueness; (e) smoke test: visit `<slug>.mymakaranta.com`, confirm branding + login resolve.
- [ ] **Step 3: Commit**

```bash
git add docs/ops/2026-06-20-p2-subdomain-rollout.md
git commit -m "docs(ops): P2 subdomain rollout runbook + regression gate (P2)"
```

---

## Self-Review

**Spec coverage (P2 portion of the design spec §3 + P1-review follow-up):**
- RLS on identity tables → Task 1. ✓ (closes the P1 final-review Important item)
- White-label data (logo already from P1 `setLogo`; themeKey/motto/type/state/contacts) → Task 2. ✓
- Slug rules + reserved list → Task 3. ✓
- Wildcard subdomain routing (web middleware) + tenant guard (API) → Tasks 4, 6. ✓
- Curated palette white-label theming + logo at root → Tasks 5, 7. ✓
- Subdomain login → Task 7. ✓
- DNS/Vercel wildcard (infra, not code) → Task 8 runbook (explicitly manual). ✓

**Placeholder scan:** Tasks 2, 4, 7 ship guided test skeletons (arrange/stub blocks) flagged inline — the implementer fills them; the reviewer enforces real assertions. Task 5/6 tests are complete.

**Type consistency:** `PALETTE_KEYS`/`paletteVars` defined in Task 5 and consumed in Tasks 2 (validation) and 7 (layout); `parseTenantHost` defined in Task 6 and consumed in Task 7; `x-tenant-school-id` header set in Task 7 and read by `TenantGuard` in Task 4; JWT `sch` claim is the P1 contract.

**Cross-phase note:** depends on P1 merged. Tasks 4 + 7 share the `x-tenant-school-id` header contract — implement Task 4's guard to no-op when the header is absent so the current `app.` clients and existing tests keep passing during rollout.
