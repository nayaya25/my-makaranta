# P2 Subdomain & White-Label — Deploy Runbook

Manual/ops steps that the P2 code change cannot perform itself. Do these **in order** when shipping `feat/tenancy-whitelabel-p2` to production. P2 is additive; existing single-domain (`app.mymakaranta.com`) + marketing keep working throughout.

## 0. Prerequisites
- P1 (identity core) already deployed; the `Person/Membership/Role` tables exist and were backfilled (`pnpm --filter @mymakaranta/api migrate:identity`).
- This branch merged to `dev` → `main` per the normal PR flow.

## 1. Database migrations (Neon)
On deploy, the API must run the two new migrations: `*_rls_identity` and `*_school_whitelabel`.
- Ensure the deploy step runs: `pnpm --filter @mymakaranta/api exec prisma migrate deploy` (NOT `migrate dev`).
- Verify with `prisma migrate status` that both are applied.

## 2. RLS effectiveness (critical)
The `rls_identity` migration enables Row-Level Security on `Membership`, `StaffProfile`, `StudentProfile` with a `schoolId` policy keyed off the same `current_setting(...)` used by the existing `rls_*` migrations.
- **The production DB connection must use the non-superuser `mymakaranta_app` role.** Postgres superusers (e.g. `postgres`, Neon owner) **bypass RLS**, so the policy is inert if the app connects as the owner. Confirm `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) use `mymakaranta_app`.
- `mymakaranta_app` is created by the original `rls_defense_in_depth` migration; if a fresh DB, ensure that migration ran first.
- App-level explicit `schoolId` scoping remains the primary isolation; RLS is defense-in-depth.

## 3. Backfill `School.slug`
Every school needs a unique, valid subdomain slug.
- For existing schools without a slug (or with a non-conforming one), assign slugs using `slugify(name)` (see `apps/api/src/core/tenant/slug.ts`), resolving collisions with a numeric suffix, and **verify uniqueness** (`School.slug` is `@unique`).
- Validate each against `validateSlug` (3–40 chars, `[a-z0-9-]`, not reserved). Reserved: `app, www, api, admin, signup, mail, smtp, ftp, ns1, ns2, static, assets, cdn, status, help, docs, blog`.

## 4. Wildcard DNS (Cloudflare)
- Add a DNS record for `*.mymakaranta.com` pointing at Vercel (CNAME to the Vercel project target, proxied per existing apex/app setup).
- Keep apex (`mymakaranta.com`) + `www` on marketing; `app.mymakaranta.com` continues to serve the school-chooser/login.

## 5. Vercel domain
- In the **web** Vercel project, add the wildcard domain `*.mymakaranta.com` (Vercel supports wildcard custom domains on the relevant plan). Confirm TLS issues for the wildcard.
- The Next.js middleware (`apps/web/src/middleware.ts`) sets `x-tenant-slug` from the subdomain; no per-school config needed.

## 6. Smoke test (post-deploy)
1. `GET https://<anyslug>.mymakaranta.com/` resolves and renders the school's branding (logo + `themeKey` palette) on the login page.
2. `GET /v1/public/tenant/<slug>` returns `{ id, name, slug, themeKey, logoUrl, motto }` only — confirm NO `technicalContact`/counts leak.
3. Log in on the subdomain (existing OTP flow). Authed API calls carry `x-tenant-school-id`; the `TenantGuard` 403s if it ever mismatches the JWT `sch`.
4. An unknown slug → friendly 404; a reserved subdomain → not treated as a tenant.

## 7. CI note (argon2 tests)
The `PasswordService` argon2 tests use argon2id's 64 MB memory cost and can throw **"Memory allocation error"** when many Jest workers run in parallel on a memory-constrained runner. Run the API suite with `jest --runInBand` (or `--maxWorkers=2`) in CI, or set a lower argon2 `memoryCost` for the test env only. Verified locally: full suite is 116/116 green serially.

## Follow-ups (tracked, not blocking P2)
- Layout `themeKey` is currently hardcoded `"teal"`; fetch the school's `themeKey` from `/v1/schools/me` (or embed in session) so the app shell themes per-tenant, not just the login page.
- Consolidate the inlined `PALETTE_KEYS` in `apps/api` with the `@mymakaranta/ui` export (kept inline to avoid api→ui coupling; decide intentionally).
- WCAG AA contrast validation for the 7 non-teal curated palettes before exposing them in the branding UI.
- Next.js image domain allowlist for external `logoUrl` hosts (login uses a raw `<img>`).
