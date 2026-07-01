# Academic Core AC-3 — Early Years — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Support developmentally-assessed early-years classes (areas rated Beginning/Developing/Secure + narrative → developmental report card), reusing AC-1's skills machinery via a `kind` discriminator, leaving all numeric classes unchanged.

**Architecture:** Add `ClassLevel.isEarlyYears` + `kind` to `SkillDomain`/`SkillScalePoint` (default `"conduct"` = AC-1 behaviour). Skills config/grid/ratings gain a `kind` param. `report-card.service` and `release.service` branch on the class level's `isEarlyYears`: EY → developmental payload + `Release` that locks ratings but writes no `ResultSheet`; standard → unchanged. PDF + web branch on `mode`.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL, Jest, `@react-pdf/renderer`, Next.js 15.

## Global Constraints

- Branch off `dev` (AC-1 + AC-2 merged). Work in `apps/api/src/modules/assessment/` + `structure` + `apps/web`.
- Multi-tenancy: scope every read/write by `schoolId` (per `prisma-tenant-scope-explicitly`, `tenant-idor-rule`).
- **Backward-compat:** `SkillDomain.kind`/`SkillScalePoint.kind` default `"conduct"`; existing AC-1 conduct queries MUST filter `kind:"conduct"` so EY rows never leak into the affective/psychomotor sections. `kind ∈ {"conduct","early_years"}`.
- **Build invariant:** the EY seeder lives in `src/` (e.g. `src/modules/assessment/early-years-defaults.ts`) — NO `src/` file may import from top-level `prisma/` (that emits `dist/src/main.js` and breaks Render). Confirm `dist/main.js` after any seeder wiring.
- **Lock:** reuse `assertNotReleased(prisma, classId, termId)`; EY writes 403 once a `Release` exists.
- EY scale (verbatim): `{3:"Secure", 2:"Developing", 1:"Beginning"}` (`kind:"early_years"`).
- Tests: local test DB — prefix `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`; argon2 suites `--runInBand`. Never commit that URL.
- Web: `tsc --noEmit` (0, no TS2786 regression) + `next lint`; do NOT run `next build`.

## File Structure

- `apps/api/prisma/schema.prisma` + migration — `isEarlyYears`, `kind` (×2), widened uniques (modify).
- `apps/api/src/modules/assessment/early-years-defaults.ts` (+ spec) — EY seeder (create, in src).
- `apps/api/src/modules/assessment/skills.service.ts` / `.controller.ts` / `dto` — `kind` param (modify).
- `apps/api/src/modules/structure/class-levels.service.ts` / `.controller.ts` / `dto` — `isEarlyYears` + seed on flag (modify).
- `apps/api/src/modules/assessment/report-card.service.ts` — EY-mode branch (modify).
- `apps/api/src/modules/assessment/release.service.ts` — EY release branch (modify).
- `apps/api/src/modules/assessment/report-card-pdf.tsx` — EY layout branch (modify).
- `apps/web`: class-levels settings (EY toggle), skills config (kind tab), skills entry grid (kind), report-card render (mode) (modify).

---

### Task 1: Schema — isEarlyYears + kind discriminators + widened uniques

**Files:** Modify `apps/api/prisma/schema.prisma`; migration; Test `apps/api/src/modules/assessment/ey-model.spec.ts`.

- [ ] **Step 1:** Add `isEarlyYears Boolean @default(false)` to `ClassLevel`; add `kind String @default("conduct")` to `SkillDomain` and `SkillScalePoint`. Widen their uniques: `SkillDomain @@unique([schoolId, name])` → `@@unique([schoolId, kind, name])`; `SkillScalePoint @@unique([schoolId, value])` → `@@unique([schoolId, kind, value])`. (Read the current constraints first to confirm names.)
- [ ] **Step 2:** `DATABASE_URL=... pnpm exec prisma migrate dev --name early_years`. (No raw SQL needed — plain columns + composite uniques. Existing rows get `kind="conduct"` via the default.)
- [ ] **Step 3: Failing test** `ey-model.spec.ts`: create a conduct scale point `value=1` AND an early_years scale point `value=1` for the same school — BOTH succeed (widened unique); a conduct domain "X" and an early_years domain "X" coexist; `ClassLevel.isEarlyYears` toggles + persists.
- [ ] **Step 4:** `DATABASE_URL=... pnpm exec jest ey-model` → fail then pass; run `jest "skills.service|report-card.service" --runInBand` to confirm AC-1/AC-2 specs still pass (defaults `kind="conduct"`).
- [ ] **Step 5: Commit** `feat(assessment): isEarlyYears + kind discriminators (AC-3)`.

