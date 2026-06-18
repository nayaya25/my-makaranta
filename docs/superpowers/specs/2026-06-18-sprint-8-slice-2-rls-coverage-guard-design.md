# Sprint 8 · Slice 2 — RLS Coverage Guard + Deploy Recipe (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 8 (pre-deploy hardening), slice 2. Closes the "a new tenant table silently ships without an RLS backstop" gap and captures the prod RLS-activation recipe. The risky runtime GUC wiring is **deferred to actual deployment** (recipe documented here).
- **Builds on:** the existing RLS policies (per-table `tenant_isolation` + FORCE, added in the `rls_*` migrations), the `mymakaranta_app` non-superuser role, `rls.e2e-spec.ts` (proves the policy *blocks* cross-tenant for `Student`), the `TENANT_MODELS` set (the Prisma middleware's tenant-table list).

## Goal

Guarantee every tenant-scoped table actually has FORCE RLS + a `tenant_isolation` policy — automatically, so a
future table added to `TENANT_MODELS` (and thus middleware-scoped) cannot ship without the DB backstop. Plus a
written prod recipe for turning RLS on at deploy time.

## Why this (and not the full runtime wiring)
The RLS policies exist and are proven to block cross-tenant (`rls.e2e-spec.ts`, via `SET LOCAL ROLE
mymakaranta_app` + the GUC) — but only for `Student`; a new tenant table missing its policy wouldn't be
caught. App-layer `schoolId` scoping is the solid primary enforcement (reviewed every slice). The runtime
GUC/role wiring (making RLS active for normal traffic) is a risky data-layer change (per-request `set_config`
vs the many interactive `$transaction` blocks) AND deploy-coupled (only meaningful connected as the role with
prod creds; dev is superuser → RLS bypassed). So: lock in the *correctness* guarantee + *document* the
activation, defer the runtime change to deploy.

## Scope (locked decisions, slice 2)
1. **Export `TENANT_MODELS`** as the shared source of truth (middleware + the new test import it).
2. **A coverage test** asserting, for every `TENANT_MODELS` table, FORCE RLS is on + a `tenant_isolation`
   policy exists (Postgres catalog introspection).
3. **A deploy recipe doc** (`docs/DEPLOYMENT-RLS.md`) for activating RLS in prod.

### Non-goals
- Runtime per-request `set_config`/`SET ROLE` wiring (deferred to deploy — recipe only); changing how the app
  connects; the `mymakaranta_app` login credentials; a Prisma `$extends` rollout; web/UI; any migration.

## Architecture

`TENANT_MODELS` becomes an exported const (in `prisma.service.ts`, or a tiny shared module both import — pick
the minimal change). A new e2e (`rls-coverage.e2e-spec.ts`) reads the Postgres system catalogs to assert each
table's RLS state. A markdown deploy recipe. No code path or schema change.

### `TENANT_MODELS` export
- Make the existing `const TENANT_MODELS = new Set([...])` in `apps/api/src/core/prisma/prisma.service.ts`
  an `export`. (Minimal: add `export`. The middleware in the same file keeps using it.) The test imports
  `{ TENANT_MODELS }` from the prisma.service module.

### Coverage test — `apps/api/test/rls-coverage.e2e-spec.ts`
- Boot the app/PrismaService (model on `rls.e2e-spec.ts`). For each `table` in `[...TENANT_MODELS]`:
  - **FORCE RLS:** `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`
    (param the quoted identifier, e.g. `'"Student"'`) → both `true`.
  - **Policy present:** `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename =
    $1 AND policyname = 'tenant_isolation'` (param the unquoted name `Student`) → `n >= 1`.
- Drive it as a table-driven test (`it.each([...TENANT_MODELS])(...)` or a loop building one assertion list);
  a failing table names itself in the assertion. The introspection runs as the dev superuser (catalog reads
  need no RLS). Use `$queryRawUnsafe`/`$queryRaw` with parameters (no interpolation of untrusted input — the
  names come from the static `TENANT_MODELS`).
- This complements `rls.e2e-spec.ts`: that proves the policy *enforces* (blocks cross-tenant) for one table;
  this proves the policy *exists + is forced* for **all** tenant tables.

### Deploy recipe — `docs/DEPLOYMENT-RLS.md`
Document the steps to make RLS active in production (the deferred runtime wiring):
1. **Connection as the app role** — either connect `DATABASE_URL` directly as `mymakaranta_app` (give it
   `LOGIN` + a secret-managed password in prod; it's `NOLOGIN`/no-bypass today), or connect as an owner/login
   role that `SET ROLE mymakaranta_app` per transaction. Non-superuser, `NOBYPASSRLS`.
2. **Set the GUC per request** — within a transaction, `SELECT set_config('app.current_school_id',
   <schoolId>, true)` (the `true` = LOCAL to the transaction → no pooled-connection leakage), then run the
   request's queries on that transaction.
3. **Recommended runtime mechanism** — a Prisma client extension (`$extends`) whose `query` hook reads
   `TenantContext.current()?.schoolId` and runs each tenant operation inside `prisma.$transaction([ set_config
   raw, operation ])`; or a NestJS request-scoped transaction. Note the **regression risk** with existing
   interactive `$transaction` blocks (nested transactions) → implement + test against the role at deploy.
4. **Superuser caveat** — `postgres` (and any `BYPASSRLS`/superuser) ignores RLS; dev uses `postgres` so RLS is
   inert locally (the coverage + `rls.e2e-spec` tests exercise it via `SET LOCAL ROLE`).
5. **Verification at deploy** — connect as the app role, confirm a tenant query returns rows only with the GUC
   set, and the `rls.e2e-spec`/`rls-coverage` suites pass.

## Validation & errors
- A `TENANT_MODELS` table without FORCE RLS or without a `tenant_isolation` policy → the coverage test FAILS,
  naming the table. (The intended regression-catch for a future un-migrated table.)
- The test makes no writes (catalog reads only); no cleanup needed beyond the standard module teardown.

## Testing
- **API e2e** (`rls-coverage.e2e-spec.ts`): all current tenant tables pass (FORCE RLS + policy). Full suite
  stays green.
- **Manual sanity** (optional): temporarily add a fake name to a local copy of the list → the test fails for
  it (don't commit) — confirms the guard bites. Not part of the committed suite.
- **No web, no QA beyond the test** (no runtime change).

## Dependencies
- The existing RLS migrations + `mymakaranta_app` role + `TENANT_MODELS`. No new deps, no migration, no schema
  change, no runtime change.

## Out-of-scope future
- Runtime per-request `set_config`/`SET ROLE` wiring (at deploy); `mymakaranta_app` login provisioning + secret
  management; a Prisma `$extends` RLS client; asserting the per-table GRANTs to the role; multi-instance
  connection pooling concerns.
