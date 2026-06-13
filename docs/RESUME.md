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
- **main** = Sprints 0 + 1 + 2 complete. Sprint 2 Attendance is merged (fast-forward) and browser-QA'd. HEAD `1bb3a83`.
- Sprint 2 browser QA (2026-06-13) found + fixed 1 high-sev UI↔API seam bug: overview attendance rate rendered "1.0%" instead of "100%" (API sends `rate` as a 0–1 fraction; web treated it as a 0–100 percentage → wrong label, threshold colors, bar width). Fix `1bb3a83`, verified live + web build green. Report: `.gstack/qa-reports/qa-report-attendance-2026-06-13.md` (gitignored).
- **198 tests green** (16 API unit + 66 API e2e + 116 UI), all 3 builds pass. Working tree clean. `sprint-2-attendance` branch can be deleted (merged).
- Security audit: `pnpm audit --prod` → 0 critical, 6 high (all transitive `tar` via bcrypt build toolchain, runtime-unreachable, unfixable upstream). CI gates on critical.

## What's built (by area)
- Auth: OTP request/verify, JWT, tenant middleware (verifies JWT), PermissionGuard, tokenVersion revocation.
- SIS: schools onboarding (create→proprietor grant+fresh token), academic years/terms, class levels, classes, subjects; students (+profile, photo upload w/ signed URLs), staff, parents/guardians, enrollment.
- Bulk import: BullMQ worker (tenant-scoped, row-level errors) + web CSV/XLSX UI (papaparse + exceljs).
- Attendance (Sprint 2): AttendanceRecord (tenant + RLS), roster/mark(batch upsert, last-write-wins, idempotencyKey)/student-history/summary; web `/attendance` tap-to-cycle grid (optimistic, debounced) + `/attendance/overview` heatmap. Hardened against cross-tenant IDOR.
- Web: `(app)` shell + sidebar (Dashboard, Students, Staff, Classes, Attendance, Settings), login, onboarding wizard.

## Next steps (in order)
1. **Branch the next sprint off main** (`git checkout main && git checkout -b <branch>`). Optionally delete the merged `sprint-2-attendance` branch.
2. **Sprint 2.5 (offline PWA attendance)** OR **Sprint 3 (Assessment & Grading)** — founder to pick. 2.5 = service-worker + IndexedDB write-queue feeding the existing idempotent `POST /v1/attendance/mark` (idempotencyKey already in the model). Sprint 3 = configurable assessment structure, score entry, principal release flow, the WAEC-style report-card PDF showpiece (see sprint-charters.md §Sprint 3 + PRD §4.5).
3. **Tech-debt follow-up:** `apps/web` has no test framework (UI tests live in `packages/ui` vitest). Consider bootstrapping vitest + @testing-library/react in `apps/web` so display-layer seam bugs (like the rate bug above) get caught by tests, not just live QA.

### Browser-QA playbook (reusable; learned this pass)
- Seed via API (no web enrollment screen): `POST /auth/otp/request {phone}` → OTP prints in api.log mock SMS → `POST /auth/otp/verify {phone,code}` → `POST /v1/schools` (use the returned **fresh token** thereafter) → `/v1/academic-years` (term `isCurrent:true`; roster resolves term by the `isCurrent` flag, NOT by date, so calendar drift is fine) → `/v1/class-levels` → `/v1/classes` → `/v1/students` ×3 → `/v1/enrollments` {studentId,classId,termId}.
- **gstack browse on this Windows box restarts the daemon between separate Bash calls, wiping localStorage** → do each interaction sequence in ONE bash call. Web stores auth in `localStorage` keys `mm.token` + `mm.user`; re-inject them at the start of each call (capture once after a real login), then `goto`.
- React controlled inputs: set value via the native setter + dispatch `input`+`change` (plain `fill`/`.value=` doesn't trigger React state). Set dependent date inputs one at a time with a wait between (batching otherwise drops one).
- `browse screenshot`/`snapshot -o` saves relative to the daemon's cwd (often `apps/web/.gstack/...`) — `find` it and copy into the repo, and `rm -rf apps/web/.gstack` after.

## How the work has been run
Orchestrator builds the tenancy/security-critical core inline (TDD); parallel subagents build disjoint modules/screens; orchestrator owns integration (barrels, app.module wiring) + verification + commits. Every commit triggers a background security-review hook — address its findings. Three independent safety nets used: automated tests, the security-review hook, and live browser QA (each catches a different bug class).

## Key learnings (also in agent memory)
- **Tenant IDOR rule:** validate any request-supplied entity id through a tenant-scoped model before write/return — especially `upsert` (middleware doesn't scope its where) and models without a `schoolId` (Enrollment, Guardian). Recurred 3×.
- Dependency policy: latest stable + `pnpm audit`; majors as a verified pass (test suite as guardrail), not blind bumps.
- Design: Bold Ink + Saffron, tokens in `packages/ui/tokens.ts` are the single source of truth.
