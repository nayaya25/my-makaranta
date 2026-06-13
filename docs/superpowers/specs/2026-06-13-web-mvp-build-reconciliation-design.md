# myMakaranta — Web MVP Build Reconciliation (Design Spec)

**Date:** 2026-06-13
**Status:** APPROVED 2026-06-13 — optimistic-first web attendance (offline PWA layer = fast-follow Sprint 2.5)
**Companions:** `PRD-v1.md`, `System-Design-Document-v1.md`, `plans/2026-05-01-sprint-0-foundation.md`, `plans/2026-05-01-sprint-charters.md`

**Purpose:** The PRD and SDD assume a Next.js web app + Expo mobile apps on Fly.io/R2/Postmark. The founder has chosen a different delivery shape for the first build. This document records every delta so the existing plans can be executed without re-deciding anything mid-build.

---

## 1. Decisions locked in this session

| # | Decision | Source |
|---|---|---|
| D1 | **All five stakeholder experiences ship as responsive web** (Next.js). Teacher (attendance, scoring) and parent (fee payment, results) flows are built as web, not Expo. Native Expo apps are deferred to a later milestone. | Founder |
| D2 | **The public marketing site (mymakaranta.com) is in scope** for this build. | Founder |
| D3 | **Hosting is split:** Next.js apps → Vercel; NestJS API + BullMQ workers + Meilisearch + Postgres + Redis → a container host (Railway / Render / Fly.io — final pick at deploy time). | Founder |
| D4 | **Build cadence:** sprint-by-sprint with a founder checkpoint at each sprint boundary. Within a sprint, independent tasks run as parallel subagents in isolated git worktrees under `.claude/worktrees/` (gitignored). | Founder |
| D5 | **Storage = AWS S3** (overrides SDD's Cloudflare R2). Local dev via MinIO (S3-compatible). | Founder |
| D6 | **Email = Mailgun** (overrides SDD's Postmark/Resend). | Founder |
| D7 | **SMS = Termii** (matches SDD). | Founder |
| D8 | **DNS = Cloudflare** (already owned) pointing at Vercel (apps) and the container host (api subdomain). | Founder |

## 2. What is explicitly unchanged from the PRD/SDD

Monorepo (pnpm + Turborepo); NestJS modular monolith; PostgreSQL + Prisma; row-level multi-tenancy with `schoolId` + Prisma middleware + PostgreSQL RLS; phone-first OTP auth + JWT; permissions-as-primitive (not roles); money as **kobo integers** (never floats); audit log on every mutation; in-house Tailwind + Radix component library (no shadcn/ui); country/currency/locale configurable from day one; TDD throughout; Paystack-primary payments.

## 3. The one new architecture question: web offline attendance

The PRD's offline engine (WatermelonDB) is React-Native-only. On web, the equivalent is a **service worker + IndexedDB write queue** feeding the same idempotent delta-sync API. This is the most complex single piece of the web build.

**Recommendation (this spec assumes it unless overruled):** For the web MVP, teacher attendance uses **optimistic UI + online sync with idempotency keys** (instant tile feedback, background POST, retry-on-failure toast). True offline-survives-refresh resilience (service worker + IndexedDB queue) is a fast-follow enhancement (call it Sprint 2.5), not a Sprint 2 blocker. Rationale: it de-risks the schedule, the API contract is identical either way, and the PWA layer can be added without touching the backend or the UI's data flow.

## 4. Backend provider abstractions (so D5/D6/D7 are swap-in, not rewrites)

- `StorageService` interface → `S3StorageAdapter` (prod) / `MinioStorageAdapter` (local). Signed URLs, TTL ≤ 60 min.
- `EmailService` interface → `MailgunEmailAdapter` (prod) / `LogEmailAdapter` (local/test).
- `SmsService` interface → `TermiiSmsAdapter` (prod) / `MockSmsAdapter` (local/test, exposes code to tests).
- `PaymentProviderService` interface → `PaystackAdapter` (prod) / `MockPaystackAdapter` (test). Flutterwave slots in later.

All adapters are selected by env var. Tests never hit a live provider.

## 5. Monorepo app layout (web-only clients)

```
apps/
  api/          NestJS modular monolith (REST + WS + workers)
  web/          Authenticated app — app.mymakaranta.com (all 5 stakeholders, responsive)
  marketing/    Public site — mymakaranta.com (Lighthouse ≥ 95, separate app for perf isolation)
  verify/       Public result verification — verify.mymakaranta.com (can start as a route in marketing)
packages/
  ui/           Design system: tokens.ts + ~27 in-house components (web)
  types/        Shared TS types / API contracts
  config/       Shared eslint / tsconfig / prettier
```

`web` serves every authenticated stakeholder via route groups and permission-gated navigation — proprietor, principal, bursar, registrar get dense desktop layouts; teacher and parent get mobile-web-optimized, thumb-zone layouts within the same app.

## 6. Sprint sequence (adapted to web-only delivery)

| Sprint | Theme | Web-delivery notes vs. charter |
|---|---|---|
| 0 — Foundation | Monorepo, tokens, ~27 components, auth, multi-tenancy, CI | + `marketing` app scaffold; S3/Mailgun/Termii adapters; MinIO in docker-compose |
| 1 — Backend Core + SIS | School onboarding, bulk import, students/staff/classes CRUD | Photo upload → S3. Otherwise as charter |
| 2 — Attendance | Teacher attendance grid + principal live heatmap | **Web** responsive grid, optimistic UI + online sync (no WatermelonDB). Offline PWA = Sprint 2.5 |
| 3 — Assessment & Grading | Score entry, release flow, report-card PDF + reveal | Score entry = responsive web; reveal = Framer Motion (web only) |
| 4 — Fees & Finance | Paystack, parent payment, bursar reconciliation | Parent payment = web Paystack inline/redirect; receipt PDF → S3 |
| 5 — Communication | Announcements, messaging, SMS (Termii) + email (Mailgun) | In-app + SMS + email channels |
| 6 — Reporting & Proprietor Dashboard | Proprietor "selling room" + principal dashboard | As charter; Recharts; dark mode default for proprietor |
| 7 — Parent + lean Student web + Marketing polish | Multi-child parent web home, results reveal, lean student web, marketing site content | Parent/student delivered as web; marketing site finalized |

## 7. Out of scope for this build (unchanged from PRD)

Native Expo apps; Admissions; Curriculum/lesson notes; Timetable builder; Behaviour; Library; Health; Transport; Hostel; HR/Payroll; WhatsApp Business API; USSD; multi-school comparative deep-dive; AI features; alumni.

## 8. Multi-agent execution model

- `git init` in the project root (existing PRD/SDD/plans are preserved and committed).
- `.claude/worktrees/` is gitignored; each parallel task gets an isolated worktree branched off the sprint branch, merged back after its tests pass.
- Within a sprint, the orchestrator decomposes tasks, dispatches independent ones to parallel subagents (subagent-driven-development), and serializes dependent ones.
- Every task is TDD: failing test → implementation → green → commit (Conventional Commits).
- Founder checkpoint at each sprint boundary before the next begins.

## 9. Definition of done (per the founder's brief)

Functional, no known bugs, tests capture features properly (behavioral coverage, not just smoke), simple/concise code with minimal comments, every monetary path correct to the kobo, cross-tenant isolation proven by integration tests on every PR.
