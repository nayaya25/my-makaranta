# Principal Operational Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A principal opens `/dashboard` and sees a dense per-class table for the current term — attendance %, results submission coverage (+ released), and per-class fee collection — to know which form teachers to chase today.

**Architecture:** Extend the slice-1 `apps/api/src/modules/dashboard/` module with `DashboardService.getPrincipalSummary(termId?)` (batched, tenant-scoped reads assembled in JS — no N+1) + a `GET /v1/dashboard/principal` route. Add one pure helper `feePaidRate`. Web: role-aware `/dashboard` renders a `PrincipalDashboardView` for non-proprietor staff, with a 403→quick-links-stub fallback. No new model, no migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts`).

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-5-slice-2-principal-dashboard-design.md`

**Branch:** `sprint-5-principal-dashboard` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping on every read; foreign termId → 404; batched queries (no per-class loop); e2e service-level inside `TenantContext.run` (model on `test/dashboard.e2e-spec.ts` from slice 1); unit specs co-located `src/**/*.spec.ts`; money kobo Int; rates are 0..1 fractions (web formats `%`); `noUncheckedIndexedAccess`. Reuse `attendanceRate` (slice 1). `reports.view` is seeded + proprietor-granted. The term-resolution code path is identical to `getProprietorSummary` (slice 1, already tested).

---

## File Structure
- Modify: `apps/api/src/modules/dashboard/dashboard.util.ts` (+`feePaidRate`), `dashboard.util.spec.ts` (+tests), `dashboard.service.ts` (+`getPrincipalSummary`), `dashboard.controller.ts` (+route); `apps/api/test/dashboard.e2e-spec.ts` (+`principal summary` describe)
- Modify: `apps/web/src/lib/api.ts` (type + method); create `apps/web/src/app/(app)/dashboard/principal-dashboard.tsx`; modify `apps/web/src/app/(app)/dashboard/page.tsx` (staff branch)

---

## Task 1: API — `feePaidRate` helper + unit tests

**Files:** Modify `apps/api/src/modules/dashboard/dashboard.util.ts`, `apps/api/src/modules/dashboard/dashboard.util.spec.ts`

