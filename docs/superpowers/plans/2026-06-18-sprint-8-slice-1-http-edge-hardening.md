# HTTP-Edge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate-limit the public/auth routes, add security headers + a CORS allowlist, and enforce `Staff` phone-uniqueness — closing the pre-deploy HTTP-edge gaps.

**Architecture:** Add `@nestjs/throttler` (global `ThrottlerGuard` + stricter per-route limits; webhook exempt; lenient in test) and `helmet` + a multi-origin `enableCors` in `main.ts`. Add `Staff @@unique([schoolId, phone])` + map P2002→409 + rewrite the slice-2.5 two-staff e2e cross-school. No business-logic change.

**Tech Stack:** NestJS 11 (Express) / Prisma 5; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-8-slice-1-http-edge-hardening-design.md`

**KEY CONVENTIONS:** dependency policy = latest stable + `pnpm audit --prod` after; throttler ttl is in **ms** (v6); lenient throttle in `NODE_ENV === "test"` so e2e bursts don't 429; webhook `@SkipThrottle`. `trust proxy` via the Express http adapter. **Windows: stop `pnpm dev` before `prisma migrate`/`build`; kill stray jest workers on EPERM.** NOTE: `main.ts` ALREADY has a single-origin `enableCors` — upgrade it to an allowlist (don't add a second call).

**Branch:** `sprint-8-http-hardening` (already created).

---

## File Structure
- Modify: `apps/api/package.json` (deps), `apps/api/src/app.module.ts` (ThrottlerModule + APP_GUARD), `apps/api/src/main.ts` (helmet + CORS allowlist + trust proxy), `apps/api/src/core/auth/auth.controller.ts` (@Throttle), `apps/api/src/modules/public/public.controller.ts` (@Throttle/@SkipThrottle)
- Modify: `apps/api/prisma/schema.prisma` (`Staff @@unique`), `apps/api/src/modules/sis/staff.service.ts` (P2002→409), `apps/api/test/staff-link.e2e-spec.ts` (cross-school rewrite + dup test); create 1 migration

---

## Task 1: Rate-limiting + helmet + CORS allowlist

**Files:** Modify `apps/api/package.json`, `app.module.ts`, `main.ts`, `auth.controller.ts`, `public.controller.ts`

- [ ] **Step 1: Install deps** — `cd apps/api && pnpm add @nestjs/throttler helmet` (latest stable). Then `cd ../.. && pnpm -w audit --prod || pnpm --filter @mymakaranta/api audit --prod` and confirm no NEW critical advisories (note any).

- [ ] **Step 2: Wire `ThrottlerModule` + global guard** in `apps/api/src/app.module.ts`. Add imports at the top:
```ts
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
```
Add `ThrottlerModule` to the `imports` array (after `ConfigModule.forRoot(...)`):
```ts
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: process.env.NODE_ENV === "test" ? 100_000 : 120 }]),
```
Add a `providers` array to the `@Module({...})` (it currently has only `controllers`):
```ts
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```
(Keep `controllers: [AppController]` and the existing `imports`/`configure`.)

- [ ] **Step 3: Stricter limits on auth OTP routes** — in `apps/api/src/core/auth/auth.controller.ts`, import + decorate:
```ts
import { Throttle } from "@nestjs/throttler";
```
Add `@Throttle({ default: { ttl: 60_000, limit: 10 } })` to BOTH the `requestOtp` and `verifyOtp` handlers (above each `@HttpCode`).

- [ ] **Step 4: Public route limits** — in `apps/api/src/modules/public/public.controller.ts`, import + decorate:
```ts
import { Throttle, SkipThrottle } from "@nestjs/throttler";
```
- `@Throttle({ default: { ttl: 60_000, limit: 30 } })` on `verify` and on `receipt`.
- `@SkipThrottle()` on `webhook` (Paystack retries; HMAC-verified).

- [ ] **Step 5: helmet + CORS allowlist + trust proxy** — replace the body of `apps/api/src/main.ts` `bootstrap()` with:
```ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const origins = (process.env.CORS_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
    .split(",").map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  // Correct client IP behind a reverse proxy (for the rate limiter); harmless locally.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);
  await app.listen(Number(process.env.PORT ?? 4000));
}
void bootstrap();
```

- [ ] **Step 6: Verify** — full e2e + build (the global guard is lenient in test, so the supertest suites must not 429):

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (still 185 tests), build + typecheck clean. (If any supertest suite 429s, the test-env limit isn't being read — confirm `NODE_ENV=test` is set by jest-e2e config; the existing suites already run under it.)

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/package.json apps/api/pnpm-lock.yaml ../../pnpm-lock.yaml apps/api/src/app.module.ts apps/api/src/main.ts apps/api/src/core/auth/auth.controller.ts apps/api/src/modules/public/public.controller.ts
git commit -m "feat(hardening): rate-limiting (throttler) + helmet + CORS allowlist"
```
(Adjust the lockfile path to whichever exists — repo-root `pnpm-lock.yaml` for a workspace.)

