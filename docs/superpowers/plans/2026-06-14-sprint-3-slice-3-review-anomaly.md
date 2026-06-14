# Review Sheets & Anomaly Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only review sheets — form-teacher class-master (students × subjects) and HOD subject-master (subject across parallel classes, with drift) — that surface anomalous scores (>2σ from the subject-term mean), all computed on read.

**Architecture:** Extends the `assessment` NestJS module with a pure `anomaly.util` (mean/σ/z) + a `review` service/controller exposing two read endpoints (`results.review`). No new model; raw `Score` is the source of truth. Web adds a `/review` two-mode page + api client.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest e2e (service-level) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-sprint-3-slice-3-review-anomaly-design.md`

**Branch:** `sprint-3-review-anomaly` (already created).

**KEY CONVENTIONS (from slices 1–2):** explicitly scope every read by `schoolId` via `TenantContext.schoolIdOrThrow()` + `where:{schoolId}` (middleware unreliable in tx/test); validate request ids via tenant-scoped `findFirst` (IDOR); `Enrollment` has no `schoolId` (gate via class check); e2e is service-level inside `TenantContext.run`; `noUncheckedIndexedAccess` on (`?.`/`!`).

---

## File Structure
- Create: `apps/api/src/modules/assessment/anomaly.util.ts` + `anomaly.util.spec.ts`
- Create: `apps/api/src/modules/assessment/review.service.ts` + `review.controller.ts`
- Modify: `apps/api/src/modules/assessment/assessment.module.ts`, `apps/api/test/assessment.e2e-spec.ts`
- Create: `apps/web/src/app/(app)/review/page.tsx`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`

---

## Task 1: anomaly.util (pure stats)

**Files:** Create `apps/api/src/modules/assessment/anomaly.util.ts`, `anomaly.util.spec.ts`

- [ ] **Step 1: Write failing test** — `anomaly.util.spec.ts`:
```ts
import { flagAnomalies } from "./anomaly.util";

describe("flagAnomalies", () => {
  it("flags a value > 2σ from the mean", () => {
    // 9 around 50, one at 95 → outlier
    const totals = [
      { studentId: "a", total: 50 }, { studentId: "b", total: 52 }, { studentId: "c", total: 48 },
      { studentId: "d", total: 51 }, { studentId: "e", total: 49 }, { studentId: "f", total: 50 },
      { studentId: "g", total: 53 }, { studentId: "h", total: 47 }, { studentId: "x", total: 95 },
    ];
    const m = flagAnomalies(totals);
    expect(m.get("x")?.anomaly).toBe(true);
    expect(m.get("a")?.anomaly).toBe(false);
    expect(m.get("x")!.z).toBeGreaterThan(2);
  });

  it("flags no one when σ is 0 (all equal)", () => {
    const m = flagAnomalies([{ studentId: "a", total: 40 }, { studentId: "b", total: 40 }]);
    expect(m.get("a")?.anomaly).toBe(false);
    expect(m.get("a")?.z).toBe(0);
  });

  it("flags no one when n < 2", () => {
    const m = flagAnomalies([{ studentId: "a", total: 40 }]);
    expect(m.get("a")?.anomaly).toBe(false);
  });

  it("respects a custom threshold", () => {
    const totals = [
      { studentId: "a", total: 10 }, { studentId: "b", total: 12 },
      { studentId: "c", total: 8 }, { studentId: "x", total: 20 },
    ];
    expect(flagAnomalies(totals, 1).get("x")?.anomaly).toBe(true);
  });
});
```

- [ ] **Step 2:** `pnpm exec jest anomaly.util` (from `apps/api`) → FAIL (no module).

- [ ] **Step 3: Implement `anomaly.util.ts`:**
```ts
export interface StudentTotal {
  studentId: string;
  total: number;
}

export interface AnomalyInfo {
  z: number;
  anomaly: boolean;
}

/**
 * Flag student totals that deviate more than `threshold` population standard
 * deviations from the cohort mean. Returns a map studentId → { z, anomaly }.
 * Guards: n < 2 or σ = 0 → all z = 0, anomaly = false (no false flags on tiny
 * or uniform cohorts).
 */
export function flagAnomalies(
  totals: StudentTotal[],
  threshold = 2,
): Map<string, AnomalyInfo> {
  const out = new Map<string, AnomalyInfo>();
  const n = totals.length;
  if (n < 2) {
    for (const t of totals) out.set(t.studentId, { z: 0, anomaly: false });
    return out;
  }
  const mean = totals.reduce((s, t) => s + t.total, 0) / n;
  const variance = totals.reduce((s, t) => s + (t.total - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  for (const t of totals) {
    const z = sigma === 0 ? 0 : (t.total - mean) / sigma;
    out.set(t.studentId, { z, anomaly: Math.abs(z) > threshold });
  }
  return out;
}
```