- [ ] **Step 1: Add failing unit tests** — append to `apps/api/src/modules/dashboard/dashboard.util.spec.ts`:
```ts
import { attendanceRate, pickTopClass, feePaidRate } from "./dashboard.util";

describe("feePaidRate", () => {
  it("returns the collected/expected ratio", () => {
    expect(feePaidRate(9000000, 12000000)).toBe(0.75);
  });
  it("returns 0 (not NaN) when nothing is expected", () => {
    expect(feePaidRate(0, 0)).toBe(0);
  });
  it("can exceed 1 on overpayment (credit)", () => {
    expect(feePaidRate(12000000, 10000000)).toBe(1.2);
  });
});
```
(Merge the import line with the existing `import { attendanceRate, pickTopClass } from "./dashboard.util";` at the top — change it to also import `feePaidRate`; do NOT add a duplicate import statement.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/dashboard.util.spec.ts`
Expected: FAIL — `feePaidRate is not a function` / no exported member.

- [ ] **Step 3: Implement** — append to `apps/api/src/modules/dashboard/dashboard.util.ts`:
```ts
export function feePaidRate(collectedKobo: number, expectedKobo: number): number {
  return expectedKobo === 0 ? 0 : collectedKobo / expectedKobo;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/dashboard.util.spec.ts`
Expected: PASS (8 tests total — 5 existing + 3 new).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard/dashboard.util.ts apps/api/src/modules/dashboard/dashboard.util.spec.ts
git commit -m "feat(dashboard): feePaidRate helper"
```

---

## Task 2: API — `getPrincipalSummary` + controller route + e2e

**Files:** Modify `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, `apps/api/test/dashboard.e2e-spec.ts`

- [ ] **Step 1: Write the failing e2e** — in `apps/api/test/dashboard.e2e-spec.ts`, add a new `describe` block INSIDE the top-level `describe("Dashboard (e2e)", ...)` (after the existing `describe("proprietor summary", ...)` block, before the closing of the outer describe). It creates its own school C so the current-term resolution is unambiguous:
```ts
  describe("principal summary", () => {
    let schoolCId: string;
    let termC: string;
    let class1: string;
    let class2: string;
    const asC = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolCId, userId }, fn);

    beforeAll(async () => {
      const c = await prisma.school.create({ data: { name: `Dash C ${suffix}`, slug: `dash-c-${suffix}` } });
      schoolCId = c.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: schoolCId, name: `DashCYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId: schoolCId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termC = term.id;
      const lvl1 = await prisma.classLevel.create({ data: { schoolId: schoolCId, name: `PL1-${suffix}`, order: 1 } });
      const lvl2 = await prisma.classLevel.create({ data: { schoolId: schoolCId, name: `PL2-${suffix}`, order: 2 } });
      const teacher = await prisma.staff.create({ data: { schoolId: schoolCId, staffNo: `PT-${suffix}`, firstName: "Form", lastName: "Teacher", email: `pt-${suffix}@e.test`, phone: `+234900${String(suffix).slice(-7)}` } });
      // class1 has a form teacher; class2 does not. class2 ordered after class1 by level order.
      const c1 = await prisma.class.create({ data: { schoolId: schoolCId, classLevelId: lvl1.id, name: `P1A-${suffix}`, formTeacherId: teacher.id } });
      const c2 = await prisma.class.create({ data: { schoolId: schoolCId, classLevelId: lvl2.id, name: `P1B-${suffix}` } });
      class1 = c1.id; class2 = c2.id;

      const at = await prisma.assessmentType.create({ data: { schoolId: schoolCId, name: `CA-${suffix}`, maxScore: 100, order: 1 } });
      const mkSubj = (n: string) => prisma.subject.create({ data: { schoolId: schoolCId, name: n, code: `${n}-${suffix}` } });
      const subjA = await mkSubj("Maths"); const subjB = await mkSubj("English"); const subjC = await mkSubj("Science");
      const subjD = await mkSubj("Civics"); const subjE = await mkSubj("Arts");
      // class1: 3 subjects offered, 2 scored. class2: 2 subjects offered, 0 scored.
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId: schoolCId, subjectId: subjA.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjB.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjC.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjD.id, classId: class2, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjE.id, classId: class2, staffId: teacher.id, academicYearId: ay.id },
      ] });

      const mkStu = (label: string) => prisma.student.create({ data: { schoolId: schoolCId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "P", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
      const s1 = await mkStu("PS1"); const s2 = await mkStu("PS2"); const s3 = await mkStu("PS3");
      await prisma.enrollment.createMany({ data: [
        { studentId: s1.id, classId: class1, termId: termC },
        { studentId: s2.id, classId: class1, termId: termC },
        { studentId: s3.id, classId: class2, termId: termC },
      ] });

      // class1 scores: subjA + subjB scored (for s1) → 2 distinct subjects. subjC unscored.
      await prisma.score.createMany({ data: [
        { schoolId: schoolCId, studentId: s1.id, subjectId: subjA.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 70, recordedBy: "x" },
        { schoolId: schoolCId, studentId: s1.id, subjectId: subjB.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 60, recordedBy: "x" },
        { schoolId: schoolCId, studentId: s2.id, subjectId: subjA.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 80, recordedBy: "x" },
      ] });

      // class1 released; class2 not.
      const rel = await prisma.release.create({ data: { schoolId: schoolCId, classId: class1, termId: termC, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId: schoolCId, releaseId: rel.id, studentId: s1.id, classId: class1, termId: termC, average: 65, position: 1 } });

      // class1 attendance: s1 6 present + 2 late, s2 1 absent + 1 excused → 8/10 = 0.8.
      const base = new Date("2025-10-01").getTime();
      let day = 0;
      const att = async (sid: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED", n: number) => {
        for (let i = 0; i < n; i++) {
          await prisma.attendanceRecord.create({ data: { schoolId: schoolCId, studentId: sid, classId: class1, date: new Date(base + (day++) * 86400000), status, recordedBy: "x" } });
        }
      };
      await att(s1.id, "PRESENT", 6); await att(s1.id, "LATE", 2); await att(s2.id, "ABSENT", 1); await att(s2.id, "EXCUSED", 1);

      // class1 fees: s1 6,000,000/6,000,000 (paid), s2 6,000,000/3,000,000 (partial) → paidRate 0.75.
      // class2 fees: s3 4,000,000/4,000,000 → paidRate 1.0.
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s1.id, termId: termC, classLevelId: lvl1.id, totalKobo: 6000000, paidKobo: 6000000 } });
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s2.id, termId: termC, classLevelId: lvl1.id, totalKobo: 6000000, paidKobo: 3000000 } });
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s3.id, termId: termC, classLevelId: lvl2.id, totalKobo: 4000000, paidKobo: 4000000 } });
    });

    it("returns per-class rows for the current term (no termId), sorted by level order", async () => {
      const r = await asC(() => dashboard.getPrincipalSummary());
      expect(r.term?.id).toBe(termC);
      expect(r.classes.map((c) => c.classId)).toEqual([class1, class2]); // level order 1 then 2
      const a = r.classes.find((c) => c.classId === class1)!;
      expect(a.formTeacher).toBe("Form Teacher");
      expect(a.results).toEqual({ subjectsScored: 2, subjectsOffered: 3, released: true });
      expect(a.attendance.presentDays).toBe(8);
      expect(a.attendance.totalDays).toBe(10);
      expect(a.attendance.rate).toBeCloseTo(0.8, 5);
      expect(a.fees.expectedKobo).toBe(12000000);
      expect(a.fees.collectedKobo).toBe(9000000);
      expect(a.fees.paidRate).toBeCloseTo(0.75, 5);
      const b = r.classes.find((c) => c.classId === class2)!;
      expect(b.formTeacher).toBeNull();
      expect(b.results).toEqual({ subjectsScored: 0, subjectsOffered: 2, released: false });
      expect(b.attendance.totalDays).toBe(0);
      expect(b.fees.paidRate).toBe(1);
    });

    it("accepts an explicit termId", async () => {
      const r = await asC(() => dashboard.getPrincipalSummary(termC));
      expect(r.classes.length).toBe(2);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getPrincipalSummary(termC))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + [] when the school has no current term", async () => {
      const r = await asB(() => dashboard.getPrincipalSummary());
      expect(r.term).toBeNull();
      expect(r.classes).toEqual([]);
    });
  });
```
(`prisma`, `dashboard`, `suffix`, `userId`, `asB`, `NotFoundException`, `TenantContext` are all already in scope in this file from slice 1. School B has no term seeded — reused for the foreign-term + no-current-term assertions.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: FAIL — `dashboard.getPrincipalSummary is not a function`.

- [ ] **Step 3: Implement the service method** — in `apps/api/src/modules/dashboard/dashboard.service.ts`, update the util import to add `feePaidRate`, then add the method below `getProprietorSummary` (inside the class). Change the existing import line:
```ts
import { attendanceRate, pickTopClass, feePaidRate, type AttendanceCounts, type TopClassRow } from "./dashboard.util";
```
Add the method:
```ts
  async getPrincipalSummary(termId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const now = new Date();

    const term = termId
      ? await this.prisma.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: { select: { name: true } } } })
      : await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, include: { academicYear: { select: { name: true } } } });
    if (termId && !term) throw new NotFoundException("Term not found in this school.");
    if (!term) return { term: null, classes: [] };
    const termHeader = { id: term.id, name: term.academicYear.name, number: term.number };

    const classes = await this.prisma.class.findMany({
      where: { schoolId, enrollments: { some: { termId: term.id } } },
      select: { id: true, name: true, formTeacherId: true, classLevel: { select: { order: true } } },
    });
    if (classes.length === 0) return { term: termHeader, classes: [] };
    const classIds = classes.map((c) => c.id);

    // Form teachers
    const teacherIds = classes.map((c) => c.formTeacherId).filter((x): x is string => !!x);
    const staff = teacherIds.length
      ? await this.prisma.staff.findMany({ where: { schoolId, id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const teacherBy = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

    // Attendance (window = term.startDate .. min(now, term.endDate))
    const windowTo = now < term.endDate ? now : term.endDate;
    const attRows = await this.prisma.attendanceRecord.groupBy({
      by: ["classId", "status"],
      where: { schoolId, classId: { in: classIds }, date: { gte: term.startDate, lte: windowTo } },
      _count: { _all: true },
    });
    const attBy = new Map<string, AttendanceCounts>();
    for (const r of attRows) {
      const c = attBy.get(r.classId) ?? { present: 0, late: 0, absent: 0, excused: 0 };
      const n = r._count._all;
      if (r.status === "PRESENT") c.present += n;
      else if (r.status === "LATE") c.late += n;
      else if (r.status === "ABSENT") c.absent += n;
      else if (r.status === "EXCUSED") c.excused += n;
      attBy.set(r.classId, c);
    }

    // Offered subjects per class (subject assignments this academic year)
    const offered = await this.prisma.subjectAssignment.groupBy({
      by: ["classId"],
      where: { schoolId, classId: { in: classIds }, academicYearId: term.academicYearId },
      _count: { _all: true },
    });
    const offeredBy = new Map(offered.map((o) => [o.classId, o._count._all]));

    // Scored subjects per class (distinct subjectId with >=1 score)
    const scoredRows = await this.prisma.score.findMany({
      where: { schoolId, termId: term.id, classId: { in: classIds } },
      distinct: ["classId", "subjectId"],
      select: { classId: true },
    });
    const scoredBy = new Map<string, number>();
    for (const s of scoredRows) scoredBy.set(s.classId, (scoredBy.get(s.classId) ?? 0) + 1);

    // Released set
    const releases = await this.prisma.release.findMany({ where: { schoolId, termId: term.id, classId: { in: classIds } }, select: { classId: true } });
    const releasedSet = new Set(releases.map((r) => r.classId));

    // Fees per class via enrollment
    const enrollments = await this.prisma.enrollment.findMany({ where: { classId: { in: classIds }, termId: term.id }, select: { studentId: true, classId: true } });
    const classByStudent = new Map(enrollments.map((e) => [e.studentId, e.classId]));
    const studentIds = enrollments.map((e) => e.studentId);
    const invoices = studentIds.length
      ? await this.prisma.invoice.findMany({ where: { schoolId, termId: term.id, studentId: { in: studentIds } }, select: { studentId: true, totalKobo: true, paidKobo: true } })
      : [];
    const feesBy = new Map<string, { expectedKobo: number; collectedKobo: number }>();
    for (const inv of invoices) {
      const cid = classByStudent.get(inv.studentId);
      if (!cid) continue;
      const f = feesBy.get(cid) ?? { expectedKobo: 0, collectedKobo: 0 };
      f.expectedKobo += inv.totalKobo;
      f.collectedKobo += inv.paidKobo;
      feesBy.set(cid, f);
    }

    const sorted = [...classes].sort((a, b) => a.classLevel.order - b.classLevel.order || a.name.localeCompare(b.name));
    const rows = sorted.map((c) => {
      const counts = attBy.get(c.id) ?? { present: 0, late: 0, absent: 0, excused: 0 };
      const fee = feesBy.get(c.id) ?? { expectedKobo: 0, collectedKobo: 0 };
      return {
        classId: c.id,
        className: c.name,
        formTeacher: c.formTeacherId ? (teacherBy.get(c.formTeacherId) ?? null) : null,
        attendance: attendanceRate(counts),
        results: { subjectsScored: scoredBy.get(c.id) ?? 0, subjectsOffered: offeredBy.get(c.id) ?? 0, released: releasedSet.has(c.id) },
        fees: { expectedKobo: fee.expectedKobo, collectedKobo: fee.collectedKobo, paidRate: feePaidRate(fee.collectedKobo, fee.expectedKobo) },
      };
    });

    return { term: termHeader, classes: rows };
  }
```

- [ ] **Step 4: Add the controller route** — in `apps/api/src/modules/dashboard/dashboard.controller.ts`, add below the `proprietor` handler (inside the class):
```ts
  @Get("principal")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  principal(@Query("termId") termId?: string) {
    return this.service.getPrincipalSummary(termId);
  }
```

- [ ] **Step 5: Run the dashboard e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: PASS (8 tests — 4 proprietor + 4 principal).

- [ ] **Step 6: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (24 suites / 158 tests), build + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard/dashboard.service.ts apps/api/src/modules/dashboard/dashboard.controller.ts apps/api/test/dashboard.e2e-spec.ts
git commit -m "feat(dashboard): principal per-class summary endpoint (attendance + results coverage + fees, batched)"
```

---

## Task 3: Web — api client + PrincipalDashboardView + staff branch

**Files:** Modify `apps/web/src/lib/api.ts`; create `apps/web/src/app/(app)/dashboard/principal-dashboard.tsx`; modify `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add the type (near `ProprietorDashboard`) and the method (near `getProprietorDashboard` inside the `api` object):
```ts
export interface PrincipalClassRow {
  classId: string;
  className: string;
  formTeacher: string | null;
  attendance: { rate: number; presentDays: number; totalDays: number };
  results: { subjectsScored: number; subjectsOffered: number; released: boolean };
  fees: { expectedKobo: number; collectedKobo: number; paidRate: number };
}
export interface PrincipalDashboard {
  term: { id: string; name: string; number: number } | null;
  classes: PrincipalClassRow[];
}
```
```ts
  getPrincipalDashboard: (termId?: string) =>
    authedRequest<PrincipalDashboard>(`/v1/dashboard/principal${termId ? `?termId=${termId}` : ""}`),
```

- [ ] **Step 2: Create the principal view** — `apps/web/src/app/(app)/dashboard/principal-dashboard.tsx`. Renders a dense table; on a 403 it signals the caller to fall back (via the `onForbidden` prop). `ApiError` from `@/lib/api` carries `.status`.
```tsx
"use client";

import { useEffect, useState } from "react";
import { Badge, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type AcademicYear, type PrincipalDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function PrincipalDashboardView({ onForbidden }: { onForbidden: () => void }) {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<PrincipalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const yrs: AcademicYear[] = await api.listAcademicYears();
        const ts = yrs.flatMap((y) =>
          (y.terms ?? []).filter((t) => t.id).map((t) => ({ id: t.id!, label: `${y.name} · Term ${t.number}`, isCurrent: !!t.isCurrent })),
        );
        setTerms(ts);
        const cur = ts.find((t) => t.isCurrent) ?? ts[0];
        if (cur) setTermId(cur.id);
      } catch {
        /* fall through to the load below */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPrincipalDashboard(termId || undefined)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) { onForbidden(); return; }
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const pct = (r: number) => `${Math.round(r * 100)}%`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Today at a glance</h1>
        {terms.length > 0 && (
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
          >
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null || data.classes.length === 0 ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No classes this term yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-100 dark:border-white/10">
          <table className="w-full text-small">
            <thead className="bg-surface dark:bg-surface-dark text-ink-500">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Class</th>
                <th className="py-2 px-3 text-left font-medium">Form teacher</th>
                <th className="py-2 px-3 text-right font-medium">Attendance</th>
                <th className="py-2 px-3 text-left font-medium">Results</th>
                <th className="py-2 px-3 text-right font-medium">Fees paid</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => {
                const lowAttendance = c.attendance.totalDays > 0 && c.attendance.rate < 0.85;
                const incomplete = c.results.subjectsScored < c.results.subjectsOffered;
                return (
                  <tr key={c.classId} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-2 px-3 font-medium text-ink-1000 dark:text-ink-100">{c.className}</td>
                    <td className="py-2 px-3 text-ink-700 dark:text-ink-300">{c.formTeacher ?? "—"}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${lowAttendance ? "text-warning font-semibold" : "text-ink-700 dark:text-ink-300"}`}>
                      {c.attendance.totalDays > 0 ? pct(c.attendance.rate) : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${incomplete ? "text-warning font-semibold" : "text-ink-700 dark:text-ink-300"}`}>
                          {c.results.subjectsScored}/{c.results.subjectsOffered}
                        </span>
                        <Badge tone={c.results.released ? "success" : "neutral"}>{c.results.released ? "Released" : "Draft"}</Badge>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-ink-700 dark:text-ink-300">
                      {pct(c.fees.paidRate)}
                      <span className="text-caption text-ink-500 ml-1">({formatMoney(c.fees.collectedKobo, "NGN")})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Staff branch in `dashboard/page.tsx`** — render the principal view for non-proprietor staff, with a `useState` fallback flag so a 403 reverts to the quick-links stub. Add the import:
```tsx
import PrincipalDashboardView from "./principal-dashboard";
```
Add a state flag near the top of the component (with the other hooks — it must be declared unconditionally, before any early `return`):
```tsx
  const [principalDenied, setPrincipalDenied] = useState(false);
```
Then, AFTER the existing `if (user.identityType === "PROPRIETOR" && user.schoolId) { ... }` branch and BEFORE the `if (!user.schoolId) { ... }` onboarding block, add:
```tsx
  if (user.schoolId && !principalDenied) {
    return <PrincipalDashboardView onForbidden={() => setPrincipalDenied(true)} />;
  }
```
(Reachable only by non-PROPRIETOR, non-PARENT staff with a `schoolId` — PARENT returned above, PROPRIETOR returned above. A `reports.view`-less staff member trips `onForbidden` → `principalDenied` flips → re-render falls through to the existing `quickLinks` block. Leave the `!user.schoolId` onboarding block and the staff `quickLinks` render unchanged below.)

- [ ] **Step 4: Verify (no dev server running)**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: typecheck + lint clean (pre-existing `no-page-custom-font` warning is unrelated); `/dashboard` builds. Confirm `Badge`/`Spinner` import from `@mymakaranta/ui`, `ApiError` is exported from `@/lib/api` and carries `.status`, `Badge` tone `warning`/`success`/`neutral` exist, `text-warning` token is real.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/dashboard"
git commit -m "feat(dashboard): principal operational dashboard view (per-class table + 403 fallback)"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs` Prisma script, deleted after): a school + current term + two classes (one with a form teacher + partial score coverage + some attendance + invoices; one bare), AND a staff `User` with `reports.view`. Simplest staff path: onboard a proprietor (gets `reports.view`) and call `/v1/dashboard/principal` as them to confirm the route + shape (a proprietor has `reports.view`, so the endpoint returns data even though the web shows them the showpiece). Then assert the per-class rows match the seed (coverage X/Y, released flag, per-class paidRate, formTeacher name + null). Negative: no token → 401; foreign termId → 404. (A true 403 needs a staff user without `reports.view`; optional — note if skipped.) Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 5 slice 2 entry (principal dashboard: `GET /v1/dashboard/principal`, per-class attendance/results-coverage/fees batched, role-aware staff view + 403 fallback, e2e count 158), update Sprint 5 status (slice 3 smart alerts remains), and "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit (`pnpm exec jest`) + web vitest + UI vitest + builds, then merge `sprint-5-principal-dashboard` → main per the user's choice.

---

## Notes for the implementer
- **No model, no migration.** Don't `next build` while `next dev` runs; stop dev servers before API `prisma`/builds (Windows engine lock).
- **Batched, explicit tenant scoping** — every read carries `where: { schoolId }` (or scopes via a schoolId-bearing relation); foreign `termId` → 404. Do NOT add a per-class query loop — assemble from the batched maps. Don't rely on the `$use` middleware.
- **Rates are 0..1 fractions** — the web multiplies by 100. Both `attendanceRate` and `feePaidRate` guard division by zero.
- **`distinct: ["classId", "subjectId"]`** on the score query gives one row per (class, subject) with ≥1 score — count rows per class = subjects scored. Don't `groupBy` count (that counts score rows, not distinct subjects).
- **Term resolution is identical to slice 1** — `termId` given → 404 if foreign; omitted → current term; none → `{ term: null, classes: [] }`. The principal e2e seeds a fresh school C so its current term is unambiguous (school A already has an `isCurrent` term from the proprietor tests).
- **`reports.view`** gates the endpoint (seeded + proprietor-granted). The web shows the principal view to non-proprietor staff and falls back to the quick-links stub on a 403 (lower-privilege staff aren't broken).
- **Tokens/ui** — `Badge` tones `success`/`neutral`/`warning`, `Spinner`, `text-warning`, `bg-surface`/`-dark`, `text-ink-*`, `text-error`, `text-caption`, `rounded-card`, `rounded-input`, `tabular-nums` are real; `bg-canvas`/`text-brand-600` are not. `formatMoney(kobo, "NGN")`.
```