---

## Task 2: Staff phone-uniqueness + P2002→409 + e2e

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/modules/sis/staff.service.ts`, `apps/api/test/staff-link.e2e-spec.ts`; create a migration. **Steps 1–4 orchestrator-run (dev dedupe + migration).**

- [ ] **Step 1: Add the constraint** — in `apps/api/prisma/schema.prisma` `model Staff`, add after the existing uniques:
```prisma
  @@unique([schoolId, phone])
```

- [ ] **Step 2: Dedupe the dev DB** (the slice-2.5 e2e left same-school same-phone test staff that would break the unique index). Run a one-off (NOT committed) cleanup, e.g. a `apps/api/dedupe-staff.mjs`:
```js
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const dupes = await p.$queryRawUnsafe(`SELECT "schoolId","phone", array_agg(id ORDER BY id) ids FROM "Staff" GROUP BY "schoolId","phone" HAVING count(*)>1`);
for (const d of dupes) { const [keep, ...drop] = d.ids; if (drop.length) await p.staff.deleteMany({ where: { id: { in: drop } } }); }
console.log("deduped", dupes.length, "groups");
await p.$disconnect();
```
Run `cd apps/api && node dedupe-staff.mjs`, then delete the script. (If a delete fails on an FK from real data, investigate — the test dupes have no dependents.)

- [ ] **Step 3: Migration** — `cd apps/api && pnpm prisma migrate dev --name staff_phone_unique` (additive unique index; regenerates client). The generated SQL is `CREATE UNIQUE INDEX "Staff_schoolId_phone_key" ON "Staff"("schoolId", "phone");` — prod-clean.

- [ ] **Step 4: Map P2002→409** in `apps/api/src/modules/sis/staff.service.ts`. Add imports + wrap `create`:
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
```
```ts
  async create(dto: CreateStaffDto) {
    try {
      return await this.prisma.staff.create({
        data: {
          staffNo: dto.staffNo,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          photoUrl: dto.photoUrl,
          ...(dto.hiredAt !== undefined ? { hiredAt: new Date(dto.hiredAt) } : {}),
        } as never,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("A staff member with that phone, email, or staff number already exists.");
      }
      throw e;
    }
  }
```
(Mirror the same try/catch on `update` if desired — optional this slice; create is the primary path.)

- [ ] **Step 5: Rewrite the slice-2.5 two-staff test cross-school** — in `apps/api/test/staff-link.e2e-spec.ts`, the test "stays PENDING when the phone matches two Staff" currently seeds two staff with the same phone in `schoolAId` (now a unique violation). Replace its body to seed a second school + one staff each:
```ts
  it("stays PENDING when the phone matches staff in two schools", async () => {
    const phone = `+234814${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const sb = await prisma.school.create({ data: { name: `SL-B-${stamp}`, slug: `sl-b-${stamp}-${Date.now().toString(36)}` } });
    await mkStaff(schoolAId, phone, `two-a-${stamp}`);
    await prisma.staff.create({ data: { schoolId: sb.id, staffNo: `SN-two-b-${stamp}`, firstName: "Staff", lastName: "TwoB", email: `sf-two-b-${stamp}@e.test`, phone } });
    const res = await login(phone);
    expect(res.user.identityType).toBe("PENDING");
  });
