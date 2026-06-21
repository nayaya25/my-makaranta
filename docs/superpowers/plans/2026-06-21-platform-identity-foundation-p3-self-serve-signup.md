# Platform & Identity Foundation — P3: Self-Serve Signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A public **2-step self-serve signup** that creates a new school + its proprietor account on the new identity model — *About the School* (name, short-name→**slug with live availability**, country, type, website) → *About You* (name, gender, email, phone, password) — then sends the owner to their school's subdomain to log in and onboard.

**Architecture:** Additive on P1+P2 (merged to `dev`). A public `SignupModule` in the API transactionally creates `School` + `Person` (argon2 password) + `Membership` (proprietor) + `RoleAssignment` (the seeded `proprietor` preset). No auth on the public endpoints; throttled. The web app gets a public `/signup` wizard (served on apex/`app`) that checks slug availability live and, on success, links the owner to `https://<slug>.mymakaranta.com` to log in (no cross-origin token handoff).

**Tech Stack:** NestJS 10 (`@nestjs/throttler`), Prisma + PostgreSQL, P1 `PasswordService`/`IdentityService`, P2 `slug.ts`, Next.js 15. Depends on P1 (`Person/Membership/Role`, `proprietor` preset, `PasswordService`) + P2 (`validateSlug`, subdomains).

## Global Constraints

- Branch off the merged `dev` (P1+P2 present).
- Password policy + hashing: reuse P1 `PasswordService` (argon2id; min8/upper/lower/number/special). Generic errors.
- Slug rules: reuse P2 `validateSlug` + `RESERVED_SUBDOMAINS` (no duplication). Slug uniqueness via `School.slug @unique`.
- Signup creates on the NEW model only: `Person` + `Membership(proprietor)` + `RoleAssignment(proprietor preset)`. Do NOT create a legacy `User`. The proprietor logs in afterward via P1 `POST /auth/login` (password) on their subdomain.
- The whole creation is one Prisma `$transaction` — partial schools must never persist.
- Public endpoints are unauthenticated but **throttled** (reuse `@nestjs/throttler`, e.g. 5/min per IP for signup).
- Tests: local test DB, prefix `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`; argon2 tests run serially (`jest --runInBand`). Never commit that URL; `.superpowers/` is git-ignored.
- Email/phone verification is a **documented follow-up**, NOT in P3 (note it; rely on throttling + slug uniqueness for abuse resistance in this slice).

## File Structure

- `apps/api/src/modules/signup/signup.module.ts` · `signup.service.ts` (+ `.spec.ts`) · `signup.controller.ts` · `dto/signup.dto.ts` (create).
- `apps/api/src/app.module.ts` — register `SignupModule` (modify).
- `apps/web/src/app/signup/page.tsx` — 2-step wizard (create).
- `apps/web/src/lib/api.ts` — `checkSlug`, `signup` public helpers (modify).

---

### Task 1: Slug-availability endpoint

**Files:**
- Create: `apps/api/src/modules/signup/signup.module.ts`, `signup.service.ts`, `signup.controller.ts`, `dto/signup.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/signup/slug-available.spec.ts`

**Interfaces:**
- Consumes: P2 `validateSlug` (`apps/api/src/core/tenant/slug.ts`), Prisma `School`.
- Produces: `GET /v1/public/signup/slug-available?slug=<s>` (no auth, throttled) → `{ available: boolean; reason: string | null }`. `reason` is the `validateSlug` message when invalid, `"taken"` when a `School.slug` already exists, else `null` with `available: true`. `SignupService.checkSlug(slug): Promise<{available,reason}>`.

- [ ] **Step 1: Write the failing test** — `checkSlug("app")` → `{available:false, reason:/reserved/}`; `checkSlug("ab")` → invalid (too short); a freshly-created `School` slug → `{available:false, reason:"taken"}`; a valid unused slug → `{available:true, reason:null}`.

- [ ] **Step 2: Run to verify it fails** — `DATABASE_URL=... pnpm exec jest slug-available` → FAIL (module missing).

- [ ] **Step 3: Implement** `SignupService.checkSlug` (run `validateSlug` first; if it returns a message → `{available:false, reason:msg}`; else query `prisma.school.findUnique({where:{slug}})` → taken/available), the controller route (`@Throttle`), DTO (none needed for GET query), `SignupModule`, and register it in `app.module.ts`.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add apps/api/src/modules/signup apps/api/src/app.module.ts
git commit -m "feat(signup): public slug-availability endpoint (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Signup service + endpoint (transactional)

**Files:**
- Modify: `apps/api/src/modules/signup/signup.service.ts`, `signup.controller.ts`, `dto/signup.dto.ts`
- Test: `apps/api/src/modules/signup/signup.spec.ts`

