# myMakaranta — Resume / Handoff

**For a fresh session.** Read this, then continue from "Next steps (in order)". Companion docs: `PRD-v1.md`, `System-Design-Document-v1.md`, `docs/DESIGN-SYSTEM.md`, `docs/superpowers/specs/2026-06-13-web-mvp-build-reconciliation-design.md` (the build contract — read it).

## What this is
Multi-tenant school-management platform for Nigerian secondary schools. Delivery = **responsive web + PWA** (native Expo deferred). Monorepo: pnpm + Turborepo.

## Stack & locked decisions
- **apps/api** NestJS 11 (Express 5) modular monolith · Prisma 5 · PostgreSQL · BullMQ + Redis.
- **apps/web** Next.js 15 + React 19 (App Router, PWA) — the authenticated app (all stakeholders, responsive).
- **apps/marketing** Next.js 15 static landing site.
- **packages/ui** in-house design system over Radix + Tailwind 3 + cva; Storybook 9. Design = "Bold Ink" base + "Saffron warmth" (see DESIGN-SYSTEM.md / memory).
- Providers (env-selected, never live in tests): Storage S3 / local-fs; Email Mailgun / log; SMS Termii / mock; Payments Paystack / mock.
- Multi-tenancy: `schoolId` + Prisma middleware (`TENANT_MODELS`) + PostgreSQL RLS (FORCE) + non-superuser `mymakaranta_app` role. Money = kobo integers. Permissions-as-primitive (`@RequirePermissions` + DB-resolved `PermissionGuard`). Auto-audit middleware. Phone-OTP→JWT with `tokenVersion` revocation.

## Local dev environment (IMPORTANT)
- **No Docker.** Postgres + Redis run natively. `apps/api/.env`: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/my_makaranta?schema=public`, `REDIS_URL=redis://localhost:6379`.
- **Port 4000 is reserved on this Windows machine** (WinNAT excluded range 3941–4040). API runs on **4080** (`apps/api/.env` PORT=4080); web points at it via `apps/web/.env.local` `NEXT_PUBLIC_API_BASE_URL=http://localhost:4080`.
- Tests need NODE_ENV=test (jest sets it) + Postgres running. e2e: `cd apps/api && NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json`. Unit: `pnpm --filter @mymakaranta/api exec jest`. UI: `pnpm --filter @mymakaranta/ui exec vitest run`. Builds: `pnpm build`.

## Current state
- **main** = Sprints 0 + 1 + 2 complete. **Sprint 2.5 (offline PWA attendance)** built + browser-QA'd on `sprint-2.5-offline-attendance` (ready to merge / merged).
- Sprint 2 browser QA (2026-06-13): fixed 1 high-sev seam bug — overview rate showed "1.0%" instead of "100%" (API `rate` is a 0–1 fraction; web treated it as 0–100). Fix `1bb3a83`.
- Sprint 2.5 (2026-06-14): offline-first attendance. New `apps/web/src/lib/offline/` layer — `idb`-backed mark `queue` (composite-key coalescing) + `roster-cache` + pure `overlay` + `syncer` (batch-by-(class,date) flush, backoff retry, online/offline listeners) + `useOfflineSync` hook; grid (`/attendance`) rewritten offline-first (every tap durably queued, optimistic UI, cache-fallback load + queued-mark overlay, offline pill + sync indicator). Replay-safe via the existing idempotent `(studentId,date)` upsert — **zero backend change**. Offline browser QA verified the full round trip (offline mark → no premature send → reconnect sync → server persisted) + cache-fallback render with API down. Spec/plan in `docs/superpowers/{specs,plans}/2026-06-14-*`.
- **apps/web now has a test framework** (vitest + @testing-library/react + fake-indexeddb): **18 web tests** (db/queue/roster-cache/overlay/syncer/hook). Total: 216 tests green (16 API unit + 66 API e2e + 116 UI + 18 web), all 3 builds pass.
- Security audit: `pnpm audit --prod` → 0 critical, 6 high (all transitive `tar` via bcrypt build toolchain, runtime-unreachable, unfixable upstream). CI gates on critical.
- **Open follow-ups (non-blocking):** (a) wrap `db.close()` in try/finally in `queue.ts`/`roster-cache.ts` (handle-leak on a rejected put/get; low impact); (b) Service Worker Background Sync for sync-while-closed (deferred — iOS Safari unsupported); (c) wrap the offline `Badge` pill in an `aria-live` region.