---

### Task 2: Early-years defaults seeder (in src)

**Files:** Create `apps/api/src/modules/assessment/early-years-defaults.ts` (+ `.spec.ts`).

**Interfaces:** Produces `seedEarlyYearsDefaults(prisma, schoolId): Promise<void>` — idempotent; creates `SkillDomain(kind="early_years")` areas + their `SkillItem`s and the 3-point EY `SkillScalePoint`s (`kind="early_years"`) if none exist. Mirrors `src/modules/assessment/skill-defaults.ts` (AC-2 moved it into src — read it for the pattern).

- [ ] **Step 1: Failing test** — `seedEarlyYearsDefaults` twice → the EY areas (7) + 3 EY scale points exist once; and it does NOT touch conduct rows.
- [ ] **Step 2: Implement**

```typescript
// apps/api/src/modules/assessment/early-years-defaults.ts
import type { PrismaClient } from "@prisma/client";
export const EY_AREAS = [
  { name: "Communication & Language", items: ["Listening & Attention", "Speaking", "Understanding"] },
  { name: "Number Work", items: ["Counting", "Number Recognition", "Shapes & Patterns"] },
  { name: "Physical Development", items: ["Gross Motor", "Fine Motor", "Health & Self-care"] },
  { name: "Personal, Social & Emotional", items: ["Confidence", "Relationships", "Behaviour"] },
  { name: "Understanding the World", items: ["People & Communities", "The World", "Technology"] },
  { name: "Creative & Expressive Arts", items: ["Art & Craft", "Music & Movement", "Imaginative Play"] },
  { name: "Moral / Religious", items: ["Values", "Rhymes & Recitation"] },
];
const EY_SCALE = [{ value: 3, label: "Secure" }, { value: 2, label: "Developing" }, { value: 1, label: "Beginning" }];
export async function seedEarlyYearsDefaults(prisma: PrismaClient, schoolId: string): Promise<void> {
  const has = await prisma.skillDomain.count({ where: { schoolId, kind: "early_years" } });
  if (has === 0) {
    for (const [di, a] of EY_AREAS.entries()) {
      const d = await prisma.skillDomain.create({ data: { schoolId, kind: "early_years", name: a.name, order: di } });
      await prisma.skillItem.createMany({ data: a.items.map((name, i) => ({ schoolId, domainId: d.id, name, order: i })) });
    }
  }
  const scale = await prisma.skillScalePoint.count({ where: { schoolId, kind: "early_years" } });
  if (scale === 0) {
    await prisma.skillScalePoint.createMany({ data: EY_SCALE.map((p, i) => ({ schoolId, kind: "early_years", value: p.value, label: p.label, order: i })) });
  }
}
```

- [ ] **Step 3: Run** `jest early-years-defaults` → pass.
- [ ] **Step 4: Commit** `feat(assessment): early-years default areas + scale seeder (AC-3)`.

---

### Task 3: Skills service `kind` param + conduct-filtering

**Files:** Modify `skills.service.ts`, `.controller.ts`, `dto`; extend specs.

**Interfaces:** `listConfig(kind="conduct")`, `getGrid(classId, termId, kind="conduct")`, `saveRatings(dto)` where the DTO/query carry `kind`; scale reads/writes carry `kind`. **Crucially:** every existing conduct query adds `kind:"conduct"` so EY rows never appear in the affective/psychomotor config/grid, and vice-versa. Controllers accept `?kind=` (validate ∈ {conduct,early_years}).