- [ ] **Step 4:** `pnpm exec jest anomaly.util` → PASS (4).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/assessment/anomaly.util.ts apps/api/src/modules/assessment/anomaly.util.spec.ts
git commit -m "feat(assessment): anomaly.util (mean/sigma/z flagging)"
```

---

## Task 2: Review service + controller + e2e

**Files:** Create `review.service.ts`, `review.controller.ts`; modify `assessment.module.ts`, `test/assessment.e2e-spec.ts`

- [ ] **Step 1: Write the failing e2e.** In `apps/api/test/assessment.e2e-spec.ts`: import `ReviewService` from `../src/modules/assessment/review.service`; declare `let review: ReviewService;`; in the top-level `beforeAll` add `review = moduleRef.get(ReviewService);`. Add a `describe("review", ...)` INSIDE the top-level describe. It builds its own fixtures (a fresh term + subject + 2 classes + students + scores with one outlier and a class-mean drift), reusing `schoolId`/`academicYearId` and the school's assessment types (set earlier by the `scores` describe). Use:
```ts
  describe("review", () => {
    let rTerm: string;
    let phys: string;
    let caId: string;
    let examId: string;
    let classA: string;
    let classB: string;

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 2, startDate: new Date("2025-01-01"), endDate: new Date("2025-04-01"), isCurrent: false } });
      rTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Physics", code: `PHY-${suffix}` } });
      phys = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `JSS2-${suffix}`, order: 2 } });
      const ca = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS2A-${suffix}` } });
      const cb = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS2B-${suffix}` } });
      classA = ca.id; classB = cb.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `R-${suffix}`, firstName: "Rev", lastName: "Teacher", email: `r${suffix}@s.test`, phone: "+2348000000111" } });
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId, subjectId: phys, classId: classA, staffId: staff.id, academicYearId },
        { schoolId, subjectId: phys, classId: classB, staffId: staff.id, academicYearId },
      ] });
      // assessment types already exist for school A (set by the scores describe): CA1=30, Exam=70.
      const t = await asA(() => types.list());
      caId = t.find((x) => x.name === "CA1")!.id;
      examId = t.find((x) => x.name === "Exam")!.id;

      // Deterministic cohort designed so the outlier is genuinely >2σ from the
      // SUBJECT-wide mean AND classA mean stays above classB. (CA1 max 30, Exam max 70.)
      // classA non-outliers cluster ~90; classA has one low outlier (20); classB clusters ~60.
      // Cohort totals: 90,92,91,89,88,20,60,62,61,59 → mean 71.2, σ ≈ 22.0; z(20) ≈ -2.3 (flagged).
      // classA mean ≈ 78.3 (> classB 60.5); classA drift +, classB drift −.
      const mk = async (cls: string, label: string, ca: number, exam: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "Test", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: rTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: phys, termId: rTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: ca },
          { studentId: st.id, assessmentTypeId: examId, value: exam },
        ] }, "rev"));
        return st.id;
      };
      await mk(classA, "A1", 28, 62); // 90
      await mk(classA, "A2", 30, 62); // 92
      await mk(classA, "A3", 29, 62); // 91
      await mk(classA, "A4", 27, 62); // 89
      await mk(classA, "A5", 26, 62); // 88
      await mk(classA, "OUT", 10, 10); // 20 — low outlier in classA
      await mk(classB, "B1", 20, 40); // 60
      await mk(classB, "B2", 22, 40); // 62
      await mk(classB, "B3", 21, 40); // 61
      await mk(classB, "B4", 19, 40); // 59
    });

    it("class-master returns a student×subject matrix with totals, grades, average, anomaly", async () => {
      const sheet = await asA(() => review.classMaster(classA, rTerm));
      expect(sheet.subjects.some((s) => s.id === phys)).toBe(true);
      const out = sheet.students.find((s) => s.name.startsWith("OUT"))!;
      expect(out.perSubject[phys]!.total).toBe(20);
      expect(out.perSubject[phys]!.anomaly).toBe(true); // > 2σ below the Physics cohort mean
      expect(typeof out.average).toBe("number");
      const a1 = sheet.students.find((s) => s.name.startsWith("A1"))!;
      expect(a1.perSubject[phys]!.anomaly).toBe(false);
    });

    it("subject-master returns per-class means, subject stats, drift, and flags the outlier", async () => {
      const sheet = await asA(() => review.subjectMaster(phys, rTerm));
      expect(sheet.classes.length).toBe(2);
      const a = sheet.classes.find((c) => c.classId === classA)!;
      const b = sheet.classes.find((c) => c.classId === classB)!;
      expect(a.mean).toBeGreaterThan(b.mean);          // classA higher
      expect(a.drift).toBeGreaterThan(0);              // above subject mean
      expect(b.drift).toBeLessThan(0);                 // below subject mean
      expect(a.students.find((s) => s.name.startsWith("OUT"))!.anomaly).toBe(true);
      expect(sheet.subjectStdDev).toBeGreaterThan(0);
    });

    it("rejects a foreign classId/subjectId (cross-tenant)", async () => {
      await expect(asB(() => review.classMaster(classA, rTerm))).rejects.toThrow(NotFoundException);
      await expect(asB(() => review.subjectMaster(phys, rTerm))).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run e2e** → FAIL (ReviewService missing).

- [ ] **Step 3: Implement `review.service.ts`:**
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { flagAnomalies, type AnomalyInfo } from "./anomaly.util";

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  // Build the (subject, term) cohort anomaly map: studentId → {z, anomaly}, over ALL
  // enrolled students' subject totals across every class that term. typeIds = school types.
  private async cohort(schoolId: string, subjectId: string, termId: string, typeIds: string[]) {
    const rows = await this.prisma.score.findMany({ where: { schoolId, subjectId, termId } });
    const byStudent = new Map<string, { assessmentTypeId: string; value: number }[]>();
    for (const r of rows) {
      const a = byStudent.get(r.studentId) ?? [];
      a.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
      byStudent.set(r.studentId, a);
    }
    const totals = [...byStudent.entries()].map(([studentId, cells]) => ({
      studentId,
      total: computeSubjectResult(cells, typeIds, []).total,
    }));
    return { totals, anomalies: flagAnomalies(totals) };
  }

  async classMaster(classId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [klass, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");

    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const typeIds = types.map((t) => t.id);
    const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });

    const assignments = await this.prisma.subjectAssignment.findMany({
      where: { classId, academicYearId: term.academicYearId },
      include: { subject: { select: { id: true, name: true } } },
    });
    const subjects = assignments.map((a) => ({ id: a.subjectId, name: a.subject.name }));

    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, termId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    // Per-subject cohort maps + this class's score rows for each subject.
    const cohortBySubject = new Map<string, Map<string, AnomalyInfo>>();
    const cellsBySubjectStudent = new Map<string, Map<string, { assessmentTypeId: string; value: number }[]>>();
    for (const s of subjects) {
      const { anomalies } = await this.cohort(schoolId, s.id, termId, typeIds);
      cohortBySubject.set(s.id, anomalies);
      const rows = await this.prisma.score.findMany({ where: { schoolId, subjectId: s.id, termId, studentId: { in: studentIds } } });
      const byStudent = new Map<string, { assessmentTypeId: string; value: number }[]>();
      for (const r of rows) {
        const a = byStudent.get(r.studentId) ?? [];
        a.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
        byStudent.set(r.studentId, a);
      }
      cellsBySubjectStudent.set(s.id, byStudent);
    }

    const students = enrollments.map((e) => {
      const perSubject: Record<string, { total: number; grade: string | null; complete: boolean; anomaly: boolean }> = {};
      const totals: number[] = [];
      for (const s of subjects) {
        const cells = cellsBySubjectStudent.get(s.id)?.get(e.studentId) ?? [];
        if (cells.length === 0) continue;
        const r = computeSubjectResult(cells, typeIds, boundaries);
        perSubject[s.id] = {
          total: r.total,
          grade: r.grade,
          complete: r.complete,
          anomaly: cohortBySubject.get(s.id)?.get(e.studentId)?.anomaly ?? false,
        };
        totals.push(r.total);
      }
      const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      return { studentId: e.studentId, name: `${e.student.firstName} ${e.student.lastName}`, perSubject, average };
    });

    return { subjects, students };
  }

  async subjectMaster(subjectId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [subject, term] = await Promise.all([
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");

    const types = await this.prisma.assessmentType.findMany({ where: { schoolId } });
    const typeIds = types.map((t) => t.id);
    const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });

    const { totals, anomalies } = await this.cohort(schoolId, subjectId, termId, typeIds);
    const totalByStudent = new Map(totals.map((t) => [t.studentId, t.total]));
    const subjectMean = totals.length ? totals.reduce((a, t) => a + t.total, 0) / totals.length : 0;
    const subjectStdDev = totals.length
      ? Math.sqrt(totals.reduce((a, t) => a + (t.total - subjectMean) ** 2, 0) / totals.length)
      : 0;

    // Classes offering this subject this year, that have enrollments this term.
    const assignments = await this.prisma.subjectAssignment.findMany({
      where: { subjectId, academicYearId: term.academicYearId },
      include: { class: { select: { id: true, name: true } } },
    });
    const classes = [];
    for (const a of assignments) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { classId: a.classId, termId },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (enrollments.length === 0) continue;
      const students = enrollments.map((e) => {
        const total = totalByStudent.get(e.studentId) ?? 0;
        const grade = computeSubjectResult(
          [{ assessmentTypeId: "_", value: total }], // total is already summed; map via boundaries directly
          ["_"], boundaries,
        ).grade;
        const info = anomalies.get(e.studentId);
        return { studentId: e.studentId, name: `${e.student.firstName} ${e.student.lastName}`, total, grade, z: info?.z ?? 0, anomaly: info?.anomaly ?? false };
      });
      const enrolledTotals = students.map((s) => s.total);
      const mean = enrolledTotals.length ? enrolledTotals.reduce((x, y) => x + y, 0) / enrolledTotals.length : 0;
      classes.push({ classId: a.classId, name: a.class.name, mean, drift: mean - subjectMean, students });
    }

    return { subjectMean, subjectStdDev, classes };
  }
}
```
(NOTE on the grade-for-total trick: `computeSubjectResult([{assessmentTypeId:"_",value:total}], ["_"], boundaries)` sums to `total` then resolves the band — a clean reuse of the resolver without re-summing. The `_` type id is a throwaway; total is the real input.)

- [ ] **Step 4: Implement `review.controller.ts`:**
```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReviewService } from "./review.service";

