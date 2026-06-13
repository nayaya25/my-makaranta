# myMakaranta MVP — Sprint Charters (Sprints 1–7)

**Purpose:** One-page charter per sprint. Each charter is the brief for a future detailed implementation plan, written by the writing-plans skill closer to that sprint's start so it reflects real learnings from earlier sprints.

**Reading order:** Sprint 0 (Foundation) is in `2026-05-01-sprint-0-foundation.md`. The charters below depend on that sprint being complete.

**Schedule overlap:** Sprints overlap. Two engineers + one designer + one mobile engineer (hired by sprint 2) means parallel tracks. The window column shows when a sprint is *active*; tail-end QA can extend into the next sprint's start.

| Sprint | Window | Active engineers | Active designer days | Producer of working software |
|---|---|---|---|---|
| 0 — Foundation | Wks 1–3 | 2 | 15 | Deployable skeleton, tokens, ~27 components, auth, multi-tenancy |
| 1 — Backend Core + SIS | Wks 3–6 | 2 | 10 | School onboarding, bulk import, students/staff/classes CRUD on web |
| 2 — Attendance | Wks 5–8 | 2 | 8 | Teacher mobile attendance offline-first; principal live view |
| 3 — Assessment & Grading | Wks 7–11 | 3 | 15 | Score entry, principal release flow, designed report card PDF |
| 4 — Fees & Finance | Wks 8–12 | 2 | 10 | Paystack, parent payment, bursar reconciliation |
| 5 — Communication | Wks 10–13 | 2 | 6 | Announcements, messaging, SMS via Termii |
| 6 — Reporting & Proprietor Dashboard | Wks 11–14 | 2 | 12 | Proprietor "selling room" + principal dashboard |
| 7 — Parent Mobile + Lean Student | Wks 12–16 | 2 | 14 | Multi-child parent app, fee UX, results reveal, lean student app |

**Total designer days across sprints:** ~90 (roughly 0.5 FTE × 16 weeks for the founding designer, with peak load in Sprints 3, 6, 7).

**Total engineer-weeks:** ~50 (2 engineers × 16 weeks, plus mobile engineer joining Sprint 2). Tight. Achievable only if Sprint 0 lands clean and the component library does not require rework.

---

## Sprint 1 — Backend Core + SIS

**Window:** Weeks 3–6 (begins immediately after Sprint 0 wraps).
**Theme:** *Get a real school onto the platform without crying.*

**Goal:** A proprietor or registrar can onboard their school end-to-end: create the school record, configure terms and class levels, bulk-import 500 students and 30 staff from an Excel file with validation and error recovery, and view/edit any student or staff record on the web app. By end of sprint, every pilot school's existing data lives in our database with no manual back-office work.

**In scope:**
- School onboarding wizard (web): basic info → currency/country → academic year + terms → class levels → first admin user
- Bulk import from `.xlsx` and `.csv` for Students, Staff, Parents, Guardians (via SheetJS), with row-level error display and "fix-and-retry" UX
- Student profile page (the most-visited screen — must be exceptional)
- Staff list + profile
- Classes list + class-level admin
- Parent ↔ Student linkage UI (the Guardian model)
- Photo upload (Cloudflare R2 or S3; auto-square-crop)
- Audit log for every mutation (who, when, what)
- Permission seed: `students.view`, `students.create`, `students.import`, `staff.view`, `staff.manage`

**Explicitly out of scope:**
- Admissions module (Phase 2)
- Subject assignment to teachers (in Sprint 3)
- Curriculum / lesson notes (Phase 2)
- Public school profile page

**Dependencies on Sprint 0:**
- Auth, tenancy, RLS, Prisma SIS schema, ~27 components, web shell.

**Key technical decisions:**
- **Bulk import architecture:** Parse client-side (SheetJS) → POST batched JSON to `POST /v1/imports/students` (background BullMQ job) → poll status → render row-level errors with edit-in-place. Avoids the "select 50MB file, wait, fail" flow.
- **Photo storage:** Cloudflare R2 over AWS S3. Cheaper egress (Lagos schools download photos repeatedly), Africa-friendlier latency.
- **Audit log:** A single `AuditLog` table with `actor`, `action`, `resourceType`, `resourceId`, `before`, `after`, `at`. Indexed on `(schoolId, at)`. Written via a Prisma extension.

