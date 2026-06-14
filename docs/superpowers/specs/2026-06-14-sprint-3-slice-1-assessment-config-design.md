# Sprint 3 · Slice 1 — Assessment Configuration & Subject Assignment (Design)

- **Date:** 2026-06-14
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), decomposed into 6 slices. This is slice 1, the data spine.
- **Charter:** `plans/2026-05-01-sprint-charters.md` §Sprint 3. **PRD:** `PRD-v1.md` §4.5 context.

## Sprint 3 decomposition (context)

Sprint 3 is "the hardest module" (charter: 3 plans / 15 issues). Built slice-by-slice, each its own spec → plan → build:

1. **Foundations — assessment config + subject assignment** ← THIS SLICE
2. Score entry + auto-calc (weighted totals, grade mapping)
3. Review + anomaly detection (class-master / subject-master sheets, z-score)
4. Release workflow + immutability (frozen `ResultSheet`, position, correction flow)
5. Report card PDF + public verification (`@react-pdf/renderer`, R2, tokenized verify + QR)
6. Report-card reveal animation (web / Framer Motion)

Delivery is **responsive web + PWA** (native Expo deferred); teacher entry is responsive web, the reveal is Framer Motion (not Reanimated).

## Goal

Give a school the configuration spine the rest of Sprint 3 hangs off: define the
score components (assessment types), the grade bands, and which teacher teaches
which subject to which class. No scores yet — this is the prerequisite setup.

## Scope (locked decisions)

1. **Scoring model: additive max-scores.** Each `AssessmentType` has a `maxScore`;
   a school's types' `maxScore` values sum to **100**. A subject's term total =
   sum of raw scores, already out of 100. (Weighted mode is a future option, not built.)
2. **Subject assignment grain: per academic year.** One teacher per
   `(subject, class, academicYear)`; carries across that year's terms.
3. **Module: dedicated `assessment` NestJS module** (Approach A) — becomes the home
   for the whole Sprint 3 backend. `SubjectAssignment` lives here too.
4. **Replace-as-a-unit** for assessment types and grade boundaries (atomic, invariants
   validated together); per-row CRUD for subject assignments.
5. Grade-band **templates**: WAEC + NECO seeds; "custom" = edit freely. No auto-seed.

### Non-goals (this slice)
- Score entry / totals / positions / report cards / release (slices 2–5).
- Guarding structure edits after scores exist (slice 2 concern; no scores yet).
- Weighted scoring mode; skill-based/descriptive reporting; multi-term trends.

## Architecture

New `apps/api/src/modules/assessment/` module. Three tenant-scoped Prisma models,
each carrying `schoolId`, registered in the tenancy `TENANT_MODELS` list + Prisma
middleware + PostgreSQL RLS (FORCE) with a migration — identical pattern to
`AttendanceRecord` (Sprint 2). Web config under Settings.

### Data model

**`AssessmentType`**
- `id, schoolId, name (String), maxScore (Int), order (Int)`
- `@@unique([schoolId, name])`
- Invariant (validated at write, see API): a school's types' `maxScore` sum to 100.

**`GradeBoundary`**
- `id, schoolId, grade (String), minScore (Int, inclusive), remark (String), order (Int)`
- `@@unique([schoolId, grade])`
- Resolution: a total maps to the band with the greatest `minScore ≤ total`.
- Invariant (validated at write): `minScore`s unique, all within 0–100, exactly one
  band with `minScore = 0`. Upper bounds implied by the next band ⇒ no overlap/gap.

**`SubjectAssignment`**
- `id, schoolId, subjectId, classId, staffId, academicYearId` (+ relations to
  `Subject`, `Class`, `Staff`, `AcademicYear`)
- `@@unique([subjectId, classId, academicYearId])` — one teacher per subject-class-year
- The set of assignments for a `(class, academicYear)` defines which subjects that
  class offers.
- **Tenant IDOR rule:** every request-supplied id (`subjectId/classId/staffId/
  academicYearId`) is validated through its tenant-scoped model before write — this
  model joins four foreign ids and Prisma middleware does not scope a raw create's
  relations.

### Grade resolution helper
A pure `resolveGrade(total: number, boundaries: GradeBoundary[]): { grade, remark }`
in the module (greatest `minScore ≤ total`). Server is the source of truth; later
slices reuse it for actual grading. The web replicates this tiny pure fn only for the
live config preview.

## API surface

All under `/v1/assessment`, JWT-guarded. Writes require a new `assessment.configure`
permission (principal/proprietor) via `@RequirePermissions` + `PermissionGuard`. Reads
require auth.

