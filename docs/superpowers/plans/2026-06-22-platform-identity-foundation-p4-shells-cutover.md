# Platform & Identity Foundation — P4: Shells, Student Login & Auth Cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Flip the live auth path onto the P1 `Person/Membership` model, enable **student login**, route each user to a **role-adaptive shell** (Staff / Parent / Student), and add a **context switch** for multi-role people — all without forcing anyone to re-login.

**Architecture:** The cutover is a *read-path flip*, not a data migration: OTP verify now resolves a `Person` and issues the P1-style JWT (`{sub,mbr,sch,roles,perms,tv}`), with a **fallback to the legacy JWT** when no Person/Membership exists yet (edge cases). The web routes shells from a new `GET /v1/me` context (membership profile flags + roles) instead of legacy `identityType`. A staff endpoint provisions a student login (Person + Membership + password + linked `StudentProfile`). The Student shell is scaffolded (real "my profile"; the rest are stubs filled by later academic workstreams).

**Tech Stack:** NestJS 10, Prisma, P1 `IdentityService`/`PasswordService`, Next.js 15, `@mymakaranta/ui`. Depends on P1+P2+P3 (on this branch).

## Cutover decisions (locked, per "decisions inline")

- **D1 — Flip issuance, keep both readers.** OTP verify + password login both issue the Person JWT. The JWT strategy + `PermissionGuard` already accept BOTH shapes (P1), so in-flight legacy tokens keep working until they expire.
- **D2 — No forced logout.** Do NOT bump `tokenVersion` globally. Old sessions expire naturally; next login issues the new shape.
- **D3 — Keep legacy columns.** `User.identityType`/`identityId` stay in the schema and DB. New code paths stop *reading* them; a `DROP` migration is a **post-P4 cleanup** once telemetry shows no legacy-shape tokens in use. Bounds rollback risk.
- **D4 — Route shells by profile, not role.** A membership with a `staffProfile` → Staff; with `guardianOf[]` and no staffProfile → Parent; with a `studentProfile` → Student. (Students need no permission role; the student portal reads own-data endpoints.) `GET /v1/me` returns these flags.
- **D5 — Fallback everywhere.** If `GET /v1/me` finds no membership (legacy-only session), fall back to legacy `identityType` for routing so nothing breaks mid-transition.

## File Structure

- `apps/api/src/core/auth/auth.service.ts` — `verifyOtp` issues Person JWT w/ fallback (modify).
- `apps/api/src/core/auth/me.controller.ts` (+ `.spec.ts`) — `GET /v1/me` (create).
- `apps/api/src/core/identity/identity.service.ts` — `getMeContext(personId, schoolId)` (modify).
- `apps/api/src/modules/sis/students.controller.ts` + `students.service.ts` (+ spec) — `POST /v1/students/:id/login` (modify).
- `apps/web/src/lib/session.ts` / `lib/api.ts` — fetch + cache `/v1/me`; `getMe()` (modify).
- `apps/web/src/app/(app)/layout.tsx` — route shell + context switch by `/v1/me` flags, legacy fallback (modify).
- `apps/web/src/app/(student)/layout.tsx` + `(student)/page.tsx` — Student shell scaffold (create).

---

### Task 1: OTP verify issues a Person JWT (with legacy fallback)

**Files:** Modify `apps/api/src/core/auth/auth.service.ts`; Test `apps/api/src/core/auth/otp-cutover.spec.ts`.

**Interfaces:**
- Consumes: P1 `IdentityService.resolvePerson`/`deriveAuthz`.
- Produces: `verifyOtp` resolves the `Person` for the verified phone/email **in the relevant school**; if a `Membership` exists → issue `{sub,mbr,sch,roles,perms,tv}` (same as `loginWithPassword`); else → issue the existing legacy JWT unchanged (fallback). No signature change to the public `verifyOtp` contract.

- [ ] **Step 1: Write the failing test** — given a verified OTP for a phone that maps to a Person+Membership, the returned token decodes to `{ sub: personId, mbr, sch, roles, perms }`; given a phone with NO Person/Membership (legacy-only), the token decodes to the legacy shape (has `identityType`). Use the same JwtService stub style as `password-login.spec.ts`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — after OTP success, call `identity.resolvePerson(schoolId, phoneOrEmail)`; branch on result. Keep the legacy path byte-for-byte for the fallback. Reuse `deriveAuthz`.
- [ ] **Step 4: Run (serial) + existing auth specs, then commit** `feat(auth): OTP verify issues Person JWT with legacy fallback (P4)`.

---

### Task 2: `GET /v1/me` context endpoint

**Files:** Create `apps/api/src/core/auth/me.controller.ts`, `me.controller.spec.ts`; Modify `apps/api/src/core/identity/identity.service.ts`.

**Interfaces:**
- Produces: `GET /v1/me` (auth required) → `{ personId, activeMembershipId, schoolId, roles: string[], perms: string[], profile: { isStaff: boolean; isParent: boolean; isStudent: boolean }, person: { firstName, lastName }, memberships: Array<{ id, schoolId, schoolName, roles: string[], isStaff, isParent, isStudent }> }`. Derived from the JWT's `personId`/`mbr`. **Fallback:** if the token is legacy-shape (no `personId`), return `{ legacy: true, identityType }` so the web can route the old way. `IdentityService.getMeContext(personId, activeMembershipId)`.