- [ ] **Step 1: Failing test** — seed conduct defaults + EY defaults for a school; `listConfig("conduct")` returns ONLY conduct domains; `listConfig("early_years")` returns ONLY EY areas; `getGrid(class, term, "early_years")` returns EY items + the EY scale; saving an EY rating for an EY item persists and is isolated from conduct.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — thread `kind` through service methods (default `"conduct"`), add `kind` filters to all domain/item/scale queries, validate the controller `?kind=`. Reuse `assertNotReleased` unchanged in `saveRatings`. Ensure the IDOR checks (enrollment + item ownership from AC-1) still apply, and additionally that saved ratings' items belong to the requested `kind`.
- [ ] **Step 4: Run** `jest "skills" --runInBand` → pass (AC-1 conduct specs + new EY-kind specs).
- [ ] **Step 5: Commit** `feat(assessment): kind param on skills config/grid/ratings (AC-3)`.

---

### Task 4: ClassLevel isEarlyYears endpoint + seed-on-flag

**Files:** Modify `class-levels.service.ts`, `.controller.ts`, `dto`; Test its spec.

**Interfaces:** the class-level update accepts `isEarlyYears?: boolean` (validate school ownership). When a level is set `isEarlyYears=true`, call `seedEarlyYearsDefaults(prisma, schoolId)` (idempotent) so EY areas exist.

- [ ] **Step 1: Failing test** — updating a level with `isEarlyYears:true` persists it AND triggers EY defaults (EY domains now exist for the school); setting it back to false doesn't delete EY config.
- [ ] **Step 2: Run to fail; implement** (add field to the update DTO/service; call the seeder when flipping to true). Scope by schoolId.
- [ ] **Step 3: Run** `jest class-level` → pass; confirm the build invariant (`nest build` → `dist/main.js`) since a src service now imports the src seeder (fine — src→src).
- [ ] **Step 4: Commit** `feat(structure): ClassLevel.isEarlyYears flag + seed EY defaults on flag (AC-3)`.

---

### Task 5: Report-card EY-mode branch

**Files:** Modify `report-card.service.ts` (+ spec).

