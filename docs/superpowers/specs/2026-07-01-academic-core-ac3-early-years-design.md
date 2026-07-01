# Academic Core AC-3 — Early Years (Developmental Assessment) — Design Spec

> **Status:** Approved (2026-07-01) · **Workstream 2 (Academic Core), sub-project 3 of 3.**
> Terminal next step: `superpowers:writing-plans`.

## Goal

Support nursery / early-years classes that are assessed **developmentally** (areas rated Beginning/Developing/Secure + a narrative) rather than by CA/Exam scores — producing a developmental report card — while leaving every non-early-years class completely unchanged.

## Context (reuse AC-1)

AC-1 built `SkillDomain → SkillItem → SkillRating` (+ `SkillScalePoint` scale, `TermRemark` narrative) with a config CRUD, an entry grid, a release-lock guard (`assertNotReleased`), lazy/create-time seeding, and report-card composition. AC-3 reuses all of it via a `kind` discriminator instead of building parallel machinery. `ClassLevel` is flat; each `Class` has a `classLevelId`. Release/report-card/scores currently assume numeric scoring.

## Decisions (locked)

1. **Designation:** `ClassLevel.isEarlyYears` boolean flag (manual, per level). A class is early-years iff its level is.
2. **Model:** reuse AC-1 `Skill*` with a `kind` discriminator — `SkillDomain.kind` + `SkillScalePoint.kind` ∈ `{"conduct","early_years"}` (existing rows default `"conduct"`). EY areas = `SkillDomain(kind="early_years")` → `SkillItem`; ratings reuse `SkillRating`; narrative reuses `TermRemark`.
3. **Output:** **replace** — an EY class's report card shows developmental areas + ratings + narrative + attendance, no subjects table / average / position. EY teachers use the developmental entry grid, not the numeric gradebook. Release **locks** the ratings but computes no numeric `ResultSheet`.

## Data model (additive)

```
model ClassLevel { /* +field */ isEarlyYears Boolean @default(false) }
model SkillDomain { /* +field */ kind String @default("conduct") }      // "conduct" | "early_years"
model SkillScalePoint { /* +field */ kind String @default("conduct") }  // "conduct" | "early_years"
```
No change to `SkillItem`, `SkillRating`, or `TermRemark`. Existing rows get `kind = "conduct"` (backward-compatible — AC-1 behaviour is the `conduct` path).

**Uniqueness note:** AC-1's `SkillDomain @@unique([schoolId, name])` and `SkillScalePoint @@unique([schoolId, value])` must widen to include `kind` (`@@unique([schoolId, kind, name])`, `@@unique([schoolId, kind, value])`) so a conduct scale point `value=1` and an EY scale point `value=1` can coexist. (Verify the exact current constraints and adjust.)

## Seeded EY defaults

`seedEarlyYearsDefaults(prisma, schoolId)` (idempotent; mirrors AC-1's `skill-defaults`, lives in `src/`): EY `SkillDomain(kind="early_years")` areas — **Communication & Language, Number Work, Physical Development, Personal/Social/Emotional, Understanding the World, Creative & Expressive Arts, Moral/Religious** — each with 2–4 sub-skill `SkillItem`s, + a 3-point EY `SkillScalePoint` scale **{3:"Secure", 2:"Developing", 1:"Beginning"}** (`kind="early_years"`). Seeded lazily on first EY-config read and when a level is first flagged `isEarlyYears`. (Conduct defaults stay AC-1's.)

## API

- **Level flag:** `PATCH /v1/structure/class-levels/:id` (perm `school.manage`) accepts `isEarlyYears` (add to the existing class-level update, or a focused endpoint). Flagging a level triggers `seedEarlyYearsDefaults`.
- **Skills config/grid/ratings gain `kind`:** `GET …/skill-domains?kind=`, create/update take `kind`; `GET …/skills/grid?classId=&termId=&kind=` and `PUT …/skills` operate on the requested kind (default `"conduct"` = unchanged AC-1). The grid for an EY class is called with `kind="early_years"` and returns the EY scale. Release-lock guard reused unchanged. `SkillScalePoint` config gains `kind`.
- **Report card** (`report-card.service`): branch on `class.classLevel.isEarlyYears`. EY → `{ mode: "early_years", areas: [{ area, items: [{ name, rating: {value,label}|null }] }], scaleKey, narrative: {formTeacher, principal}, attendance, school }` (no `entries`/`subjectGroups`/`average`/`position`). Standard → the existing AC-1/AC-2 payload (`mode:"standard"`). PDF branches to an EY layout.
- **Release** (`release.service`): if the class's level `isEarlyYears`, create the `Release` row (locks EY ratings/narrative via the shared lock guard) and **skip** `ResultSheet`/entry/position computation; else the existing numeric path. `getReleaseStatus` treats EY classes as releasable.

## Web

- **Level toggle:** an "Early Years" switch on the class-levels/settings screen (per level).
- **EY config:** the skills-config screen gets a `kind` tab ("Conduct skills" | "Early Years areas") to manage EY areas + the EY scale.
- **Developmental entry grid:** the skills-entry grid used with `kind="early_years"` for EY classes (students × areas' items, rated on the EY scale, + narrative); shows "Released — locked" after release. EY classes surface this instead of the numeric gradebook.
- **Report card:** the render + PDF branch on `mode === "early_years"` → developmental layout (areas + ratings + narrative + attendance); standard mode unchanged.

## Testing

- `isEarlyYears` flag persists; flagging seeds EY defaults idempotently.
- `kind` isolation: conduct and early_years domains/scales never mix in config/grid/report queries; widened uniqueness lets `value=1` coexist across kinds.
- EY grid save round-trip + lock-on-release (reuses AC-1 guard).
- report-card EY mode: areas + ratings (EY scale labels) + narrative + attendance present; NO `entries`/`average`/`position`. Standard mode unchanged (regression).
- EY release: creates `Release` (locks) with NO `ResultSheet` rows; a numeric class still computes ResultSheets (regression).
- Full assessment suite green (non-EY paths unaffected).

## Out of scope (fast-follows)

- Per-area narrative comments (AC-3 uses one overall narrative via `TermRemark`).
- EY promotion/rank concepts (nursery isn't ranked).
- EY-specific attendance visuals.