**Assessment types (replace-as-unit):**
- `GET /v1/assessment/types` → ordered list.
- `PUT /v1/assessment/types` — body `{ types: [{ name, maxScore, order }] }`.
  Validates: names unique, each `maxScore > 0`, **sum(maxScore) = 100**. Atomic replace
  (transaction). 400 with a clear message on sum ≠ 100.

**Grade boundaries (replace-as-unit + template helper):**
- `GET /v1/assessment/grade-boundaries` → ordered desc by `minScore`.
- `PUT /v1/assessment/grade-boundaries` — body `{ boundaries: [{ grade, minScore, remark, order }] }`.
  Validates: grades unique, `minScore`s unique within 0–100, exactly one `minScore = 0`.
  Atomic replace.
- `POST /v1/assessment/grade-boundaries/apply-template` — body `{ template: "WAEC" | "NECO" }`.
  Replaces the school's bands with a seeded template. Seeds in a module constants file
  (WAEC: A1≥75, B2≥70, B3≥65, C4≥60, C5≥55, C6≥50, D7≥45, E8≥40, F9≥0 with standard
  remarks; NECO: its conventional set).

**Subject assignments (per-row CRUD):**
- `GET /v1/assessment/subject-assignments?academicYearId=&classId=` → filterable list,
  enriched with subject/class/teacher display names.
- `POST` — body `{ subjectId, classId, staffId, academicYearId }`. All four ids
  tenant-validated; unique constraint → 409 on duplicate.
- `PATCH /:id` — reassign teacher (`staffId`); tenant-checked.
- `DELETE /:id` — tenant-checked.

## Config flow (UI)

New Settings → Assessment area (`/settings/assessment`), three panels from existing
design-system primitives (Card, Select, Button, Badge, inputs), Bold Ink + Saffron:

1. **Grade boundaries** — template picker (WAEC/NECO) + Apply; editable table
   (grade / min score / remark; add/remove/reorder); live "score → grade" preview via
   the replicated `resolveGrade`. Save → PUT.
2. **Assessment types** — editable list (name, max score; add/remove) with a
   running-total badge ("Total: 100 ✓" / "90 ✗ — must equal 100"); Save disabled until
   the sum is 100. Save → PUT.
3. **Subject assignments** — academic-year selector (default: the year owning the
   `isCurrent` term); pick a class → its offered subjects each with a teacher `Select`;
   add subject+teacher, reassign, remove.

`apps/web/src/lib/api.ts` gains the new endpoints + types.

## Validation & error handling

- Types sum ≠ 100 → 400; UI running total blocks save.
- Grade bands missing a 0-band or with duplicate mins → 400; UI inline error.
- Duplicate subject assignment → 409 ("already assigned").
- Foreign ids (cross-tenant) → 404 (validated via tenant-scoped finds).
- Empty states guide setup (no types → prompt add; no bands → prompt apply template;
  class with no subjects → prompt assign).

## Testing

- **API e2e** (NestJS + Postgres, `NODE_ENV=test`):
  - `PUT /types` rejects sum = 90, accepts sum = 100; `GET` returns ordered.
  - `PUT /grade-boundaries` rejects no-zero-band and duplicate mins; `apply-template`
    seeds WAEC correctly.
  - `resolveGrade` unit test: 85→A1, 50→C6, 0→F9, boundary edges (74→B3, 75→A1).
  - subject-assignments: foreign `subjectId/classId/staffId/academicYearId` → 404;
    duplicate → 409; list filters by year/class; `PATCH`/`DELETE` tenant-scoped.
  - **Cross-tenant isolation:** school A cannot read or modify school B's types,
    boundaries, or assignments.
- **Web** (vitest, added in Sprint 2.5): unit-test the running-total validation and the
  `resolveGrade` preview; component tests kept light.
- **Browser QA** (third safety net): configure a school end-to-end — apply WAEC →
  set CA1/CA2/CA3/Exam (sum 100) → assign a teacher to a subject+class — and confirm
  persistence via the API.

## Dependencies
- Existing models: `Subject`, `Class`, `Staff`, `AcademicYear`, `Term` (for current-year
  resolution), the permissions system, the tenancy stack (`TENANT_MODELS` + RLS).
- The new `assessment.configure` permission must be added wherever permissions are
  seeded/registered, and granted to the proprietor/principal roles (follow the existing
  permission-seeding pattern).
- No new npm dependencies.

## Out-of-scope future (later slices)
- Score entry + weighted/auto totals (slice 2) — will consume this config and must then
  guard structure edits once scores exist.
- Everything in slices 3–6.