**Exit criteria:**
- Pilot school A's Excel sheet imports cleanly to Postgres (~500 students, 30 staff) in < 60 seconds.
- Student profile page renders for a JSS2 student with photo, demographics, parent contacts, and (empty) tabs for Academic / Attendance / Fees.
- Audit log records all writes; viewable by the proprietor.
- Cross-tenant isolation test still green (regression).

**Risks:**
- Real Excel files are *messier* than expected (merged cells, inconsistent column ordering, mixed-case states of origin). Mitigation: a flexible import mapping UI in v1.1 if v1.0 schema-strict import causes too much friction.
- Photo upload on slow Nigerian connections times out. Mitigation: progressive upload + resume (TUS protocol via tus-js-client) deferred to Sprint 7.

---

## Sprint 2 — Attendance

**Window:** Weeks 5–8. Begins as Sprint 1 enters QA.
**Theme:** *The first daily-use teacher feature. Make it inhumanly fast.*

**Goal:** A form teacher in JSS2A opens the teacher mobile app at 7:55 AM on a Monday with no internet (school WiFi is down, mobile data is off). She marks attendance for 40 students in under 60 seconds via a tap-grid. By the time she leaves the staff room at 8:30 AM and reconnects, every record has synced silently. The principal sees a real-time class-by-class attendance heatmap on the web. By end of sprint, attendance data flows reliably under intermittent connectivity for 3 pilot schools.

