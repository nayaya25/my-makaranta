# Sprint 8 · Slice 1 — HTTP-Edge Hardening (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 8 (pre-deploy hardening), slice 1 — lock down the HTTP edge before deployment. The first of the hardening slices; **RLS GUC wiring** is the next dedicated slice.
- **Builds on:** `main.ts` (bare bootstrap), the public/unauth routes (slice-2/5 — verify, receipt, webhook), the auth OTP routes, `Staff` (parent already has `@@unique([schoolId, phone])`), the staff-link auto-login (slice 2.5).

## Goal

Close the unmitigated HTTP-edge gaps that block/endanger a real deployment: rate-limit the open public + auth
routes, add security headers, enable an env-driven CORS allowlist (web↔API is cross-origin), and enforce
`Staff` phone-uniqueness. Pure edge/config hardening — no business-logic change.

## Why these (and not RLS) first
App-layer tenant scoping (explicit `schoolId` + the Prisma `$use` middleware, reviewed every slice) already
enforces tenancy, so the absent RLS GUC is *mitigated* (defense-in-depth, its own next slice). By contrast the
public routes have **no** rate-limit (an unmitigated abuse/DoS vector) and there is **no CORS** (a hard
cross-origin blocker for the deployed web app). Those are the higher-priority, self-contained wins.

## Scope (locked decisions, slice 1)
1. **Rate-limiting** — `@nestjs/throttler`: a global default + stricter limits on public + OTP routes; webhook exempt.
2. **Security headers + CORS** — `helmet()` + env-driven `enableCors` in `main.ts`.
3. **`Staff` phone-uniqueness** — `@@unique([schoolId, phone])` + migration; P2002 → 409; rewrite the slice-2.5
   two-staff e2e cross-school; dedupe the dev DB's existing test dupes before the migration.

### Non-goals
- RLS GUC wiring / the `mymakaranta_app` prod role (next slice); a Redis throttler store (single-instance for
  now — noted for multi-instance scale); request logging/observability; secrets rotation; CSRF (token-auth,
  no cookies); per-user/sliding-window rate limits; API versioning changes.

## Architecture

Add `@nestjs/throttler` + `helmet` (deps). A global `ThrottlerGuard` via `APP_GUARD` in `app.module.ts`, with
`@Throttle`/`@SkipThrottle` decorators on the sensitive routes. `helmet()` + `enableCors()` in `main.ts`. A
`Staff` unique constraint (migration) + a P2002→`ConflictException` map in `StaffService.create`. No new
business modules.

### Rate-limiting (`@nestjs/throttler`, latest stable for Nest 11)
- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: TEST ? 100_000 : 120 }])` (default 120 req/min/IP; lenient in
  test so the supertest-based e2e suites don't 429 — `TEST = process.env.NODE_ENV === "test"`). In-memory store.
- `app.module.ts` providers: `{ provide: APP_GUARD, useClass: ThrottlerGuard }`.
- Stricter per-route (decorators on the handlers):
  - `auth/otp/request`, `auth/otp/verify` → `@Throttle({ default: { ttl: 60_000, limit: 10 } })` (per-IP, on top
    of the existing 5/hour-per-phone service guard).
  - `/v1/public/verify/:code`, `/v1/public/receipt/:code` → `@Throttle({ default: { ttl: 60_000, limit: 30 } })`.
  - `/v1/public/payments/webhook` → `@SkipThrottle()` (Paystack retries legitimately; it's HMAC-verified).
- The global guard uses the client IP (`req.ip`); ensure `app.set("trust proxy", 1)` is NOT silently needed —
  note that behind a prod reverse proxy, `trust proxy` must be set for correct IPs (documented, set in main.ts).

### Helmet + CORS (`main.ts`)
```ts
import helmet from "helmet";
// ...
app.use(helmet());
const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean);
app.enableCors({ origin: origins, credentials: true });
app.set?.("trust proxy", 1); // correct client IP behind a proxy (for throttler); harmless locally
```
(`CORS_ORIGINS` = comma-separated allowlist; dev default `http://localhost:3000`. Keep the existing
`rawBody: true` + `ValidationPipe`.)

### `Staff` phone-uniqueness
- `schema.prisma`: add `@@unique([schoolId, phone])` to `Staff`.
- **Migration:** `CREATE UNIQUE INDEX "Staff_schoolId_phone_key" ON "Staff"("schoolId", "phone");` (prod-clean).
- **Dev DB has duplicates** (the slice-2.5 `staff-link` e2e seeds two same-school same-phone staff): the
  orchestrator dedupes those test rows in the dev DB before applying the migration (delete the higher-`id`
  duplicate per `(schoolId, phone)`; the test staff have no dependents). The committed migration is just the
  index (no destructive SQL — prod-safe).
- **P2002 → 409:** `StaffService.create` wraps the `prisma.staff.create` and maps a Prisma `P2002` unique
  violation to `ConflictException("A staff member with that phone/email/staff number already exists.")` (covers
  the existing staffNo/email uniques too, which currently 500).
- **Slice-2.5 e2e fix:** the `staff-link.e2e-spec.ts` "two Staff same phone → PENDING" test currently seeds two
  staff with the same phone IN THE SAME SCHOOL (now a constraint violation). Rewrite it to seed the same phone
  on a staff in **school A and a staff in school B** (a second school) → the cross-school count is still 2 →
  stays PENDING (same assertion, same code path: `parents.length + staff.length !== 1`).

## Validation & errors
- Over the rate limit → **429 Too Many Requests** (ThrottlerGuard default response).
- Disallowed CORS origin → no `Access-Control-Allow-Origin` header (browser blocks; non-browser clients
  unaffected — tokens still work server-to-server).
- Duplicate `Staff` phone (or email/staffNo) in a school → **409** (mapped from P2002).
- Webhook never throttled; HMAC signature check (slice 2) unchanged.
- Test env: throttle limits are high enough that the e2e suite never 429s.

## Testing
- **API e2e:** the full suite stays green with the global `ThrottlerGuard` (lenient in test). Rewrite the
  `staff-link` two-staff test cross-school (asserts PENDING). Add a Staff duplicate-phone test: creating a
  second staff with an existing `(schoolId, phone)` → rejected (assert the `ConflictException`/P2002 via
  `StaffService.create`, or a direct `prisma.staff.create` rejection in a service-level spec).
- **Unit:** none new required.
- **Web:** none (no web change).
- **HTTP QA:** burst `POST /auth/otp/request` (or `/v1/public/verify/:code`) past the limit → 429; `curl -I`
  any route → helmet headers present (`x-content-type-options: nosniff`, `x-frame-options`, etc.); an `OPTIONS`
  preflight with `Origin: http://localhost:3000` → CORS allow headers, with a disallowed origin → none;
  `POST /v1/public/payments/webhook` repeatedly → not throttled (no 429). `pnpm audit --prod` after adding the
  two deps (per dependency policy) → no new criticals.

## Dependencies
- New npm deps: `@nestjs/throttler`, `helmet` (latest stable for Nest 11; run `pnpm audit` after). `Staff`
  one-column-unique migration (no RLS). `ThrottlerModule` + `APP_GUARD` in `app.module.ts`; helmet + CORS in
  `main.ts`. No new business models.

## Out-of-scope future
- RLS GUC wiring + `mymakaranta_app` prod role (next hardening slice); Redis throttler store for multi-instance;
  request logging / observability; secrets management; CSP tuning; API gateway / WAF.