**Interfaces:**
- Consumes: `PasswordService` (P1), `validateSlug` (P2), the seeded `proprietor` `Role` (P1, `schoolId=null, key="proprietor"`), Prisma.
- Produces: `POST /v1/public/signup` (no auth, throttled 5/min) body `SignupDto { schoolName; slug; country; type?; website?; firstName; lastName; gender; email; phone; password }` → `{ slug: string; schoolId: string }`. `SignupService.signup(dto)` does ONE `$transaction`: validate slug (else 400) + password policy (else 400) + slug-not-taken + email/phone-not-already-a-Person (else 409) → create `School` → create `Person` (argon2 hash) → create `Membership(status:"active")` → create `RoleAssignment` to the `proprietor` preset role.

- [ ] **Step 1: Write the failing test** — a valid `signup(dto)` creates exactly one School (with the slug), one Person (with a `passwordHash` ≠ plaintext, email/phone set), one Membership linked to both, and one RoleAssignment to the `proprietor` role; a duplicate slug → `BadRequestException`/409; an existing email → conflict; a weak password → 400; assert NO partial School row persists when a later step throws (wrap a forced failure or assert atomicity by counting Schools after a duplicate-email attempt).

```typescript
// apps/api/src/modules/signup/signup.spec.ts (skeleton — seed the proprietor preset via seedSystemRoles first)
import { seedSystemRoles } from "../../../prisma/seed-roles";
// beforeAll: await seedSystemRoles(prisma)
// it("creates school+owner+proprietor membership atomically") { ... }
// it("rejects taken slug / existing email / weak password") { ... }
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `signup()` (look up the `proprietor` role with `findFirstOrThrow({where:{schoolId:null,key:"proprietor"}})`; if missing, that's a deploy/seed error → 500 with a clear message), `SignupDto` (class-validator: `@IsString`, `@IsEmail`, `@MinLength`, etc.), and the throttled controller route.

- [ ] **Step 4: Run to verify it passes (serial), then commit**

Run: `DATABASE_URL=... pnpm exec jest --runInBand signup`

```bash
git add apps/api/src/modules/signup
git commit -m "feat(signup): transactional public signup endpoint (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web 2-step signup wizard

**Files:**
- Create: `apps/web/src/app/signup/page.tsx`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `GET /v1/public/signup/slug-available`, `POST /v1/public/signup`.
- Produces: a public `/signup` route — Step 1 *About the School* (name, **slug input with debounced live availability** via `checkSlug`, country select, type, website), Step 2 *About You* (first/last name, gender, email, phone, password with live policy hints), T&C checkbox → on submit calls `signup`; on success shows a confirmation with the school's URL `https://<slug>.mymakaranta.com` and a "Go to your school" button (links there to log in). Uses `@mymakaranta/ui` components + the existing brand styling (matches the login/onboarding two-panel look).

- [ ] **Step 1: Add `lib/api.ts` helpers** — `checkSlug(slug): Promise<{available;reason}>` and `signup(body): Promise<{slug;schoolId}>` (public, no auth header).

- [ ] **Step 2: Build the wizard** `apps/web/src/app/signup/page.tsx` — a client component with the two steps, debounced slug check (300ms) showing available/taken/invalid inline, live password-policy checklist, disabled Continue/Submit until valid, error display from the API. Reuse the branded two-panel layout used by `(auth)/login`/`onboarding`.

- [ ] **Step 3: Verify** — `pnpm --filter @mymakaranta/web exec tsc --noEmit` → exit 0; `pnpm --filter @mymakaranta/web exec next lint` → no errors (watch `react/no-unescaped-entities` in copy). Do NOT run `next build`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/signup apps/web/src/lib/api.ts
git commit -m "feat(web): public 2-step self-serve signup wizard (P3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Regression gate

**Files:** none (verification).

- [ ] **Step 1:** `DATABASE_URL=... pnpm --filter @mymakaranta/api exec prisma migrate reset --force` then `DATABASE_URL=... pnpm --filter @mymakaranta/api exec tsc --noEmit` (exit 0) and `DATABASE_URL=... pnpm --filter @mymakaranta/api exec jest --runInBand` (all pass).
- [ ] **Step 2:** `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `pnpm --filter @mymakaranta/web exec vitest run` + `pnpm --filter @mymakaranta/web exec next lint`.
- [ ] **Step 3: Commit** any fixups (`--allow-empty` if none).

---

## Self-Review

**Spec coverage (spec §4):** 2-step wizard (school + you) → Task 3 ✓; slug-with-availability → Tasks 1+3 ✓; creates School+slug+owner Person/Membership(proprietor)+preset → Task 2 ✓; lands the owner at their subdomain to log in → Task 3 success screen ✓. **Deferred (noted):** in-signup OTP email/phone verification — follow-up; throttling + slug uniqueness cover P3.

**Placeholder scan:** Task 2's test is a guided skeleton (seed presets, then assert atomic create + rejections) — the implementer writes real assertions; the reviewer enforces. Others are concrete.

**Type consistency:** `checkSlug`/`signup` shapes identical across Tasks 1-3; `SignupDto` field names match the web wizard's payload; `proprietor` role key matches P1's seeded preset.

**Follow-ups (tracked):** email/phone verification before activation; optional "reserve subdomain" rate-limit per IP/email; redirect-with-magic-link instead of manual subdomain login.