@Controller("v1/assessment/review")
export class ReviewController {
  constructor(private service: ReviewService) {}

  @Get("class-master")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.review")
  classMaster(@Query("classId") classId: string, @Query("termId") termId: string) {
    return this.service.classMaster(classId, termId);
  }

  @Get("subject-master")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.review")
  subjectMaster(@Query("subjectId") subjectId: string, @Query("termId") termId: string) {
    return this.service.subjectMaster(subjectId, termId);
  }
}
```

- [ ] **Step 5: Register** in `assessment.module.ts` — import `ReviewService` + `ReviewController`; add to `providers`/`controllers`.

- [ ] **Step 6:** `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment` → ALL pass (slice 1+2 + 3 new review tests). Then `pnpm --filter @mymakaranta/api build` + typecheck → clean.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/assessment/review.service.ts apps/api/src/modules/assessment/review.controller.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): class-master + subject-master review sheets with anomaly flags"
```

---

## Task 3: Web api client — review

**Files:** Modify `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add types** (near the other assessment interfaces):
```ts
export interface ClassMasterSheet {
  subjects: Array<{ id: string; name: string }>;
  students: Array<{
    studentId: string;
    name: string;
    perSubject: Record<string, { total: number; grade: string | null; complete: boolean; anomaly: boolean }>;
    average: number;
  }>;
}

