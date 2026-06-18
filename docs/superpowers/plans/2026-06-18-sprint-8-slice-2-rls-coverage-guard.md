# RLS Coverage Guard + Deploy Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every `TENANT_MODELS` table has FORCE RLS + a `tenant_isolation` policy (a regression guard), and document the prod RLS-activation recipe.

**Architecture:** Export `TENANT_MODELS` as the shared source of truth; a catalog-introspection e2e asserts each tenant table's RLS state; a markdown deploy recipe captures the deferred runtime GUC/role wiring. No migration, no schema/runtime change.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-8-slice-2-rls-coverage-guard-design.md`

**Branch:** `sprint-8-rls-coverage` (already created).

**KEY CONVENTIONS:** the test reads Postgres catalogs (runs fine as the dev superuser); table names come from the static `TENANT_MODELS` (safe to parameterize). It complements `rls.e2e-spec.ts` (which proves the policy *blocks* for `Student`). No runtime change. Stop dev servers before `build`; kill stray jest workers on EPERM.

---

## File Structure
- Modify: `apps/api/src/core/prisma/prisma.service.ts` (export `TENANT_MODELS`)
- Create: `apps/api/test/rls-coverage.e2e-spec.ts`, `docs/DEPLOYMENT-RLS.md`

---

## Task 1: Export `TENANT_MODELS` + the coverage test

**Files:** Modify `apps/api/src/core/prisma/prisma.service.ts`; create `apps/api/test/rls-coverage.e2e-spec.ts`

- [ ] **Step 1: Export the set** — in `apps/api/src/core/prisma/prisma.service.ts`, change line 6 from:
```ts
const TENANT_MODELS = new Set([
```
to:
```ts
export const TENANT_MODELS = new Set([
```
(No other change — the in-file middleware keeps using it.)

- [ ] **Step 2: Write the coverage test** — `apps/api/test/rls-coverage.e2e-spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService, TENANT_MODELS } from "../src/core/prisma/prisma.service";

// Complements rls.e2e-spec.ts (which proves the policy BLOCKS cross-tenant for Student):
// this asserts EVERY tenant-scoped table has FORCE RLS + a tenant_isolation policy, so a future
// table added to TENANT_MODELS (and thus middleware-scoped) cannot ship without the DB backstop.
// Catalog reads need no RLS, so running as the dev superuser is fine.
describe("RLS coverage (every TENANT_MODELS table is RLS-forced + policied)", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const tables = [...TENANT_MODELS];

  it("covers a non-trivial set of tenant tables", () => {
    expect(tables.length).toBeGreaterThanOrEqual(20);
  });

  it.each(tables)("%s has ROW LEVEL SECURITY enabled + FORCED", async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`,
      `"${table}"`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
    expect(rows[0]?.relforcerowsecurity).toBe(true);
  });

  it.each(tables)("%s has a tenant_isolation policy", async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation'`,
      table,
    );
    expect(rows[0]?.n ?? 0).toBeGreaterThanOrEqual(1);
  });
});
```
(NOTE: `oid = $1::regclass` needs the **quoted** identifier `'"Student"'` because the table names are
PascalCase; `pg_policies.tablename` takes the **unquoted** name `Student`. This test PASSES immediately —
the policies already exist (added per-slice) — it locks that state in and fails if a future tenant table
lacks the backstop. There is no "red" phase because the subject-under-test is the live DB state, which is
already correct; that's expected for a guard test.)

- [ ] **Step 3: Run the coverage test**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json rls-coverage`
Expected: PASS — every tenant table (~26) asserts FORCE RLS + a `tenant_isolation` policy.

- [ ] **Step 4: Confirm the guard bites (manual, NOT committed)** — temporarily add a throwaway name to the
  local `tables` array in the test (e.g. `const tables = [...TENANT_MODELS, "AuditLog"];` — `AuditLog` is
  intentionally NOT a tenant-RLS table), re-run → that row FAILS (proving the guard catches an unprotected
  table). **Revert the change** before committing.

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json rls-coverage` (with the temp addition)
Expected: the `AuditLog` rows FAIL (relforcerowsecurity false / no policy). Then revert.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/core/prisma/prisma.service.ts apps/api/test/rls-coverage.e2e-spec.ts
git commit -m "test(rls): coverage guard — every TENANT_MODELS table is FORCE-RLS + policied"
```

---

## Task 2: Deploy recipe + finish

**Files:** Create `docs/DEPLOYMENT-RLS.md`; modify `docs/RESUME.md`

- [ ] **Step 1: Write the deploy recipe** — `docs/DEPLOYMENT-RLS.md`:
```markdown
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
```

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 8 slice 2 entry (RLS coverage guard: exported `TENANT_MODELS`, `rls-coverage.e2e-spec` asserts FORCE RLS + `tenant_isolation` for every tenant table; `docs/DEPLOYMENT-RLS.md` recipe; runtime GUC wiring deferred to deploy). Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit + web vitest + UI vitest + builds, then merge `sprint-8-rls-coverage` → main per the user's choice.

---

## Notes for the implementer
- **No migration, no schema/runtime change** — this is a test + an export + a doc.
- The coverage test **passes on first run** (policies already exist); it's a guard, not test-first-for-new-code. Prove it bites via the throwaway-name check in Task 1 Step 4 (revert before commit).
- `oid = $1::regclass` takes the **quoted** PascalCase name (`'"Student"'`); `pg_policies.tablename` takes the **unquoted** name (`Student`). Both names come from the static `TENANT_MODELS` (no injection risk).
- e2e count: 186 → +~53 (each of ~26 tables × 2 `it.each` cases + 1 sanity) in a new suite. Report the final count; full suite must stay green.
- Stop dev servers before `build`; kill stray jest workers on EPERM.
```