**Interfaces:** `getReportCard` loads the class + `classLevel.isEarlyYears`. If true → return `{ mode: "early_years", areas: { area: string; items: { name: string; rating: { value: number; label: string } | null }[] }[], scaleKey: {value,label}[], narrative: { formTeacher, principal }, attendance, school }` (EY domains kind=early_years + this student's ratings; scaleKey = EY scale; NO `entries`/`subjectGroups`/`average`/`position`). Else return the existing payload with `mode: "standard"`. Also: the existing conduct-skills section (AC-1) must query `kind:"conduct"` so EY areas don't appear there in standard mode.

- [ ] **Step 1: Failing test** — a student in an EY class returns `mode:"early_years"` with areas+ratings+scaleKey+narrative+attendance and NO `entries`/`average`/`position`; a student in a numeric class returns `mode:"standard"` with the full AC-1/AC-2 payload (regression) and its conduct skills only (kind conduct).
- [ ] **Step 2: Run to fail; implement** the branch (reuse `assert… ` not needed here; read EY ratings via SkillRating joined to EY items; attendance via the existing helper). Do NOT change the numeric composition.
- [ ] **Step 3: Run** `jest report-card.service --runInBand` → pass.
- [ ] **Step 4: Commit** `feat(assessment): early-years report-card mode (AC-3)`.

---

### Task 6: Release EY branch (lock, no ResultSheet)

**Files:** Modify `release.service.ts` (+ spec).

**Interfaces:** `release(classId, termId)`: if the class's level `isEarlyYears`, create the `Release` row (which locks EY ratings/narrative via `assertNotReleased`) and SKIP `ResultSheet`/entry/position computation; else the existing numeric path unchanged. `getReleaseStatus` reports EY classes as releasable/released like any class.

- [ ] **Step 1: Failing test** — releasing an EY class creates a `Release` row with ZERO `ResultSheet` rows, and afterwards an EY skill write for that class/term throws (locked); releasing a numeric class still creates ResultSheets (regression); a subsequent EY report-card read reflects the locked ratings.
- [ ] **Step 2: Run to fail; implement** the branch (guard on `classLevel.isEarlyYears`).
- [ ] **Step 3: Run** `jest "release" --runInBand` → pass.
- [ ] **Step 4: Commit** `feat(assessment): early-years release locks ratings without ResultSheet (AC-3)`.

---

### Task 7: PDF EY layout

**Files:** Modify `report-card-pdf.tsx` (+ its spec).

**Interfaces:** `renderReportCardPdf(payload)` branches on `payload.mode`: `"early_years"` → a developmental layout (header + student info + areas with per-item rating labels + narrative + attendance + signature; NO subjects table/position); `"standard"` → the existing classic layout.

- [ ] **Step 1: Failing test** — `renderReportCardPdf(eyPayload)` returns a Buffer starting `%PDF`, length > 1000, and (smoke) does not throw on the EY shape (no `entries`).
- [ ] **Step 2: Run to fail; implement** the `mode` branch in the PDF component. Confirm `nest build` still emits `dist/main.js`.
- [ ] **Step 3: Run** `jest report-card-pdf` → pass.
- [ ] **Step 4: Commit** `feat(assessment): early-years PDF layout (AC-3)`.

---

### Task 8: Web — EY toggle, config, entry grid, report render

**Files:** Modify class-levels settings page (`grep -rl "classLevel\|class-levels\|listClassLevels" apps/web/src/app`), skills config page (`settings/skills`), skills entry (`skills/page.tsx`), report-card render (`report-card/[studentId]/page.tsx`), `lib/api.ts`.

- [ ] **Step 1:** `lib/api.ts` — add `kind?` to skills config/grid/ratings helpers; `updateClassLevel({isEarlyYears})`; report-card type gains the `mode:"early_years"` variant (areas/scaleKey/narrative).
- [ ] **Step 2:** class-levels settings: an **"Early Years"** toggle per level (calls `updateClassLevel`).
- [ ] **Step 3:** skills config: a `kind` tab ("Conduct" | "Early Years") — the same manager UI parameterised by kind (areas + EY scale under the EY tab).
- [ ] **Step 4:** skills entry: for an EY class, use `kind="early_years"` (areas × items on the EY scale + narrative). The class/term picker should indicate when a class is early-years and use the EY grid; numeric gradebook is hidden/redirected for EY classes.
- [ ] **Step 5:** report-card render + the 3 layouts branch on `mode==="early_years"` → developmental layout (areas + ratings + narrative + attendance); standard unchanged.
- [ ] **Step 6: Verify** web `tsc --noEmit` (0) + `next lint` (no errors). Commit `feat(web): early-years toggle, config, entry grid + report render (AC-3)`.

---

### Task 9: Regression gate

- [ ] `DATABASE_URL=... pnpm --filter @mymakaranta/api exec prisma migrate reset --force` → `tsc --noEmit` (0) → `jest --runInBand` (all pass, incl. AC-1/AC-2 conduct + numeric paths) → `nest build` then confirm `dist/main.js`.
- [ ] `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `vitest run` + `next lint`.
- [ ] Commit (`--allow-empty`): `test: AC-3 regression gate green`.

---

## Self-Review

**Spec coverage:** isEarlyYears + kind + widened uniques (T1) ✓ · EY seeder in src (T2) ✓ · skills `kind` param + conduct isolation (T3) ✓ · level flag + seed-on-flag (T4) ✓ · report-card EY mode (T5) ✓ · release EY branch (T6) ✓ · PDF EY layout (T7) ✓ · web (T8) ✓ · gate (T9) ✓.

**Placeholder scan:** T8 (web) points to grep-located files + exact endpoints/kinds; API tasks carry concrete code/tests. Reviewer enforces real assertions.

**Type consistency:** `seedEarlyYearsDefaults` (T2) called by T4; `kind` param (T3) used by T5's conduct-filter + T8; `mode` payload (T5) consumed by T7 (PDF) + T8 (render); `assertNotReleased` reused (T3/T6).

**Risks:** T1 widens two AC-1 uniques — its test asserts cross-kind coexistence + that AC-1 conduct specs still pass. T3/T5 must add `kind:"conduct"` to existing conduct queries or EY rows leak into standard reports — covered by tests. Build invariant re-checked in T4/T7 (src→src seeder import only; no src→prisma).