```
(Uses the file's existing `mkStaff`, `login`, `phones`, `stamp`, `schoolAId`, `prisma`.)

- [ ] **Step 6: Add a duplicate-phone 409 test** — in `apps/api/test/staff-link.e2e-spec.ts`, import `ConflictException` and the `StaffService`, get the service from the module, and assert the create-path maps the violation. At the top imports add:
```ts
import { ConflictException } from "@nestjs/common";
import { StaffService } from "../src/modules/sis/staff.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
```
In the top `beforeAll`, after building the module, add `staffService = moduleRef.get(StaffService);` (declare `let staffService: StaffService;`). Add the test:
```ts
  it("rejects a duplicate (schoolId, phone) staff via the create path (409)", async () => {
    const phone = `+234818${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const run = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolAId, userId: "u" }, fn);
    await run(() => staffService.create({ staffNo: `D1-${stamp}`, firstName: "Dup", lastName: "One", email: `d1-${stamp}@e.test`, phone } as never));
    await expect(run(() => staffService.create({ staffNo: `D2-${stamp}`, firstName: "Dup", lastName: "Two", email: `d2-${stamp}@e.test`, phone } as never))).rejects.toThrow(ConflictException);
  });
```
(`StaffService.create` relies on the tenant middleware to inject `schoolId`, so it runs inside `TenantContext.run`. The afterAll already deletes users/otp by phone; staff rows created here are harmless test data, but if cleanup is desired, also `prisma.staff.deleteMany({ where: { phone: { in: phones } } })` — verify it doesn't FK-break.)

- [ ] **Step 7: Run the staff-link e2e + full suite + build**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json staff-link` then `pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: staff-link green (now incl. the cross-school + 409 tests); full e2e green (187 tests); build clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/sis/staff.service.ts apps/api/test/staff-link.e2e-spec.ts
git commit -m "feat(hardening): Staff phone-uniqueness + P2002->409; staff-link two-staff test cross-school"
```

---

## Task 3: QA + docs + finish

- [ ] **Step 1: HTTP QA.** Start the API (`cd apps/api && pnpm dev`, PORT 4080 — `NODE_ENV` NOT test, so real limits apply). Checks:
  - **Rate limit:** `for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:4080/auth/otp/request -H "Content-Type: application/json" -d '{"phone":"+2348090000001"}'; done` → the first ~10 are 204 (or 400/429 from the per-phone limit), then **429** once the per-IP 10/min trips. (Use a fresh phone; the per-phone 5/hour may 400 first — the point is to see 429 appear from the throttler.) A cleaner check: hit `GET localhost:4080/v1/public/verify/AAAA` 35× → 30 pass (404 for unknown code), then **429**.
  - **helmet:** `curl -sI localhost:4080/v1/public/verify/x | grep -iE "x-content-type-options|x-frame-options|x-dns-prefetch"` → headers present.
  - **CORS:** `curl -sI -X OPTIONS localhost:4080/me -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin` → echoes the allowed origin; with `-H "Origin: http://evil.test"` → no allow-origin header.
  - **webhook unthrottled:** `for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:4080/v1/public/payments/webhook -H "Content-Type: application/json" -d '{}'; done` → all 401 (bad signature), never 429.
  Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 8 slice 1 entry (throttler + helmet + CORS allowlist + Staff phone-uniqueness + P2002→409; e2e count 187; deps `@nestjs/throttler`/`helmet`). Note remaining pre-deploy items (RLS GUC wiring — next slice; Redis throttler store for multi-instance; secrets/observability). Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit + web vitest + UI vitest + builds, then merge `sprint-8-http-hardening` → main per the user's choice.

---

## Notes for the implementer
- **CORS already exists** in `main.ts` (single origin) — UPGRADE the existing `enableCors` to the allowlist; don't add a duplicate.
- **Throttler ttl is in milliseconds** (v6). The global limit is lenient in `NODE_ENV === "test"` (jest-e2e sets it) so the supertest suites don't 429; real limits apply in dev/prod.
- **Webhook must be `@SkipThrottle()`** — Paystack legitimately retries; it's HMAC-verified, not a DoS vector.
- **`trust proxy`** via `app.getHttpAdapter().getInstance().set("trust proxy", 1)` (Express) — needed for correct client IPs behind a prod proxy; harmless locally.
- **Staff migration:** dev DB must be deduped first (the slice-2.5 test dupes) or the unique-index migration fails; the committed migration is just the index (prod-clean). Stop dev servers; kill stray jest workers on EPERM.
- **P2002→409** in `StaffService.create` covers all three Staff uniques (staffNo/email/phone), which previously 500'd.
- **e2e count:** 185 → +2 (cross-school rewrite replaces the old two-staff test 1:1; +1 dup-409 test) = ~187. Adjust the assertion in Task 3 docs if the exact count differs.
- **No new model beyond the Staff unique index; no business-logic change.**
```