export interface SubjectMasterSheet {
  subjectMean: number;
  subjectStdDev: number;
  classes: Array<{
    classId: string;
    name: string;
    mean: number;
    drift: number;
    students: Array<{ studentId: string; name: string; total: number; grade: string | null; z: number; anomaly: boolean }>;
  }>;
}
```

- [ ] **Step 2: Add methods** inside the `api` object:
```ts
  getClassMaster: (classId: string, termId: string) =>
    authedRequest<ClassMasterSheet>(`/v1/assessment/review/class-master?classId=${classId}&termId=${termId}`),
  getSubjectMaster: (subjectId: string, termId: string) =>
    authedRequest<SubjectMasterSheet>(`/v1/assessment/review/subject-master?subjectId=${subjectId}&termId=${termId}`),
```

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(assessment): web api client for review sheets"
```

---

## Task 4: Review page + nav

**Files:** Create `apps/web/src/app/(app)/review/page.tsx`; modify `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Nav.** In `layout.tsx`: add `BarChart3` to the `lucide-react` import block; add to `NAV_ITEMS` after the `/gradebook` entry:
```ts
  { href: "/review", label: "Review", icon: BarChart3 },
```

- [ ] **Step 2: Create `apps/web/src/app/(app)/review/page.tsx`** (read `apps/web/src/app/(app)/gradebook/page.tsx` for the term/class/subject selector + ui-import patterns; align `@mymakaranta/ui` imports to real exports). Full implementation:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, EmptyState, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type Class,
  type AcademicYear,
  type ClassMasterSheet,
  type SubjectMasterSheet,
  type SubjectAssignment,
} from "@/lib/api";
import { BarChart3 } from "lucide-react";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ReviewPage() {
  const [mode, setMode] = useState<"class" | "subject">("class");
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [subjectOpts, setSubjectOpts] = useState<Array<{ id: string; name: string }>>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const [classSheet, setClassSheet] = useState<ClassMasterSheet | null>(null);
  const [subjectSheet, setSubjectSheet] = useState<SubjectMasterSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cs, yrs] = await Promise.all([api.listClasses(), api.listAcademicYears()]);
      setClasses(cs);
      setYears(yrs);
      if (cs[0]) setClassId(cs[0].id);
      const ts: TermOpt[] = yrs.flatMap((y) =>
        (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })));
      setTerms(ts);
      const cur = ts.find((t) => t.isCurrent) ?? ts[0];
      if (cur) setTermId(cur.id);
    })();
  }, []);

  // Subject options across the whole school (for subject-master) for the term's year.
  useEffect(() => {
    if (!termId) return;
    void (async () => {
      const year = years.find((y) => (y.terms ?? []).some((t) => t.id === termId));
      if (!year) { setSubjectOpts([]); return; }
      // Distinct subjects assigned anywhere this year: gather from all classes' assignments.
      const all: SubjectAssignment[] = (
        await Promise.all(classes.map((c) => api.listSubjectAssignments(c.id, year.id)))
      ).flat();
      const seen = new Map<string, string>();
      for (const a of all) if (a.subject) seen.set(a.subject.id, a.subject.name);
      const opts = [...seen].map(([id, name]) => ({ id, name }));
      setSubjectOpts(opts);
      if (opts[0]) setSubjectId(opts[0].id);
    })();
  }, [termId, years, classes]);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "class") {
        if (!classId) return;
        setClassSheet(await api.getClassMaster(classId, termId));
      } else {
        if (!subjectId) return;
        setSubjectSheet(await api.getSubjectMaster(subjectId, termId));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the sheet.");
    } finally {
      setLoading(false);
    }
  }, [mode, classId, subjectId, termId]);
  useEffect(() => { void load(); }, [load]);

  const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small";

  return (
    <div className="px-4 py-8 mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Review</h1>
        <p className="text-small text-ink-500">Class-master and subject-master sheets with anomaly flags.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex rounded-input border border-ink-300 dark:border-white/15 overflow-hidden">
          <button onClick={() => setMode("class")} className={cn("px-3 h-9 text-small", mode === "class" ? "bg-primary text-white" : "text-ink-700")}>Class master</button>
          <button onClick={() => setMode("subject")} className={cn("px-3 h-9 text-small", mode === "subject" ? "bg-primary text-white" : "text-ink-700")}>Subject master</button>
        </div>
        <label className="text-small text-ink-500 flex flex-col gap-1">Term
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={cls}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {mode === "class" ? (
          <label className="text-small text-ink-500 flex flex-col gap-1">Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={cls}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-small text-ink-500 flex flex-col gap-1">Subject
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cls}>
              {subjectOpts.length === 0 && <option value="">No subjects</option>}
              {subjectOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="mb-4 text-small text-error">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : mode === "class" ? (
        !classSheet || classSheet.students.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="Nothing to review" description="No students or scores for this class and term." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small border-collapse">
              <thead><tr className="text-left text-ink-500">
                <th className="py-2 pr-3 font-medium">Student</th>
                {classSheet.subjects.map((s) => <th key={s.id} className="py-2 px-2 font-medium text-center">{s.name}</th>)}
                <th className="py-2 px-2 font-medium text-center">Avg</th>
              </tr></thead>
              <tbody>
                {classSheet.students.map((st) => (
                  <tr key={st.studentId} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{st.name}</td>
                    {classSheet.subjects.map((s) => {
                      const cell = st.perSubject[s.id];
                      return (
                        <td key={s.id} className={cn("py-1.5 px-2 text-center", cell?.anomaly && "bg-warning/15 rounded")}>
                          {cell ? <span className="tabular-nums">{cell.total}{cell.grade ? ` (${cell.grade})` : ""}</span> : <span className="text-ink-400">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center tabular-nums font-medium">{st.average}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        !subjectSheet || subjectSheet.classes.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="Nothing to review" description="No classes or scores for this subject and term." />
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-small text-ink-500 tabular-nums">Subject mean {subjectSheet.subjectMean.toFixed(1)} · σ {subjectSheet.subjectStdDev.toFixed(1)}</p>
            {subjectSheet.classes.map((c) => (
              <div key={c.classId}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">{c.name}</span>
                  <span className="text-caption text-ink-500 tabular-nums">mean {c.mean.toFixed(1)}</span>
                  <Badge tone={c.drift >= 0 ? "success" : "warning"}>{c.drift >= 0 ? "+" : ""}{c.drift.toFixed(1)} vs subject</Badge>
                </div>
                <table className="w-full text-small border-collapse">
                  <thead><tr className="text-left text-ink-500"><th className="py-1 pr-3 font-medium">Student</th><th className="py-1 px-2 font-medium text-center">Total</th><th className="py-1 px-2 font-medium text-center">Grade</th><th className="py-1 px-2 font-medium text-center">z</th></tr></thead>
                  <tbody>
                    {c.students.map((s) => (
                      <tr key={s.studentId} className={cn("border-t border-ink-100 dark:border-white/10", s.anomaly && "bg-warning/15")}>
                        <td className="py-1.5 pr-3 whitespace-nowrap text-ink-1000 dark:text-ink-100">{s.name}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{s.total}</td>
                        <td className="py-1.5 px-2 text-center">{s.grade ? <Badge tone="info">{s.grade}</Badge> : <span className="text-ink-400">—</span>}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{s.z.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; `/review` builds. Align `@mymakaranta/ui` import names to real exports if any differ. If `bg-primary`/`text-primary` aren't valid tokens, use the equivalent the codebase uses for the active toggle (check `layout.tsx` active nav styling — it uses a brand color class; mirror it).

- [ ] **Step 4: Commit**
```bash
git add "apps/web/src/app/(app)/review/page.tsx" "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(assessment): review sheets page (class-master + subject-master) + nav"
```

---

## Task 5: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook). Start API + web. Seed a fresh school: year + current term, 2 classes (JSS2A/JSS2B), 1 subject (Physics) assigned to both, ~3 students each enrolled, assessment types (CA1/Exam summing 100) + WAEC boundaries; enter scores via `/gradebook` so classA mean > classB mean and one classA student is a low outlier. Then `/review`: Class master (classA) → matrix shows totals/grades + average, the outlier cell highlighted. Subject master (Physics) → two class sections, classA mean > classB, drift badges (+/−), subject mean/σ header, outlier row highlighted. Verify against `GET /v1/assessment/review/*`. Fix any seam bug (`fix(qa):` commit). Record in `.gstack/qa-reports/` (gitignored). (Gotchas: warm a new route before auth_goto; re-inject `mm.token`/`mm.user`; stop web dev before any prod build.)

- [ ] **Step 2: Update `docs/RESUME.md`** — Current state: slice 3 (review + anomaly) built + QA'd; remaining slices 4–6; bump counts. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify e2e + builds, merge `sprint-3-review-anomaly` → main).

---

## Notes for the implementer
- **Explicit `schoolId` scoping** on every read (slice-1 learning). `Enrollment` reads gated by the class/subject ownership check.
- **e2e is service-level** (`TenantContext.run`); the `review` describe builds its own term/subject/classes/students/scores, reusing the school's already-set assessment types (CA1/Exam) + boundaries from the `scores` describe.
- **`computeSubjectResult` grade-for-total reuse:** `computeSubjectResult([{assessmentTypeId:"_",value:total}], ["_"], boundaries).grade` resolves a band from an already-summed total without re-summing.
- **`noUncheckedIndexedAccess`** — `?.`/`!` on `arr[0]`, `t.find(...)!`, `cell?.anomaly`, `st.perSubject[s.id]`.
- **Don't run `next build` while `next dev` is up**; stop dev servers before API `prisma`/builds.
- **`@mymakaranta/ui` / token classes** — confirm `Badge`/`Spinner`/`EmptyState`/`cn` + the active-toggle color class against `gradebook/page.tsx` + `layout.tsx` before using.
