# Academic Core AC-1 — Skills + Report-Card Depth — Design Spec

> **Status:** Approved (2026-06-28) · **Workstream 2 (Academic Core), sub-project 1 of 3.**
> Terminal next step: `superpowers:writing-plans`.

## Goal

Add the Nigerian curriculum depth that turns myMakaranta's existing numeric-results engine into a credible, sellable academic system: **affective & psychomotor "Skills"**, **form-teacher + principal remarks**, an **attendance summary**, a **grading key**, and a **configurable, print-ready report card** with **downloadable PDF** — all composed on top of the existing `Score → ResultSheet` release flow.

## Context (what already exists — build on it, don't replace)

The assessment engine is mature: `AssessmentType`, `GradeBoundary`, `SubjectAssignment`, `Score`, `Release → ResultSheet/ResultSheetEntry` (average + position), `review`/`release`/`correction` services, grade/position/anomaly utils, and a templated `report-card.service`. AC-1 extends this — it adds new sibling tables + enriches the report-card payload; it does **not** change scoring, release, or correction logic.

## Decisions (from brainstorming, locked)

1. **Skill model:** configurable `SkillDomain → SkillItem` with **seeded Nigerian defaults**; configurable rating scale (default 1–5 with a labelled key). Mirrors the existing configurable `AssessmentType`/`GradeBoundary` pattern.
2. **Workflow:** form teacher records skill ratings + the form-teacher remark during the term; principal/head adds the principal remark at review; attendance summary auto-derived from existing attendance records; **everything locks when the class result is Released** (same immutability as scores), amendable only via the existing correction flow.
3. **Output:** **section-toggle + 2–3 preset layouts** (a light configurable card, NOT a drag-drop builder), **plus downloadable PDF** (`@react-pdf/renderer`, server-side).

## Data model (new Prisma models, all `schoolId`-scoped)

```
model SkillDomain {                       // e.g. "Affective", "Psychomotor"
  id String @id @default(cuid())
  schoolId String
  name String
  order Int @default(0)
  items SkillItem[]
  @@unique([schoolId, name])
}
model SkillItem {                         // e.g. "Punctuality", "Handwriting"
  id String @id @default(cuid())
  schoolId String
  domainId String
  name String
  order Int @default(0)
  domain SkillDomain @relation(fields: [domainId], references: [id], onDelete: Cascade)
  ratings SkillRating[]
  @@unique([domainId, name])
  @@index([schoolId])
}
model SkillScalePoint {                   // the rating key: 5="Excellent" ... 1="Poor"
  id String @id @default(cuid())
  schoolId String
  value Int
  label String
  order Int @default(0)
  @@unique([schoolId, value])
}
model SkillRating {                       // form teacher rates each item per student per term
  id String @id @default(cuid())
  schoolId String
  studentId String
  termId String
  skillItemId String
  value Int
  recordedBy String
  updatedAt DateTime @updatedAt
  skillItem SkillItem @relation(fields: [skillItemId], references: [id])
  @@unique([studentId, termId, skillItemId])
  @@index([schoolId, termId])
}
model TermRemark {                        // per student per term
  id String @id @default(cuid())
  schoolId String
  studentId String
  termId String
  formTeacherRemark String?
  principalRemark String?
  updatedAt DateTime @updatedAt
  @@unique([studentId, termId])
  @@index([schoolId, termId])
}
model ReportCardConfig {                  // one per school
  id String @id @default(cuid())
  schoolId String @unique
  layout String @default("classic")       // classic | modern | compact
  showSkills Boolean @default(true)
  showAttendance Boolean @default(true)
  showRemarks Boolean @default(true)
  showGradingKey Boolean @default(true)
  showPosition Boolean @default(true)
  nextTermBegins DateTime?
}
```
`School` gains `skillScaleMax Int @default(5)`.

## Permissions

- New `skills.record` — form teachers rate skills + write the form-teacher remark.
- Reuse `results.review` — principal remark; `results.release` — release/lock + report-card view; `school.manage` — skill config + report-card config.
- Seed `skills.record` into the permission catalog + the relevant role presets (teacher/form-teacher, principal).

## API

- **Skill config (school.manage):** CRUD `…/assessment/skill-domains`, `…/assessment/skill-items`, `GET/PUT …/assessment/skill-scale`. Seeded NG defaults created at onboarding (or lazily on first read).
- **Skill entry (skills.record):** `GET /v1/assessment/skills/grid?classId=&termId=` → students × items matrix; `PUT /v1/assessment/skills` bulk-save ratings (gradebook-style). **Lock guard:** 403 if a `Release` exists for `(classId, termId)`.
- **Remarks:** `PUT /v1/assessment/remarks` — form remark requires `skills.record`; principal remark requires `results.review`. Same lock guard.
- **Report-card config (school.manage):** `GET/PUT /v1/assessment/report-card-config`.
- **Report card (results.release):** extend `GET /v1/assessment/report-card?studentId=&termId=` to compose: school header (name/logo/motto/principalSignatureUrl from P2) · student info · per-subject CA/exam breakdown + total + grade + position + subject remark · **affective & psychomotor skills** (grouped, with values + scale key) · **attendance summary** (present/absent/total for the term, derived from attendance records) · **grading key** · **form-teacher + principal remarks** · the school's `ReportCardConfig` (layout + section flags).
- **PDF (results.release):** `GET /v1/assessment/report-card.pdf?studentId=&termId=` → streams a downloadable PDF built with `@react-pdf/renderer` from the same payload. AC-1 ships the **classic** layout in PDF; modern/compact PDF parity is a fast-follow. Filename `report-card-<admissionNo>-<term>.pdf`.

## Web

- **Settings → Assessment → Skills:** manage domains/items + the scale key (reorder, rename, add/remove).
- **Skills entry** (form teacher): a grid like the gradebook (students × skill items, pick 1–`skillScaleMax`), per class/term, with a per-student form-remark box; shows a read-only "Released — locked" state when a Release exists.
- **Review screen:** add the principal-remark field (gated `results.review`).
- **Settings → Report card:** section toggles + layout picker (classic/modern/compact) with a live preview.
- **Report-card render:** a richer, **print-ready A4** card honoring the config (sections + 1 of 3 layouts), with **Print** and **Download PDF** actions. The same 3 layouts exist as `@media print` CSS (screen/print) and, for PDF, as `@react-pdf` documents (classic in AC-1).

## Release integration

No snapshot table. Skill ratings + remarks live in editable tables during the term; once a `Release` exists for `(classId, termId)` they are **read-only** (enforced by the lock guard), so a released/printed card cannot silently change. Corrections go through the existing correction flow (extended to skills/remarks as a fast-follow if needed; AC-1 locks them).

## Testing

- Unit: lock guard (writes 403 after release; allowed before); report-card payload composition (skills grouped by domain, remarks, attendance summary numbers, grading key, config flags drive included sections); scale validation (value within 1..skillScaleMax); skills-grid save round-trip.
- Integration: seed defaults → record skills + remarks → compose report card → assert all NG sections present; PDF endpoint returns a non-empty `application/pdf` stream with the right filename.
- Web: skills-grid save; report-card render shows skills/remarks/attendance honoring toggles.

## Out of scope (fast-follows / later sub-projects)

- Modern/compact **PDF** layout parity (classic ships in AC-1).
- **Batch** PDF (whole-class zip) + emailing/WhatsApping cards to parents.
- **Parent/student** report-card viewing (a portal feature).
- **Per-level** scales/formats and **Early Years** assessment (AC-2 / AC-3).
- Correction-flow coverage for skills/remarks (AC-1 locks them at release).
