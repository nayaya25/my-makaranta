# Academic Core AC-1 — Skills + Report-Card Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add affective/psychomotor **Skills**, **form-teacher + principal remarks**, an **attendance summary**, a **grading key**, a **configurable report card** (section toggles + 3 layouts), and **downloadable PDF** — composed on top of the existing `Score → Release/ResultSheet` flow, locking on release.

**Architecture:** New sibling Prisma models (`SkillDomain/Item/ScalePoint`, `SkillRating`, `TermRemark`, `ReportCardConfig`) in the existing `assessment` module. Skill/remark writes are gated by a release-lock guard (403 once a `Release` exists for the class+term). `report-card.service` is extended to compose the richer payload; a new endpoint streams a PDF built with `@react-pdf/renderer`. Web adds config screens, a skills-entry grid, a principal-remark field, and a print-ready report-card render.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL, Jest, `@react-pdf/renderer` (new, server-side), Next.js 15 + `@mymakaranta/ui`.

## Global Constraints

- Branch off `dev` (P1–P4 merged). Build the API in `apps/api/src/modules/assessment/` (follow its existing service/controller/dto patterns).
- Multi-tenancy: scope every new read/write by `schoolId` explicitly (per `prisma-tenant-scope-explicitly`, `tenant-idor-rule`).
- **Lock rule (verbatim):** skill-rating + remark writes return **403** when `prisma.release.findUnique({ where: { classId_termId: { classId, termId } } })` is non-null. Released cards are immutable.
- Rating values must satisfy `1 ≤ value ≤ School.skillScaleMax` (default 5).
- New permission key (verbatim): `skills.record`. Reuse `results.review` (principal remark), `results.release` (report-card read + PDF), `school.manage` (skill + report-card config).
- Tests: local test DB — prefix `DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public'`; run argon2-touching suites with `--runInBand`. Never commit that URL; `.superpowers/` is git-ignored.
- The production API build requires `apps/api/tsconfig.build.json` to stay valid — do not add `src/` files that import outside `src/` into the runtime build (keep prisma-importing code in `*.spec.ts` only).
- After adding `@react-pdf/renderer`, run `pnpm audit`.
- Web: do NOT run `next build` (Windows crash); verify with `tsc --noEmit` + `next lint` + `vitest`.

## File Structure

- `apps/api/prisma/schema.prisma` — new models + `School.skillScaleMax` (modify) + migration.
- `apps/api/prisma/seed-skill-defaults.ts` — seedable NG defaults (create).
- `apps/api/src/modules/assessment/skills.controller.ts` · `skills.service.ts` (+ specs) — config CRUD + grid + ratings (create).
- `apps/api/src/modules/assessment/remarks.controller.ts` · `remarks.service.ts` (+ spec) (create).
- `apps/api/src/modules/assessment/report-card-config.controller.ts` · `.service.ts` (create).
- `apps/api/src/modules/assessment/release-lock.util.ts` (+ spec) — shared lock check (create).
- `apps/api/src/modules/assessment/report-card.service.ts` — extend payload (modify).
- `apps/api/src/modules/assessment/report-card-pdf.controller.ts` · `report-card-pdf.tsx` (create).
- `apps/api/src/modules/assessment/assessment.module.ts` — register new providers/controllers (modify).
- `apps/api/src/core/auth/permissions/catalog.ts` (or wherever the catalog lives) — add `skills.record` (modify).
- `apps/web/src/app/(app)/settings/skills/page.tsx` · `settings/report-card/page.tsx` (create).
- `apps/web/src/app/(app)/skills/page.tsx` — skills-entry grid (create).
- `apps/web/src/app/(app)/review/page.tsx` — add principal-remark field (modify).
- `apps/web/src/app/(app)/report-card/[studentId]/page.tsx` — richer render + Print/Download PDF (create or modify existing report-card route).
- `apps/web/src/lib/api.ts` — new client helpers (modify).

---

### Task 1: Prisma models + migration

**Files:** Modify `apps/api/prisma/schema.prisma`; Test `apps/api/src/modules/assessment/skills-model.spec.ts`.