- [ ] **Step 1: Write the failing test** — for a person with a staff membership → `profile.isStaff true`; with only `guardianOf` → `isParent true`; with `studentProfile` → `isStudent true`; multi-membership returns all in `memberships`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `getMeContext` (load membership + `staffProfile`/`studentProfile`/`guardianOf` + roles; compute flags) and the controller (read `request.user.personId`/`mbr`; legacy fallback when absent).
- [ ] **Step 4: Run + commit** `feat(auth): GET /v1/me identity context for shell routing (P4)`.

---

### Task 3: Student login provisioning

**Files:** Modify `apps/api/src/modules/sis/students.controller.ts`, `students.service.ts`; Test `students-login.spec.ts`.

**Interfaces:**
- Consumes: `PasswordService`, `slugify`-free; existing `StudentProfile` (P1) with `studentId`.
- Produces: `POST /v1/students/:id/login` (perm `students.manage`) → ensures the `StudentProfile` has a `Person`+`Membership(status:"active")` and a password: generates a temp password (returned ONCE), sets `Person.passwordHash`, links `StudentProfile.membershipId`. Returns `{ studentId, tempPassword }`. Idempotent-ish: if a login already exists, regenerates the temp password (a reset). Tenant-scoped (the student must belong to the caller's school).

- [ ] **Step 1: Write the failing test** — calling provisioning on a `StudentProfile` creates a Person + active Membership + links `membershipId` + sets a hash (≠ returned tempPassword), and the returned `studentId` matches; a second call resets the password (new hash) without duplicating the membership; a student from another school → 404/forbidden.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — generate a readable temp password that satisfies the policy (e.g. 3 words + digit + symbol, or random meeting the rule); hash it; upsert Person/Membership in a transaction; scope by `TenantContext`/`schoolId`.
- [ ] **Step 4: Run (serial) + commit** `feat(students): provision student login (Student ID + temp password) (P4)`.

---

### Task 4: Web shell routing + Student shell + context switch

**Files:** Modify `apps/web/src/lib/api.ts` (`getMe`), `apps/web/src/app/(app)/layout.tsx`; Create `apps/web/src/app/(student)/layout.tsx`, `(student)/page.tsx`.

**Interfaces:**
- Consumes: `GET /v1/me` (Task 2).
- Produces: on load, the app fetches `/v1/me`; routing: `isStaff` → existing Staff shell; `isStudent` (and not staff) → **Student shell**; `isParent` (and not staff/student) → Parent area. Multi-profile people get a **context switcher** (Staff ↔ Parent) in the top bar that calls `POST /v1/auth/context` (P1) and re-routes. **Fallback:** if `/v1/me` returns `legacy:true`, route by `identityType` exactly as today (no regression). The **Student shell** is a scaffold: dark-teal sidebar styled like the staff shell, nav = My Progress (stub) · Timetable (stub) · Assignments (stub) · Materials (stub) · My Profile (real: shows name + Student ID), branded; clearly-labeled "Coming soon" stubs.

- [ ] **Step 1:** add `getMe()` to `lib/api.ts` returning the Task 2 shape (with the `legacy` variant typed).
- [ ] **Step 2:** build `(student)` shell layout + home (reuse the `(app)` sidebar visual language + `@mymakaranta/ui`; stubs are obvious, not fake data).
- [ ] **Step 3:** in `(app)/layout.tsx`, replace the `user.identityType === "PARENT"` branch with `/v1/me`-driven routing (staff/parent), keep legacy fallback; add the context switcher for multi-profile.
- [ ] **Step 4: Verify** `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `next lint` (no errors; escape entities). Do NOT `next build`.
- [ ] **Step 5: Commit** `feat(web): role-adaptive shell routing + Student shell + context switch (P4)`.

---

### Task 5: Regression gate

- [ ] `DATABASE_URL=... pnpm --filter @mymakaranta/api exec prisma migrate reset --force` → `tsc --noEmit` (0) → `jest --runInBand` (all pass; existing OTP/auth/login specs included — proves the cutover didn't regress).
- [ ] `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `vitest run` + `next lint`.
- [ ] Commit (`--allow-empty` if none): `test: P4 regression gate green (P4)`.

---

## Self-Review

**Spec coverage (spec §5 shells + §8 P4):** 3 role-adaptive shells (Staff exists; Parent fallback; Student scaffold) → Task 4 ✓; student login enabled → Tasks 1/3 ✓; context switch → Task 4 ✓; cutover off `identityType` (read path) → Tasks 1/2/4 with fallback ✓. Legacy column DROP explicitly deferred (D3).

**Placeholder scan:** Student shell stubs are intentional + clearly labeled "Coming soon" (spec §5 says student shell is stubs in the foundation) — not placeholder *code*; each is a real component rendering a coming-soon state. Test skeletons in Tasks 1-3 are filled by the implementer; reviewer enforces.

**Type consistency:** `/v1/me` shape defined in Task 2, consumed in Task 4; JWT `{sub,mbr,sch,roles,perms,tv}` from P1 reused in Task 1; `POST /v1/auth/context` is the P1 endpoint.

**Risk notes:** Task 1 is the only change to a live auth path — its test asserts BOTH the new shape and the legacy fallback; the regression gate (Task 5) re-runs all existing auth specs. No forced logout (D2). Legacy columns retained (D3).

**Follow-ups (post-P4 cleanup):** drop `User.identityType`/`identityId` after telemetry confirms no legacy tokens; fill Student-shell stubs in the Academic workstream; student self-serve password reset.