## What's built (by area)
- Auth: OTP request/verify, JWT, tenant middleware (verifies JWT), PermissionGuard, tokenVersion revocation.
- SIS: schools onboarding (create→proprietor grant+fresh token), academic years/terms, class levels, classes, subjects; students (+profile, photo upload w/ signed URLs), staff, parents/guardians, enrollment.
- Bulk import: BullMQ worker (tenant-scoped, row-level errors) + web CSV/XLSX UI (papaparse + exceljs).
- Attendance (Sprint 2): AttendanceRecord (tenant + RLS), roster/mark(batch upsert, last-write-wins, idempotencyKey)/student-history/summary; web `/attendance` tap-to-cycle grid + `/attendance/overview` heatmap. Hardened against cross-tenant IDOR.
- Offline attendance (Sprint 2.5): `apps/web/src/lib/offline/` — IndexedDB queue/cache + syncer + hook; grid is offline-first (durable queue, cache-fallback read, reconnect sync). Client-only; backend unchanged.
- Web: `(app)` shell + sidebar (Dashboard, Students, Staff, Classes, Attendance, Settings), login, onboarding wizard.

## Next steps (in order)
1. **Merge `sprint-2.5-offline-attendance` → main** once you're satisfied (`git checkout main && git merge sprint-2.5-offline-attendance --no-edit`). Then branch the next sprint. Old `sprint-2-attendance` branch can be deleted.
2. **Sprint 3 (Assessment & Grading)** — configurable assessment structure, score entry, principal release flow, the WAEC-style report-card PDF showpiece (see sprint-charters.md §Sprint 3 + PRD §4.5).
3. **Clear the Sprint 2.5 follow-ups** when convenient (see Current state): db.close try/finally, optional SW Background Sync, offline-pill aria-live.

### Browser-QA playbook (reusable; learned this pass)
- Seed via API (no web enrollment screen): `POST /auth/otp/request {phone}` → OTP prints in api.log mock SMS → `POST /auth/otp/verify {phone,code}` → `POST /v1/schools` (use the returned **fresh token** thereafter) → `/v1/academic-years` (term `isCurrent:true`; roster resolves term by the `isCurrent` flag, NOT by date, so calendar drift is fine) → `/v1/class-levels` → `/v1/classes` → `/v1/students` ×3 → `/v1/enrollments` {studentId,classId,termId}.
- **gstack browse on this Windows box restarts the daemon between separate Bash calls, wiping localStorage** → do each interaction sequence in ONE bash call. Web stores auth in `localStorage` keys `mm.token` + `mm.user`; re-inject them at the start of each call (capture once after a real login), then `goto`.
- React controlled inputs: set value via the native setter + dispatch `input`+`change` (plain `fill`/`.value=` doesn't trigger React state). Set dependent date inputs one at a time with a wait between (batching otherwise drops one).
- `browse screenshot`/`snapshot -o` saves relative to the daemon's cwd (often `apps/web/.gstack/...`) — `find` it and copy into the repo, and `rm -rf apps/web/.gstack` after.
- **`next build` poisons `next dev`'s `.next`:** running `pnpm --filter web build` while/before `next dev` uses the same `.next` makes the dev server serve HTML referencing chunks that 404 → blank white pages app-wide. Fix: stop dev, `rm -rf apps/web/.next`, restart `next dev`. During QA, stop the web dev server before any production `build`.
- `browse js` does NOT await promises (async IIFEs return undefined) — can't read IndexedDB directly; use the UI's own indicators (e.g. the sync `pendingCount`) as the observable proxy. To emulate offline without a network toggle: `Object.defineProperty(navigator,'onLine',{value:false,configurable:true})` + `dispatchEvent(new Event('offline'))` (and `'online'` to restore); to test real fetch failure, kill the API process (taskkill the :4080 PID).

## How the work has been run
Orchestrator builds the tenancy/security-critical core inline (TDD); parallel subagents build disjoint modules/screens; orchestrator owns integration (barrels, app.module wiring) + verification + commits. Every commit triggers a background security-review hook — address its findings. Three independent safety nets used: automated tests, the security-review hook, and live browser QA (each catches a different bug class).

## Key learnings (also in agent memory)
- **Tenant IDOR rule:** validate any request-supplied entity id through a tenant-scoped model before write/return — especially `upsert` (middleware doesn't scope its where) and models without a `schoolId` (Enrollment, Guardian). Recurred 3×.
- Dependency policy: latest stable + `pnpm audit`; majors as a verified pass (test suite as guardrail), not blind bumps.
- Design: Bold Ink + Saffron, tokens in `packages/ui/tokens.ts` are the single source of truth.