**Interfaces:** Produces models `SkillDomain, SkillItem, SkillScalePoint, SkillRating, TermRemark, ReportCardConfig` and `School.skillScaleMax Int @default(5)` exactly as in the spec's Data Model section.

- [ ] **Step 1: Add the six models + `School.skillScaleMax`** to `schema.prisma` exactly as written in the design spec (`docs/superpowers/specs/2026-06-28-academic-core-ac1-skills-report-card-design.md`, "Data model"). Add the back-relations the schema requires (e.g. `School` → these via schoolId is unrelated scalar in this codebase's style — match how existing models like `AssessmentType` reference `schoolId`; they use an explicit `school School @relation`. Mirror that: add `school School @relation(fields:[schoolId],references:[id])` to each new model and the inverse arrays on `School`).
- [ ] **Step 2: Migrate** — `DATABASE_URL=... pnpm exec prisma migrate dev --name academic_skills`.
- [ ] **Step 3: Failing smoke test**

```typescript
// apps/api/src/modules/assessment/skills-model.spec.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
it("creates a domain → item → rating chain", async () => {
  const school = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
  const d = await prisma.skillDomain.create({ data: { schoolId: school.id, name: "Affective" } });
  const item = await prisma.skillItem.create({ data: { schoolId: school.id, domainId: d.id, name: "Punctuality" } });
  expect(item.domainId).toBe(d.id);
  const cfg = await prisma.reportCardConfig.create({ data: { schoolId: school.id } });
  expect(cfg.layout).toBe("classic");
});
```

- [ ] **Step 4: Run** `DATABASE_URL=... pnpm exec jest skills-model` → fail then pass.
- [ ] **Step 5: Commit** `feat(assessment): skills + report-card-config models (AC-1)`.

---

### Task 2: `skills.record` permission + seeded NG defaults

**Files:** Modify the permission catalog file (find it: `grep -rn "results.release" apps/api/src/core/auth` / `modules/staff-access`); Create `apps/api/prisma/seed-skill-defaults.ts`; Test `apps/api/prisma/seed-skill-defaults.spec.ts`.

**Interfaces:** Produces `skills.record` in the catalog (+ granted to teacher + principal presets/seed-roles) and `seedSkillDefaults(prisma, schoolId)` creating default domains/items + scale points if none exist (idempotent).

- [ ] **Step 1:** Add `skills.record` to the permission catalog (match the exact shape of neighboring entries, e.g. `{ key: "skills.record", label: "Record skills & form remarks", group: "Results" }`), and include it where role presets grant results perms (so form teachers/principals get it).
- [ ] **Step 2: Failing test** for `seedSkillDefaults`:

```typescript
// apps/api/prisma/seed-skill-defaults.spec.ts
import { PrismaClient } from "@prisma/client";
import { seedSkillDefaults, DEFAULT_DOMAINS } from "./seed-skill-defaults";
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
it("seeds default domains/items + 5-point scale idempotently", async () => {
  const s = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
  await seedSkillDefaults(prisma, s.id);
  await seedSkillDefaults(prisma, s.id); // idempotent
  const domains = await prisma.skillDomain.findMany({ where: { schoolId: s.id } });
  expect(domains.map((d) => d.name).sort()).toEqual(DEFAULT_DOMAINS.map((d) => d.name).sort());
  const scale = await prisma.skillScalePoint.findMany({ where: { schoolId: s.id } });
  expect(scale).toHaveLength(5);
});
```

- [ ] **Step 3: Implement** `seed-skill-defaults.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
export const DEFAULT_DOMAINS = [
  { name: "Affective", items: ["Punctuality", "Neatness", "Politeness", "Honesty", "Attentiveness", "Cooperation"] },
  { name: "Psychomotor", items: ["Handwriting", "Drawing & Painting", "Sports", "Music", "Handling of Tools"] },
];
const DEFAULT_SCALE = [
  { value: 5, label: "Excellent" }, { value: 4, label: "Very Good" }, { value: 3, label: "Good" },
  { value: 2, label: "Fair" }, { value: 1, label: "Poor" },
];
export async function seedSkillDefaults(prisma: PrismaClient, schoolId: string): Promise<void> {
  const existing = await prisma.skillDomain.count({ where: { schoolId } });
  if (existing === 0) {
    for (const [di, d] of DEFAULT_DOMAINS.entries()) {
      const domain = await prisma.skillDomain.create({ data: { schoolId, name: d.name, order: di } });
      await prisma.skillItem.createMany({
        data: d.items.map((name, i) => ({ schoolId, domainId: domain.id, name, order: i })),
      });
    }
  }
  const scaleCount = await prisma.skillScalePoint.count({ where: { schoolId } });
  if (scaleCount === 0) {
    await prisma.skillScalePoint.createMany({
      data: DEFAULT_SCALE.map((p, i) => ({ schoolId, value: p.value, label: p.label, order: i })),
    });
  }
}
```

- [ ] **Step 4: Run** `jest seed-skill-defaults` → pass.
- [ ] **Step 5: Commit** `feat(assessment): skills.record permission + seeded NG defaults (AC-1)`.

---

### Task 3: Release-lock util + Skills config CRUD

**Files:** Create `apps/api/src/modules/assessment/release-lock.util.ts` (+ `.spec.ts`), `skills.controller.ts`, `skills.service.ts`, `dto/skills.dto.ts`; Modify `assessment.module.ts`.

**Interfaces:**
- Produces `assertNotReleased(prisma, classId, termId): Promise<void>` (throws `ForbiddenException("Results released — locked.")` if a Release exists).
- Produces skill-config endpoints (perm `school.manage`): `GET /v1/assessment/skill-domains` (domains + nested items + scale), `POST/PATCH/DELETE` for domains + items, `GET/PUT /v1/assessment/skill-scale`.
- `SkillsService` methods: `listConfig(schoolId)`, `createDomain/updateDomain/deleteDomain`, `createItem/updateItem/deleteItem`, `getScale/setScale`.

- [ ] **Step 1: Lock util + failing test** — `release-lock.util.spec.ts`: with no Release → resolves; with a Release row for (classId,termId) → rejects `ForbiddenException`. Implement `assertNotReleased`.
- [ ] **Step 2:** failing test for `SkillsService.listConfig` returning domains (with items, ordered) + scale for a school (seed via `seedSkillDefaults`).
- [ ] **Step 3: Implement** the service (all reads/writes `where: { schoolId }`-scoped; `TenantContext.schoolIdOrThrow()` for the active school as other services do) + controller (guards `JwtAuthGuard + PermissionGuard("school.manage")`) + DTOs. Register in `assessment.module.ts`.
- [ ] **Step 4: Run** `jest "skills|release-lock"` → pass.
- [ ] **Step 5: Commit** `feat(assessment): release-lock util + skill config CRUD (AC-1)`.

---

### Task 4: Skills grid + bulk ratings save (locked)

**Files:** Modify `skills.controller.ts`, `skills.service.ts`, `dto/skills.dto.ts`; Test `skills-grid.spec.ts`.

**Interfaces:**
- `GET /v1/assessment/skills/grid?classId=&termId=` (perm `skills.record`) → `{ locked: boolean, scale: {value,label}[], domains: {id,name,items:{id,name}[]}[], students: {studentId,name}[], ratings: {studentId,skillItemId,value}[] }`.
- `PUT /v1/assessment/skills` (perm `skills.record`) body `{ classId, termId, ratings: {studentId, skillItemId, value}[] }` → upserts each `SkillRating` (unique `studentId+termId+skillItemId`); validates `1..skillScaleMax`; calls `assertNotReleased` first.

- [ ] **Step 1: Failing test** — seed school + class + 2 students + skills; `saveRatings` upserts values, re-save updates (no dupes); value `> skillScaleMax` → `BadRequestException`; after creating a Release for (class,term), `saveRatings` → `ForbiddenException`; `getGrid` returns `locked:true` then.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** `getGrid` (compose class roster + config + existing ratings) + `saveRatings` (assertNotReleased → validate scale via `school.skillScaleMax` → `upsert` each rating with `recordedBy` from the user). Controller routes guarded `skills.record`.
- [ ] **Step 4: Run** `jest skills-grid --runInBand` → pass.
- [ ] **Step 5: Commit** `feat(assessment): skills grid + locked bulk ratings (AC-1)`.

---

### Task 5: Term remarks (form + principal, locked)

**Files:** Create `remarks.controller.ts`, `remarks.service.ts`, `dto/remarks.dto.ts`; Test `remarks.spec.ts`; Modify `assessment.module.ts`.

**Interfaces:**
- `PUT /v1/assessment/remarks` body `{ studentId, termId, classId, formTeacherRemark?, principalRemark? }`. The **form** remark requires `skills.record`; the **principal** remark requires `results.review`. If the body sets `principalRemark` the caller must hold `results.review`; if it sets `formTeacherRemark` they must hold `skills.record` (a method-level check, since one route updates both fields). `assertNotReleased(classId,termId)` first. Upsert `TermRemark` unique `(studentId,termId)`.
- `GET /v1/assessment/remarks?studentId=&termId=` (perm `skills.record` OR `results.review`) → the `TermRemark` or null.

- [ ] **Step 1: Failing test** — saving a `formTeacherRemark` with only `skills.record` works; setting `principalRemark` without `results.review` → `ForbiddenException`; both persist on the same row; locked after Release.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** (read the caller's perms from `request.user.perms` / the membership; the controller passes the perm set to the service which enforces per-field). Upsert with only the provided fields.
- [ ] **Step 4: Run** `jest remarks` → pass.
- [ ] **Step 5: Commit** `feat(assessment): term remarks with per-field perms + lock (AC-1)`.

---

### Task 6: Report-card config CRUD

**Files:** Create `report-card-config.controller.ts`, `report-card-config.service.ts`, `dto/report-card-config.dto.ts`; Test `report-card-config.spec.ts`; Modify `assessment.module.ts`.

**Interfaces:** `GET /v1/assessment/report-card-config` (auth) → the school's `ReportCardConfig` (create-on-read with defaults if absent); `PUT …` (perm `school.manage`) updates `{ layout, showSkills, showAttendance, showRemarks, showGradingKey, showPosition, nextTermBegins? }`. `layout` must be one of `["classic","modern","compact"]` (400 otherwise).

- [ ] **Step 1: Failing test** — GET creates+returns defaults (`layout:"classic"`, all flags true); PUT updates flags + valid layout; invalid layout → `BadRequestException`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** (get-or-create by `schoolId`; validate layout enum).
- [ ] **Step 4: Run** `jest report-card-config` → pass.
- [ ] **Step 5: Commit** `feat(assessment): report-card config CRUD (AC-1)`.

---

### Task 7: Report-card payload composition

**Files:** Modify `report-card.service.ts` (+ its spec); read the existing `getReportCard` first.

**Interfaces:** Extend `getReportCard(studentId, termId)` to ALSO return (alongside the existing scores/subjects/average/position):
`skills: { domain: string; items: { name: string; value: number | null }[] }[]`,
`scaleKey: { value: number; label: string }[]`,
`remarks: { formTeacher: string | null; principal: string | null }`,
`attendance: { present: number; absent: number; total: number }`,
`config: ReportCardConfig`,
`school: { name, logoUrl, motto, principalSignatureUrl }` (logo/signature signed via storage).

- [ ] **Step 1: Failing test** — seed a released student with scores + skill ratings + remarks + attendance records; assert the payload groups skills by domain (with the scale key), includes both remarks, the attendance counts (present/absent/total derived from the attendance records for that student+term), and the school's config. Find the attendance model via `grep -n "model Attendance" apps/api/prisma/schema.prisma` and count present/absent for the term's date range or term link.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** the composition (parallel queries; reuse existing score/grade/position logic untouched; attendance counts from the attendance records; sign logo/signature). Respect nothing config-wise here (the payload always includes the data; the WEB hides sections per `config` — but include `config` so the renderer/pdf can honor it).
- [ ] **Step 4: Run** `jest report-card.service --runInBand` → pass.
- [ ] **Step 5: Commit** `feat(assessment): compose skills/remarks/attendance/key into report card (AC-1)`.

---

### Task 8: PDF endpoint (`@react-pdf/renderer`, classic layout)

**Files:** Add dep; Create `report-card-pdf.tsx`, `report-card-pdf.controller.ts`; Modify `assessment.module.ts`; Test `report-card-pdf.spec.ts`.

**Interfaces:** `GET /v1/assessment/report-card.pdf?studentId=&termId=` (perm `results.release`) → streams `application/pdf`, `Content-Disposition: attachment; filename="report-card-<admissionNo>-<term>.pdf"`. Built from the Task 7 payload via a `ReportCardPdf` `@react-pdf` document (classic layout: header w/ logo + school name + motto, student info, subjects table with totals/grades/position, skills sections w/ scale key, attendance summary, remarks, signature).

- [ ] **Step 1: Add dep** — `pnpm --filter @mymakaranta/api add @react-pdf/renderer && pnpm audit`.
- [ ] **Step 2: Failing test** — `report-card-pdf.spec.ts`: build the PDF buffer for a seeded released student via the service helper `renderReportCardPdf(payload): Promise<Buffer>` and assert it starts with the `%PDF` magic bytes and length > 1000.

```typescript
it("renders a non-empty PDF", async () => {
  const buf = await renderReportCardPdf(samplePayload);
  expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  expect(buf.length).toBeGreaterThan(1000);
});
```

- [ ] **Step 3: Implement** `report-card-pdf.tsx` (the `ReportCardPdf` component + `renderReportCardPdf` using `@react-pdf/renderer`'s `renderToBuffer`/`renderToStream`) and the controller (calls `getReportCard` then streams). Note: `.tsx` in the API needs the existing TS/JSX config to allow it — if the api tsconfig lacks `"jsx"`, set `"jsx": "react-jsx"` in `tsconfig.json` (and confirm `tsconfig.build.json` still excludes specs). Keep the PDF component OUT of any `prisma/` import path.
- [ ] **Step 4: Run** `jest report-card-pdf --runInBand` → pass; also `pnpm exec nest build` and confirm `find dist -maxdepth 1 -name main.js` still finds `dist/main.js` (the new `.tsx` must not break the build output path).
- [ ] **Step 5: Commit** `feat(assessment): downloadable report-card PDF (classic) (AC-1)`.

---

### Task 9: Web — skills config + report-card config screens

**Files:** Create `apps/web/src/app/(app)/settings/skills/page.tsx`, `settings/report-card/page.tsx`; Modify `apps/web/src/lib/api.ts`, and the Settings index to link them.

**Interfaces:** `lib/api.ts` helpers for the Task 3 + Task 6 endpoints. Pages use `@mymakaranta/ui` + `PageContainer/PageHeader` (existing pattern).

- [ ] **Step 1:** add api helpers (`getSkillConfig`, `createSkillDomain`, `updateSkillItem`, `setSkillScale`, `getReportCardConfig`, `putReportCardConfig`, …).
- [ ] **Step 2:** build **Skills config** (list domains with their items; add/rename/reorder/remove items + domains; edit the scale labels) and **Report-card config** (section toggle switches + a layout radio: classic/modern/compact + a small static preview thumbnail per layout). Reuse existing Settings page styling.
- [ ] **Step 3: Verify** `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `next lint` (no errors).
- [ ] **Step 4: Commit** `feat(web): skills + report-card config screens (AC-1)`.

---

### Task 10: Web — skills entry grid + remarks

**Files:** Create `apps/web/src/app/(app)/skills/page.tsx`; Modify `apps/web/src/app/(app)/review/page.tsx`, `lib/api.ts`, and the app nav (`(app)/layout.tsx` Academics section: add "Skills" gated `skills.record`).

**Interfaces:** `getSkillsGrid(classId,termId)`, `saveSkillRatings(...)`, `getRemarks/putRemarks` in `lib/api.ts`.

- [ ] **Step 1:** add api helpers.
- [ ] **Step 2:** build the **Skills entry** page: class + term selectors (like gradebook), a matrix of students × skill items (a `<select>`/segmented 1..scaleMax per cell), a per-student form-remark textarea, a Save button; render a read-only "Released — locked" banner when `grid.locked`. Add a **Skills** nav item under Academics (perm `skills.record`).
- [ ] **Step 3:** in the **Review** screen, add a **principal remark** textarea per student (gated `results.review`) saving via `putRemarks`.
- [ ] **Step 4: Verify** web `tsc --noEmit` (0) + `next lint`.
- [ ] **Step 5: Commit** `feat(web): skills entry grid + form/principal remarks (AC-1)`.

---

### Task 11: Web — report-card render (3 layouts, print + PDF)

**Files:** Create/Modify `apps/web/src/app/(app)/report-card/[studentId]/page.tsx`; Modify `lib/api.ts`.

**Interfaces:** `getReportCard(studentId, termId)` (Task 7 payload). Print via `window.print()`; Download PDF via the Task 8 endpoint (`GET …/report-card.pdf` → open/download).

- [ ] **Step 1:** add `getReportCard` helper + a `reportCardPdfUrl(studentId,termId)` builder.
- [ ] **Step 2:** build the render: an A4 print-ready card honoring `config` (hide sections per flags) with three layout variants (`classic/modern/compact`) selected by `config.layout`; sections = header (logo/school/motto/term) · student info · subjects table (CA/exam breakdown, total, grade, position) · affective + psychomotor skills (with scale key) · attendance summary · remarks (form + principal) · signature. Add `@media print` CSS for clean A4. Toolbar: **Print** + **Download PDF** (auth'd fetch of the pdf endpoint → blob download).
- [ ] **Step 3: Verify** web `tsc --noEmit` (0) + `next lint`.
- [ ] **Step 4: Commit** `feat(web): print-ready report card (3 layouts) + PDF download (AC-1)`.

---

### Task 12: Regression gate

- [ ] `DATABASE_URL=... pnpm --filter @mymakaranta/api exec prisma migrate reset --force` → `tsc --noEmit` (0) → `jest --runInBand` (all pass) → `nest build` then confirm `dist/main.js` exists.
- [ ] `pnpm --filter @mymakaranta/web exec tsc --noEmit` (0) + `vitest run` + `next lint`.
- [ ] Commit (`--allow-empty`): `test: AC-1 regression gate green`.

---

## Self-Review

**Spec coverage:** models (T1) ✓ · seeded defaults + `skills.record` (T2) ✓ · skill config CRUD + lock util (T3) ✓ · skills grid + ratings + lock (T4) ✓ · form/principal remarks + per-field perms + lock (T5) ✓ · report-card config (T6) ✓ · payload composition incl. skills/remarks/attendance/key (T7) ✓ · PDF classic (T8) ✓ · config screens (T9) ✓ · skills entry + remarks UI (T10) ✓ · report-card render 3 layouts + print + PDF (T11) ✓ · gate (T12) ✓.

**Placeholder scan:** Tasks 3/9/10/11 describe UI/config steps without full code — they point to exact endpoints + existing patterns (gradebook, Settings, PageHeader) the implementer reads; API logic tasks (1,2,4,5,6,7,8) carry concrete code/tests. Acceptable for web tasks in an established codebase; the reviewer enforces real assertions.

**Type consistency:** `assertNotReleased(prisma,classId,termId)` (T3) used by T4/T5; `skills/grid` + `PUT skills` shapes (T4) consumed by T10; `getReportCard` payload (T7) consumed by T8 (PDF) + T11 (render); `report-card-config` shape (T6) consumed by T7/T9/T11; `skills.record` perm (T2) gates T4/T5/T10.

**Risks:** the only schema-touching change is additive (T1); release/score/correction logic is untouched. `@react-pdf/renderer` + `.tsx` in the API needs `jsx` in tsconfig — T8 handles it and re-verifies the build emits `dist/main.js` (the P4 hotfix invariant).
