# Activating Row-Level Security in Production

myMakaranta's primary tenant isolation is **application-layer** (explicit `schoolId` scoping + the Prisma
`$use` middleware, enforced on every tenant model). PostgreSQL **Row-Level Security (RLS)** is a
defense-in-depth backstop: every tenant table has FORCE RLS + a `tenant_isolation` policy keyed on the
`app.current_school_id` GUC. The `rls-coverage` test guarantees the policies exist on every tenant table; the
`rls.e2e-spec` test proves they block cross-tenant reads. RLS is **inert in dev** because we connect as the
`postgres` superuser (superusers bypass RLS); it activates in production via the steps below.

## 1. Connect as a non-superuser role
RLS only engages for a role without `BYPASSRLS`/superuser. Two options:
- **(a) Connect directly as `mymakaranta_app`** — grant it `LOGIN` + a password (secret-managed) in prod
  (it is `NOLOGIN`, `NOBYPASSRLS` today), and point the prod `DATABASE_URL` at it.
- **(b) Connect as an owner/login role that `SET ROLE mymakaranta_app`** per transaction (a superuser that
  `SET ROLE`s to a non-superuser role loses its bypass — this is how the tests exercise RLS).

## 2. Set the tenant GUC per request (transaction-local)
Within a transaction, before the request's queries:
```sql
SELECT set_config('app.current_school_id', '<schoolId>', true);  -- true = LOCAL to the tx (no pool leakage)
```
With the GUC unset, FORCE RLS returns **zero rows** for every tenant table — so the GUC MUST be set for each
authenticated, tenant-scoped request.

## 3. Recommended runtime mechanism (deferred — implement at deploy)
A Prisma client extension (`$extends`) whose `query` hook reads `TenantContext.current()?.schoolId` and runs
each tenant operation inside `prisma.$transaction([ <set_config raw>, <operation> ])` (the official Prisma
RLS pattern — both run on one connection, so the `local` GUC applies). Alternatively a NestJS request-scoped
transaction.
**Regression risk:** the app already uses interactive `prisma.$transaction(async (tx) => …)` in several
services (fees, announcements, messaging, auth) — naive per-operation wrapping can nest transactions. Build
+ test this against the `mymakaranta_app` role (not the dev superuser) before relying on it.

## 4. Verify at deploy
Connected as the app role: a tenant query returns rows ONLY with the GUC set; `pnpm exec jest --config
./test/jest-e2e.json rls rls-coverage` passes. The `mymakaranta_app` role must have
`SELECT/INSERT/UPDATE/DELETE` on every tenant table (granted by the `rls_*` migrations).

## Caveat
`postgres` and any `BYPASSRLS`/superuser role IGNORE RLS. Never run the production app as a superuser.