**In scope:**
- Teacher mobile app: today view (today's classes, attendance prompt), class roster grid, tap-to-cycle status (Present → Absent → Late → Excused), per-status reason picker on long-press
- Offline-first sync via WatermelonDB (local SQLite) with delta-sync to backend
- Backend: `AttendanceRecord` writes with idempotency keys, batch sync endpoint, conflict policy (last-write-wins with audit trail)
- Web: principal class-attendance heatmap, drill-down to per-student history, anomaly highlight (3+ absences in last 7 days)
- Teacher onboarding flow: install Expo APK, authenticate via SMS OTP (re-uses Sprint 0 auth), select school + classes
- Permission: `attendance.mark` (scoped to teacher's classes), `attendance.view`, `attendance.audit`

**Explicitly out of scope:**
- Per-period attendance (Phase 2 — daily-only in MVP)
- Auto-SMS to parents on absence (Sprint 5 ties into Communication)
- Biometric attendance (Phase 3)

**Dependencies:**
- Sprint 0 (mobile scaffold, design tokens), Sprint 1 (Student, Class, Enrollment, SubjectAssignment).

**Key technical decisions:**
- **WatermelonDB over RxDB:** WatermelonDB is faster on low-end Android, batches reads/writes, reactive observables. Final sign-off after a 1-day spike on a Tecno Spark.
- **Sync protocol:** Pull-then-push delta sync. Client tracks `lastPulledAt`. On reconnect, GET `/v1/sync/attendance?since=<ts>`, apply server changes, POST `/v1/sync/attendance` with local mutations. Idempotency via client-generated UUIDs.
- **Conflict policy:** `(studentId, date)` is unique. If two devices write conflicting statuses, the most recent `recordedAt` wins; the loser is preserved in the audit log.

**Exit criteria:**
- Teacher marks 40-student class attendance in ≤ 60s on a Tecno Spark with WiFi *off*.
- App reconnects after 30 minutes offline, syncs without user action, shows no spinners.
- Principal heatmap on web shows real-time pulse (within 5 seconds of teacher save online; within 2 minutes after teacher reconnects).
- Cross-device test: two teachers marking the same student produces one canonical record + audit trail of the rejected write.

**Risks:**
- WatermelonDB's schema migrations across mobile updates are non-trivial. Mitigation: lock the schema for sprint 2; defer iteration to a designated migration sprint in Phase 2.
- Tecno-class device performance under 1000+ pending sync rows. Mitigation: explicit performance budget (sync < 2s for 1000 rows), tested weekly on real device.

---

## Sprint 3 — Assessment & Grading

**Window:** Weeks 7–11 (overlaps Sprint 2 tail).
**Theme:** *The hardest module. Also the showpiece. Get it right or the wedge collapses.*

**Goal:** A subject teacher records CA1, CA2, CA3, mid-term, and exam scores for 40 students across 9 subjects, on mobile, with the school's configured weights. The form teacher reviews her class. The HOD reviews her department. The principal opens the release dashboard, sees flagged anomalies (scores > 2σ from the term's mean), batch-approves, and clicks Release. Every parent receives an in-app notification + SMS that results are available; every student opens the parent app to a beautifully designed report-card reveal. By end of sprint, **the pilot schools have completed an end-of-term release flow without paper.**

**In scope:**
- Configurable assessment structure per school (`AssessmentType` records with weights and max scores)
- Score entry on mobile (teacher) + web (form teacher)
- Auto-calculation: total score, position-in-class, grade boundary (school-configurable)
- Anomaly detection (z-score > 2, score > max, score < min)
- Form teacher class-master sheet (review pre-release)
- HOD subject-master sheet (drift detection across parallel classes)
- Principal release workflow (select term → review → batch-approve → release)
- Report card PDF generation (designed showpiece — Newsreader serif, school logo, signed by principal, position, grades, term summary, attendance summary, principal's remark)
- In-app report card reveal animation (Framer Motion on web, Reanimated 3 on mobile)
- Public-verification page (read-only, tokenized URL — `verify.mymakaranta.com/<token>`)
- Permissions: `results.record`, `results.review`, `results.release`, `results.view.own`

**Explicitly out of scope:**
- Skill-based / descriptive reporting (primary-school feature, Phase 2)
- Per-term performance trend across multiple terms (Sprint 6 — first term has no trend)
- Multi-school comparative analytics (Phase 2)

**Dependencies:**
- Sprint 0, Sprint 1 (Student, Class, Subject, SubjectAssignment, Term).

**Key technical decisions:**
- **Score immutability:** Once principal releases, scores are immutable. Edits require a "Result Correction" workflow with proprietor sign-off + audit log entry. Enforced server-side regardless of client state.
- **Position calculation:** Calculated server-side at release time, frozen into `ResultSheet` rows. Never recalculated on read.
- **PDF generation:** `@react-pdf/renderer` for server-side PDF. Generated on release; stored in R2; served via signed URLs.
- **Reveal animation:** Choreographed in Framer Motion: cover scales in (560ms hero) → photo + name fade (240ms) → subjects stagger (each 80ms) → position chip pop (240ms with overshoot). Tested on Tecno Spark with 60fps target on parent app.

**Exit criteria:**
- A complete pilot-school term-end release runs end-to-end in < 4 hours of total staff time (vs. ~4 days on paper).
- Report card PDF passes design review by founding designer (compared 1:1 to Figma).
- Reveal animation hits 60fps on Tecno Spark; degrades gracefully (cross-fade only) on devices that report low-end.
- Public verification URL renders for any released result; QR code on the PDF works.

**Risks:**
- Grade boundary configuration is school-specific (some use 9-1, some use A1-F9, some use percentage bands). Mitigation: make `GradeBoundary` a configurable per-school table, ship 3 templates (WAEC, NECO, custom).
- WAEC-format report card layout has subtle conventions (teacher's signature, principal's stamp area, conduct ratings). Mitigation: source 5 real WAEC report cards from pilot schools for design reference before sprint start.

---

## Sprint 4 — Fees & Finance

**Window:** Weeks 8–12 (overlaps Sprint 3).
**Theme:** *The willingness-to-pay leverage. The bursar's love. The proprietor's confidence.*

**Goal:** A proprietor configures fee structure for SS1 (₦150,000 tuition + ₦25,000 books + optional ₦80,000 boarding). Invoices auto-generate per student per term. A parent opens the parent app, sees their child's outstanding balance, taps "Pay," completes Paystack checkout, and receives an animated receipt within 3 seconds. The bursar opens the reconciliation dashboard on Friday afternoon and sees "₦4,328,500 collected this week, all reconciled, 0 unmatched." By end of sprint, the pilot schools collect actual fee revenue through the platform.

**In scope:**
- Fee structure builder (per class level, per term)
- Auto-invoice on term start (BullMQ scheduled job)
- Paystack integration (initialize transaction, verify webhook, handle async)
- Bank transfer reconciliation: CSV upload from bank statement → fuzzy match against expected fees → confirm
- Discount + scholarship workflow (with required reason, principal approval)
- Receipt PDF generation
- Proprietor real-time fee position (per class, per term, per student status)
- Bursar reconciliation panel
- Parent payment UX (Cash-App-class — animated success, receipt, share)
- Permissions: `fees.view`, `fees.manage`, `fees.pay.own`

**Explicitly out of scope:**
- Flutterwave fallback (Phase 2)
- Direct debit / installments (Phase 2)
- USSD payment (Phase 2)

**Dependencies:**
- Sprint 0, Sprint 1 (Student, Term).

**Key technical decisions:**
- **Money in kobo:** Every monetary value in the database is `Int` representing kobo (smallest currency unit). Display layer converts. No floats. Ever.
- **Paystack webhook security:** Verify HMAC SHA512 signature on every webhook. Idempotency via `reference` deduplication. Settled-vs-pending state tracked explicitly.
- **Reconciliation UX:** Three columns — Unmatched, Suggested Match (high-confidence fuzzy), Confirmed. Drag-and-drop or one-click accept. Bursar's panel.

**Exit criteria:**
- 50 test transactions through Paystack in test mode; webhook reconciliation 100% accurate.
- Bank statement CSV with 30 mixed transactions reconciles 25+ automatically; remaining 5 resolvable via UI.
- Parent payment flow lands in under 90 seconds end-to-end (dashboard tap → Paystack → receipt).
- Proprietor sees live fee position update within 5 seconds of webhook.

**Risks:**
- Paystack regulatory or API changes mid-sprint. Mitigation: payment provider is abstracted behind `PaymentProviderService`; Flutterwave can be slotted in later.
- Reconciliation accuracy depends on parent-supplied reference text. Mitigation: at fee-structure creation, generate a unique reference per student per term and instruct parents to use it; fuzzy match on name + amount as fallback.

---

## Sprint 5 — Communication

**Window:** Weeks 10–13 (overlaps Sprint 3 tail and Sprint 4).
**Theme:** *Replace the WhatsApp scramble. Without becoming WhatsApp.*

**Goal:** A principal opens the announcement composer on Friday morning, writes "School resumes Tuesday after the public holiday," targets all parents and all SS3 students, schedules send for 6 PM, and signs off. At 6:01 PM, every parent receives both an in-app push (parent app) and an SMS via Termii. The principal sees delivery counts: 487 of 510 SMS delivered, 23 numbers invalid. A teacher opens her form-class roster, taps a parent, types a message asking about an attendance pattern — the parent receives the message in the parent app under "School-Verified Conversations" and replies. By end of sprint, school↔parent and school↔staff communication moves entirely off personal WhatsApp.

**In scope:**
- Announcement composer (Notion-class block-based, target audience chips, channel toggles)
- Audience targeting (school-wide, class-wide, level-wide, role-wide)
- Channel: in-app + SMS (Termii primary)
- Direct messaging (parent ↔ form teacher, teacher ↔ HOD)
- Conversation archival
- Read receipts
- Delivery log (per-recipient per-channel status)
- Permissions: `announcements.create`, `announcements.view`

**Explicitly out of scope:**
- WhatsApp Business API (Phase 2; cost validation needed first)
- Email integration (Phase 2)
- Voice notes / rich media (Phase 2)
- Translation (Phase 3)

**Dependencies:**
- Sprint 0 (auth + parent linkage), Sprint 1 (Parent, Staff, Class).

**Key technical decisions:**
- **Termii over Twilio:** Termii is Lagos-based, has better Nigerian carrier delivery rates and Naira pricing. Twilio is fallback if Termii has multi-day outages.
- **Notification dispatch architecture:** A `NotificationEvent` is created → resolver determines recipients → channel selector consults per-user preferences → BullMQ workers per channel dispatch in parallel.
- **Cost gate:** SMS sends require an org-wide rate-limit + monthly budget cap. The proprietor sees SMS cost projection before confirming a broadcast.

**Exit criteria:**
- Broadcast to 500 parents delivers via SMS in < 60 seconds with 90%+ delivery rate.
- Direct message renders in parent app under 2s after teacher sends.
- Cost dashboard shows accurate per-channel spend; proprietor receives a weekly summary.

**Risks:**
- SMS costs spiral. Mitigation: per-school monthly budget cap; alerts at 50/75/95%; proprietor approval required to exceed.
- Parents reply to SMS expecting two-way comms (Termii's SMS is one-way). Mitigation: every SMS includes "Reply in the myMakaranta app — open: <short URL>".

---

## Sprint 6 — Reporting & Proprietor Dashboard

**Window:** Weeks 11–14 (overlaps Sprints 4 and 5).
**Theme:** *The selling room. The single most-screenshotted screen in the product.*

**Goal:** A proprietor opens her laptop on Sunday morning at 7:30 AM with coffee. She sees, in one screen: this week's fee collection (with delta vs. prior week), attendance rate (with class-level callouts), academic performance pulse (subjects trending up/down), parent sentiment proxy (response rate to recent broadcasts), and three actionable cards (a teacher with 3 absences this week, a class with falling attendance, a fee bucket with 12 overdue students). It feels like Linear. She opens it on her phone in the school car park and it feels like Linear-mobile. By end of sprint, **this is the screen that wins us pilot proprietor #6 in their boardroom.**

**In scope:**
- Proprietor dashboard (the showpiece) — single-screen "selling room"
- Multi-school pivot (when proprietor owns 2+ schools — switching, comparative card)
- Principal operational dashboard (class-by-class status, daily checklist)
- Termly returns export (Lagos + Kaduna formats, downloadable PDF + Excel)
- Custom date range comparisons
- Designed empty states (first-day-of-term, school not yet onboarded)
- Permissions: `reports.view`, `reports.view.proprietor`

**Explicitly out of scope:**
- Multi-school comparative deep dive (Phase 2)
- AI-generated narrative summaries (Phase 3)
- Scheduled email reports (Phase 2)

**Dependencies:**
- Sprint 0, Sprint 2 (attendance), Sprint 3 (results), Sprint 4 (fees), Sprint 5 (broadcast delivery).

**Key technical decisions:**
- **Materialized views in Postgres** for daily-aggregated metrics (`mv_school_daily_metrics`, refreshed every 5 minutes via pg_cron). Dashboards read from views, not raw tables.
- **Frontend:** dense Linear-style layout. Sidebar navigation + command palette (⌘K) wired in this sprint. Recharts for visualization (open source, sufficient for our needs; no D3 deep-dive).
- **Dark mode:** First-class. Default on for proprietor accounts.

**Exit criteria:**
- Proprietor dashboard renders in < 1.5s on a 4G connection (with cached materialized views).
- Founding designer sign-off: dashboard matches Figma 1:1.
- Principal dashboard supports 5-school batch view (for groups).
- Termly returns export generates a Ministry-format PDF in < 10s.

**Risks:**
- Materialized view staleness during business-hours peak. Mitigation: per-metric refresh cadence (fees: every 1 minute, attendance: every 5 minutes, results: on release event).
- Proprietor expects "everything" on the dashboard; risk of bloat. Mitigation: ruthless cuts to the 5 cards that matter; "Explore" button to drill into details.

---

## Sprint 7 — Parent Mobile App + Lean Student Presence

**Window:** Weeks 12–16. Final sprint.
**Theme:** *The constituency that talks. Make them love us.*

**Goal:** A parent in Kano opens the parent app to a multi-child home: Tunde (JSS2) on the left, Maryam (SS1) on the right. Each card shows a paid-fee circle, a recent grade hint, today's attendance, and the latest school announcement. She taps Tunde, sees his term-by-term performance trajectory, and is one tap from his form teacher. She switches the UI language to Hausa (already structurally supported, English-only at MVP launch — but the framework is ready). Meanwhile, a JSS3 student opens the lean student app, sees her timetable, today's announcements, and her digital ID card. By end of sprint, **the parent app is the thing parents screenshot and send to their WhatsApp groups.**

**In scope:**
- Parent app: multi-child home, child detail (tabs: Academic / Attendance / Fees / Messages)
- Term-by-term performance trend (gentle line chart, never invasive)
- Fee payment polished UX (touched up from Sprint 4)
- Report card delivery moment (the reveal animation lands here for parents — Sprint 3 builds it; Sprint 7 polishes it for parent context)
- Form teacher conversation
- Parent onboarding (SMS magic link → identity match → multi-child auto-link)
- Multilingual scaffolding (English-only at launch; Hausa, Yoruba, Igbo, Pidgin queued in i18n config)
- Lean student app: timetable view (image upload from principal in MVP), results, announcements, digital ID card
- Permissions: `results.view.own`, `fees.pay.own`

**Explicitly out of scope:**
- Full student app with social features (Phase 2)
- PTA module (Phase 2)
- Parent fintech wallet (Phase 4)

**Dependencies:**
- All prior sprints.

**Key technical decisions:**
- **Parent identity:** Phone-first via OTP. On verify, query for `Parent` records matching that phone; auto-link to all children.
- **Multi-child UX:** Default home shows up to 4 children as cards; > 4 collapses to a list. Switching child via top-of-screen segmented control.
- **i18n:** `react-i18next` with English baseline shipping, Hausa/Yoruba/Igbo/Pidgin JSON files prepared but feature-flag-gated.
- **Lean student app:** Reuses 80% of parent-app components. Different brand surface (more vivid, more identity-anchored).

**Exit criteria:**
- Parent successfully onboards via SMS magic link in < 90 seconds end-to-end.
- Multi-child home renders in < 1.2s on Tecno Spark.
- Report card reveal animation hits 60fps; share-to-WhatsApp produces a 1080x1920 image with school crest.
- Founding designer sign-off on every primary screen.
- Pilot schools' parent app installs hit 60% of enrolled-student parents within 2 weeks of launch.

**Risks:**
- Parents on feature phones cannot install apps. Mitigation: SMS communication channel (Sprint 5) covers that segment; parent app is for smartphone parents (~80% of urban Nigerian parents).
- Result-day spike under load. Mitigation: pre-generate all report cards on release; serve from CDN; rate-limit reveal-animation API.

---

## Cross-sprint commitments

These engineering disciplines hold across every sprint:

- **TDD by default** for any code that has behavior. Pure scaffolding can skip.
- **Frequent commits** — one logical change, conventional-commit message, never rolling up multiple features into one commit.
- **Visual regression in CI** ships in Sprint 1 (Chromatic on Storybook). Every component change passes pixel diff before merge.
- **Performance budget defended weekly** — first-load JS ≤ 200KB on web, mobile bundle ≤ 8MB, time-to-interactive ≤ 3s on 4G mid-range Android. Lighthouse run in CI on every PR touching `apps/web`.
- **Accessibility audit weekly** — Storybook a11y addon required to pass; manual TalkBack/VoiceOver on every new mobile feature.
- **Audit log on every mutation** — without exception. The proprietor's trust is built on this.
- **Designer paired** — every sprint has at least one designer day per active feature. The designer reviews UI PRs before merge.

---

## When to write each sub-plan in full

- **Sprint 1 plan:** Written week 2 of Sprint 0, ready for handoff at sprint 0 demo.
- **Sprint 2 plan:** Written week 5 (mid Sprint 1).
- **Sprint 3 plan:** Written week 6 (Sprint 1 close), with the most detail and the most upfront design exploration.
- **Sprint 4 plan:** Written week 7 (Sprint 2 mid).
- **Sprint 5 plan:** Written week 9.
- **Sprint 6 plan:** Written week 10.
- **Sprint 7 plan:** Written week 11.

Each plan goes in `docs/superpowers/plans/YYYY-MM-DD-<sprint-name>.md` (or the local equivalent at `C:\Users\IBRAHIM BASHIR\Documents\myMakaranta\plans\`).

The PRD's Phase 2/3/4 work has its own planning cadence post-MVP and is not addressed in these charters.
