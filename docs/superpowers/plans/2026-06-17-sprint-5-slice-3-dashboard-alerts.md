# Dashboard Smart Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface three deterministic per-class trend alerts (attendance dip, overdue fees, results overdue) on both dashboards so a proprietor/principal sees what needs attention at a glance.

**Architecture:** A pure `alerts.util.ts` (types + thresholds + `buildAlerts`) holds all detection logic; `DashboardService.getAlerts(termId?)` does batched, tenant-scoped reads to build one `ClassAlertInput` per class and calls `buildAlerts`; `GET /v1/dashboard/alerts` exposes it. Web: a shared `<AlertsPanel/>` mounted on both dashboard views. No new model, no migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts`).

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-5-slice-3-dashboard-alerts-design.md`

**Branch:** `sprint-5-dashboard-alerts` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; foreign termId → 404; batched queries (no N+1); e2e service-level inside `TenantContext.run` (model on `test/dashboard.e2e-spec.ts`); unit specs co-located `src/**/*.spec.ts`; money kobo Int; rates 0..1 fractions; `noUncheckedIndexedAccess`. Reuse `attendanceRate` (slice 1) + `computeInvoiceStatus` (`fees/invoice-status.util`, for overdue). `reports.view` gates the route. Term resolution is identical to slices 1/2 (already tested).

---

## File Structure
- Create: `apps/api/src/modules/dashboard/alerts.util.ts` (types, thresholds, `formatNairaFromKobo`, `buildAlerts`), `alerts.util.spec.ts` (unit)
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts` (+`getAlerts`), `dashboard.controller.ts` (+route); `apps/api/test/dashboard.e2e-spec.ts` (+`alerts` describe)
- Create: `apps/web/src/app/(app)/dashboard/alerts-panel.tsx`
- Modify: `apps/web/src/lib/api.ts` (type + method), `apps/web/src/app/(app)/dashboard/proprietor-dashboard.tsx` (+panel), `apps/web/src/app/(app)/dashboard/principal-dashboard.tsx` (+panel)

---

## Task 1: API — `alerts.util.ts` (buildAlerts) + unit tests

**Files:** Create `apps/api/src/modules/dashboard/alerts.util.ts`, `apps/api/src/modules/dashboard/alerts.util.spec.ts`

- [ ] **Step 1: Write the failing unit test** — `apps/api/src/modules/dashboard/alerts.util.spec.ts`:
```ts
import { buildAlerts, type ClassAlertInput } from "./alerts.util";

const base: ClassAlertInput = {
  classId: "c1",
  className: "JSS1A",
  attendance: { baselineRate: 0.9, recentRate: 0.9, recentMarks: 20 },
  fees: { expectedKobo: 0, overdueKobo: 0 },
  results: { subjectsScored: 3, subjectsOffered: 3, released: true },
  termElapsedFraction: 0.5,
};
const one = (over: Partial<ClassAlertInput>) => buildAlerts([{ ...base, ...over }]);

describe("buildAlerts — ATTENDANCE_DIP", () => {
  it("fires high when the drop is >= 0.20 and recent marks pass the gate", () => {
    const a = one({ attendance: { baselineRate: 0.9, recentRate: 0.6, recentMarks: 20 } });
    expect(a).toEqual([{ type: "ATTENDANCE_DIP", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A attendance down 30% this week (60% vs 90% term average)." }]);
  });
  it("fires medium when the drop is between 0.10 and 0.20", () => {
    const a = one({ attendance: { baselineRate: 0.9, recentRate: 0.78, recentMarks: 20 } });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["ATTENDANCE_DIP", "medium"]]);
  });
  it("does not fire below the 0.10 drop threshold", () => {
    expect(one({ attendance: { baselineRate: 0.9, recentRate: 0.82, recentMarks: 20 } })).toEqual([]);
  });
  it("does not fire when recent marks are below the noise gate", () => {
    expect(one({ attendance: { baselineRate: 0.9, recentRate: 0.2, recentMarks: 9 } })).toEqual([]);
  });
});

describe("buildAlerts — LOW_COLLECTION", () => {
  it("fires high when overdue is >= 30% of expected", () => {
    const a = one({ fees: { expectedKobo: 10000000, overdueKobo: 5000000 } });
    expect(a).toEqual([{ type: "LOW_COLLECTION", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A: ₦50,000 in overdue fees (50% of expected)." }]);
  });
  it("fires medium when overdue is positive but < 30%", () => {
    const a = one({ fees: { expectedKobo: 10000000, overdueKobo: 1000000 } });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["LOW_COLLECTION", "medium"]]);
  });
  it("does not fire when nothing is overdue", () => {
    expect(one({ fees: { expectedKobo: 10000000, overdueKobo: 0 } })).toEqual([]);
  });
});

describe("buildAlerts — RESULTS_OVERDUE", () => {
  it("fires high when the term has ended, unreleased + incomplete", () => {
    const a = one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 1 });
    expect(a).toEqual([{ type: "RESULTS_OVERDUE", severity: "high", classId: "c1", className: "JSS1A",
      message: "JSS1A: results not released — 2/3 subjects scored." }]);
  });
  it("fires medium when >= 80% elapsed but not ended", () => {
    const a = one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 0.85 });
    expect(a.map((x) => [x.type, x.severity])).toEqual([["RESULTS_OVERDUE", "medium"]]);
  });
  it("does not fire before 80% elapsed", () => {
    expect(one({ results: { subjectsScored: 2, subjectsOffered: 3, released: false }, termElapsedFraction: 0.7 })).toEqual([]);
  });
  it("does not fire when released or fully scored or nothing offered", () => {
    expect(one({ results: { subjectsScored: 2, subjectsOffered: 3, released: true }, termElapsedFraction: 1 })).toEqual([]);
    expect(one({ results: { subjectsScored: 3, subjectsOffered: 3, released: false }, termElapsedFraction: 1 })).toEqual([]);
    expect(one({ results: { subjectsScored: 0, subjectsOffered: 0, released: false }, termElapsedFraction: 1 })).toEqual([]);
  });
});

describe("buildAlerts — multiple + sort", () => {
  it("emits several alerts for one class and sorts high before medium", () => {
    const a = buildAlerts([{
      ...base,
      attendance: { baselineRate: 0.9, recentRate: 0.6, recentMarks: 20 }, // dip high
      fees: { expectedKobo: 10000000, overdueKobo: 1000000 },               // low medium
    }]);
    expect(a.map((x) => [x.type, x.severity])).toEqual([
      ["ATTENDANCE_DIP", "high"],
      ["LOW_COLLECTION", "medium"],
    ]);
  });
  it("returns [] for empty input", () => {
    expect(buildAlerts([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/alerts.util.spec.ts`
Expected: FAIL — `Cannot find module './alerts.util'`.

- [ ] **Step 3: Implement** — `apps/api/src/modules/dashboard/alerts.util.ts`:
```ts
export type AlertType = "ATTENDANCE_DIP" | "LOW_COLLECTION" | "RESULTS_OVERDUE";
export type AlertSeverity = "high" | "medium";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  classId: string;
  className: string;
  message: string;
}

export interface ClassAlertInput {
  classId: string;
  className: string;
  attendance: { baselineRate: number; recentRate: number; recentMarks: number };
  fees: { expectedKobo: number; overdueKobo: number };
  results: { subjectsScored: number; subjectsOffered: number; released: boolean };
  termElapsedFraction: number; // 0..1; 1 when the term has ended
}

export const ALERT_THRESHOLDS = {
  dipDrop: 0.1,
  dipHighDrop: 0.2,
  dipMinRecentMarks: 10,
  overdueHighFraction: 0.3,
  resultsElapsed: 0.8,
} as const;

export function formatNairaFromKobo(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString("en-US")}`;
}

const SEV_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1 };
const TYPE_RANK: Record<AlertType, number> = { ATTENDANCE_DIP: 0, LOW_COLLECTION: 1, RESULTS_OVERDUE: 2 };

export function buildAlerts(
  inputs: ClassAlertInput[],
  opts: typeof ALERT_THRESHOLDS = ALERT_THRESHOLDS,
): Alert[] {
  const out: Alert[] = [];
  for (const c of inputs) {
    // ATTENDANCE_DIP
    if (c.attendance.recentMarks >= opts.dipMinRecentMarks) {
      const drop = c.attendance.baselineRate - c.attendance.recentRate;
      if (drop >= opts.dipDrop) {
        out.push({
          type: "ATTENDANCE_DIP",
          severity: drop >= opts.dipHighDrop ? "high" : "medium",
          classId: c.classId,
          className: c.className,
          message: `${c.className} attendance down ${Math.round(drop * 100)}% this week (${Math.round(c.attendance.recentRate * 100)}% vs ${Math.round(c.attendance.baselineRate * 100)}% term average).`,
        });
      }
    }
    // LOW_COLLECTION
    if (c.fees.overdueKobo > 0) {
      const frac = c.fees.expectedKobo > 0 ? c.fees.overdueKobo / c.fees.expectedKobo : 0;
      out.push({
        type: "LOW_COLLECTION",
        severity: frac >= opts.overdueHighFraction ? "high" : "medium",
        classId: c.classId,
        className: c.className,
        message: `${c.className}: ${formatNairaFromKobo(c.fees.overdueKobo)} in overdue fees (${Math.round(frac * 100)}% of expected).`,
      });
    }
    // RESULTS_OVERDUE
    if (
      c.termElapsedFraction >= opts.resultsElapsed &&
      !c.results.released &&
      c.results.subjectsOffered > 0 &&
      c.results.subjectsScored < c.results.subjectsOffered
    ) {
      out.push({
        type: "RESULTS_OVERDUE",
        severity: c.termElapsedFraction >= 1 ? "high" : "medium",
        classId: c.classId,
        className: c.className,
        message: `${c.className}: results not released — ${c.results.subjectsScored}/${c.results.subjectsOffered} subjects scored.`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.className.localeCompare(b.className),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/alerts.util.spec.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard/alerts.util.ts apps/api/src/modules/dashboard/alerts.util.spec.ts
git commit -m "feat(dashboard): pure buildAlerts (attendance dip / low collection / results overdue)"
```

---

## Task 2: API — `getAlerts` service + controller route + e2e

**Files:** Modify `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, `apps/api/test/dashboard.e2e-spec.ts`

- [ ] **Step 1: Write the failing e2e** — add a new `describe("alerts", ...)` block INSIDE the top-level `describe("Dashboard (e2e)", ...)` in `apps/api/test/dashboard.e2e-spec.ts` (after the `principal summary` block). It creates its own school D so the current-term resolution is unambiguous and seeds four classes (dip / low-collection / results-overdue / healthy):
```ts
  describe("alerts", () => {
    let schoolDId: string;
    let termD: string;
    let classDip: string;
    let classLow: string;
    let classResults: string;
    let classHealthy: string;
    const asD = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolDId, userId }, fn);

    beforeAll(async () => {
      const d = await prisma.school.create({ data: { name: `Dash D ${suffix}`, slug: `dash-d-${suffix}` } });
      schoolDId = d.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: schoolDId, name: `DashDYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      // Term ENDED (endDate < now) → windowTo clamps to endDate, termElapsedFraction = 1.
      const term = await prisma.term.create({ data: { schoolId: schoolDId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termD = term.id;
      const mkLevel = (n: number) => prisma.classLevel.create({ data: { schoolId: schoolDId, name: `AL${n}-${suffix}`, order: n } });
      const l1 = await mkLevel(1); const l2 = await mkLevel(2); const l3 = await mkLevel(3); const l4 = await mkLevel(4);
      const mkClass = (lvlId: string, name: string) => prisma.class.create({ data: { schoolId: schoolDId, classLevelId: lvlId, name: `${name}-${suffix}` } });
      const cDip = await mkClass(l1.id, "ADip"); const cLow = await mkClass(l2.id, "ALow");
      const cRes = await mkClass(l3.id, "ARes"); const cOk = await mkClass(l4.id, "AOk");
      classDip = cDip.id; classLow = cLow.id; classResults = cRes.id; classHealthy = cOk.id;

      const mkStu = (label: string) => prisma.student.create({ data: { schoolId: schoolDId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "A", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
      // Each class needs >=1 enrolled student so it appears in the term's class list.
      const dip1 = await mkStu("Dip1"); const dip2 = await mkStu("Dip2");
      const low1 = await mkStu("Low1"); const res1 = await mkStu("Res1"); const ok1 = await mkStu("Ok1");
      await prisma.enrollment.createMany({ data: [
        { studentId: dip1.id, classId: classDip, termId: termD },
        { studentId: dip2.id, classId: classDip, termId: termD },
        { studentId: low1.id, classId: classLow, termId: termD },
        { studentId: res1.id, classId: classResults, termId: termD },
        { studentId: ok1.id, classId: classHealthy, termId: termD },
      ] });

      // --- classDip: high baseline (Oct PRESENT) + low recent (Dec 14-19 ABSENT, 12 marks) → dip high.
      const attData: { schoolId: string; studentId: string; classId: string; date: Date; status: "PRESENT" | "ABSENT"; recordedBy: string }[] = [];
      for (const sid of [dip1.id, dip2.id]) {
        for (let day = 1; day <= 6; day++) attData.push({ schoolId: schoolDId, studentId: sid, classId: classDip, date: new Date(`2025-10-0${day}`), status: "PRESENT", recordedBy: "x" });
        for (let day = 14; day <= 19; day++) attData.push({ schoolId: schoolDId, studentId: sid, classId: classDip, date: new Date(`2025-12-${day}`), status: "ABSENT", recordedBy: "x" });
      }
      await prisma.attendanceRecord.createMany({ data: attData });
      // classDip students fully paid (no overdue), no subjects (no results alert).
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: dip1.id, termId: termD, classLevelId: l1.id, totalKobo: 5000000, paidKobo: 5000000 } });

      // --- classLow: an invoice past due, fully unpaid → overdue 100% → LOW_COLLECTION high. No subjects/attendance.
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: low1.id, termId: termD, classLevelId: l2.id, totalKobo: 5000000, paidKobo: 0, dueDate: new Date("2025-10-15") } });

      // --- classResults: 2 offered, 1 scored, not released, term ended → RESULTS_OVERDUE high. Fully paid (no overdue).
      const at = await prisma.assessmentType.create({ data: { schoolId: schoolDId, name: `CA-${suffix}`, maxScore: 100, order: 1 } });
      const subjP = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Phy", code: `PHY-${suffix}` } });
      const subjQ = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Chem", code: `CHM-${suffix}` } });
      const staff = await prisma.staff.create({ data: { schoolId: schoolDId, staffNo: `S-${suffix}`, firstName: "T", lastName: "R", email: `s-${suffix}@e.test`, phone: `+234902${String(suffix).slice(-7)}` } });
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId: schoolDId, subjectId: subjP.id, classId: classResults, staffId: staff.id, academicYearId: ay.id },
        { schoolId: schoolDId, subjectId: subjQ.id, classId: classResults, staffId: staff.id, academicYearId: ay.id },
      ] });
      await prisma.score.create({ data: { schoolId: schoolDId, studentId: res1.id, subjectId: subjP.id, classId: classResults, assessmentTypeId: at.id, termId: termD, value: 50, recordedBy: "x" } });
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: res1.id, termId: termD, classLevelId: l3.id, totalKobo: 5000000, paidKobo: 5000000 } });

      // --- classHealthy: released + full coverage (1 offered, 1 scored), paid invoice → NO alerts.
      const subjR = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Bio", code: `BIO-${suffix}` } });
      await prisma.subjectAssignment.create({ data: { schoolId: schoolDId, subjectId: subjR.id, classId: classHealthy, staffId: staff.id, academicYearId: ay.id } });
      await prisma.score.create({ data: { schoolId: schoolDId, studentId: ok1.id, subjectId: subjR.id, classId: classHealthy, assessmentTypeId: at.id, termId: termD, value: 80, recordedBy: "x" } });
      const rel = await prisma.release.create({ data: { schoolId: schoolDId, classId: classHealthy, termId: termD, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId: schoolDId, releaseId: rel.id, studentId: ok1.id, classId: classHealthy, termId: termD, average: 80, position: 1 } });
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: ok1.id, termId: termD, classLevelId: l4.id, totalKobo: 5000000, paidKobo: 5000000 } });
    });

    const byClass = (alerts: { classId: string; type: string; severity: string }[], cid: string) =>
      alerts.filter((a) => a.classId === cid).map((a) => [a.type, a.severity]);

    it("emits exactly the expected alert per class (no termId → current term)", async () => {
      const r = await asD(() => dashboard.getAlerts());
      expect(r.term?.id).toBe(termD);
      expect(byClass(r.alerts, classDip)).toEqual([["ATTENDANCE_DIP", "high"]]);
      expect(byClass(r.alerts, classLow)).toEqual([["LOW_COLLECTION", "high"]]);
      expect(byClass(r.alerts, classResults)).toEqual([["RESULTS_OVERDUE", "high"]]);
      expect(byClass(r.alerts, classHealthy)).toEqual([]);
      expect(r.alerts.length).toBe(3);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getAlerts(termD))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + [] when the school has no current term", async () => {
      const r = await asB(() => dashboard.getAlerts());
      expect(r.term).toBeNull();
      expect(r.alerts).toEqual([]);
    });
  });
```
(`prisma`, `dashboard`, `suffix`, `userId`, `asB`, `NotFoundException`, `TenantContext` are already in scope from slices 1/2. School B has no term — reused for the foreign + no-term assertions.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: FAIL — `dashboard.getAlerts is not a function`.

- [ ] **Step 3: Implement the service method** — in `apps/api/src/modules/dashboard/dashboard.service.ts`, add imports and the method. Add to the top imports:
```ts
import { computeInvoiceStatus } from "../fees/invoice-status.util";
import { buildAlerts, type ClassAlertInput } from "./alerts.util";
```
Add the method below `getPrincipalSummary` (inside the class):
```ts
  async getAlerts(termId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const now = new Date();

    const term = termId
      ? await this.prisma.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: { select: { name: true } } } })
      : await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, include: { academicYear: { select: { name: true } } } });
    if (termId && !term) throw new NotFoundException("Term not found in this school.");
    if (!term) return { term: null, alerts: [] };
    const termHeader = { id: term.id, name: term.academicYear.name, number: term.number };

    const classes = await this.prisma.class.findMany({
      where: { schoolId, enrollments: { some: { termId: term.id } } },
      select: { id: true, name: true },
    });
    if (classes.length === 0) return { term: termHeader, alerts: [] };
    const classIds = classes.map((c) => c.id);

    const windowTo = now < term.endDate ? now : term.endDate;
    const recentFrom = new Date(Math.max(term.startDate.getTime(), windowTo.getTime() - 7 * 24 * 60 * 60 * 1000));

    // Baseline + recent attendance (two cheap groupBy counts)
    const accumulate = (rows: { classId: string; status: string; _count: { _all: number } }[]) => {
      const by = new Map<string, { present: number; late: number; absent: number; excused: number }>();
      for (const r of rows) {
        const c = by.get(r.classId) ?? { present: 0, late: 0, absent: 0, excused: 0 };
        const n = r._count._all;
        if (r.status === "PRESENT") c.present += n;
        else if (r.status === "LATE") c.late += n;
        else if (r.status === "ABSENT") c.absent += n;
        else if (r.status === "EXCUSED") c.excused += n;
        by.set(r.classId, c);
      }
      return by;
    };
    const [baselineRows, recentRows] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({ by: ["classId", "status"], where: { schoolId, classId: { in: classIds }, date: { gte: term.startDate, lte: windowTo } }, _count: { _all: true } }),
      this.prisma.attendanceRecord.groupBy({ by: ["classId", "status"], where: { schoolId, classId: { in: classIds }, date: { gte: recentFrom, lte: windowTo } }, _count: { _all: true } }),
    ]);
    const baselineBy = accumulate(baselineRows);
    const recentBy = accumulate(recentRows);
    const rateOf = (c?: { present: number; late: number; absent: number; excused: number }) => {
      if (!c) return { rate: 0, marks: 0 };
      const marks = c.present + c.late + c.absent + c.excused;
      return { rate: marks === 0 ? 0 : (c.present + c.late) / marks, marks };
    };

    // Fees per class (expected + overdue) via enrollment
    const enrollments = await this.prisma.enrollment.findMany({ where: { classId: { in: classIds }, termId: term.id }, select: { studentId: true, classId: true } });
    const classByStudent = new Map(enrollments.map((e) => [e.studentId, e.classId]));
    const studentIds = enrollments.map((e) => e.studentId);
    const invoices = studentIds.length
      ? await this.prisma.invoice.findMany({ where: { schoolId, termId: term.id, studentId: { in: studentIds } }, select: { studentId: true, totalKobo: true, paidKobo: true, dueDate: true } })
      : [];
    const feesBy = new Map<string, { expectedKobo: number; overdueKobo: number }>();
    for (const inv of invoices) {
      const cid = classByStudent.get(inv.studentId);
      if (!cid) continue;
      const f = feesBy.get(cid) ?? { expectedKobo: 0, overdueKobo: 0 };
      f.expectedKobo += inv.totalKobo;
      if (computeInvoiceStatus({ totalKobo: inv.totalKobo, paidKobo: inv.paidKobo, dueDate: inv.dueDate, now }) === "OVERDUE") {
        f.overdueKobo += inv.totalKobo - inv.paidKobo;
      }
      feesBy.set(cid, f);
    }

    // Results: offered ∩ scored + released
    const offered = await this.prisma.subjectAssignment.findMany({ where: { schoolId, classId: { in: classIds }, academicYearId: term.academicYearId }, select: { classId: true, subjectId: true } });
    const offeredBy = new Map<string, Set<string>>();
    for (const o of offered) { const s = offeredBy.get(o.classId) ?? new Set<string>(); s.add(o.subjectId); offeredBy.set(o.classId, s); }
    const scoredRows = await this.prisma.score.findMany({ where: { schoolId, termId: term.id, classId: { in: classIds } }, distinct: ["classId", "subjectId"], select: { classId: true, subjectId: true } });
    const scoredBy = new Map<string, Set<string>>();
    for (const s of scoredRows) { const set = scoredBy.get(s.classId) ?? new Set<string>(); set.add(s.subjectId); scoredBy.set(s.classId, set); }
    const releases = await this.prisma.release.findMany({ where: { schoolId, termId: term.id, classId: { in: classIds } }, select: { classId: true } });
    const releasedSet = new Set(releases.map((r) => r.classId));

    const span = term.endDate.getTime() - term.startDate.getTime();
    const termElapsedFraction = span <= 0 ? 1 : Math.max(0, Math.min(1, (now.getTime() - term.startDate.getTime()) / span));

    const inputs: ClassAlertInput[] = classes.map((c) => {
      const baseline = rateOf(baselineBy.get(c.id));
      const recent = rateOf(recentBy.get(c.id));
      const fee = feesBy.get(c.id) ?? { expectedKobo: 0, overdueKobo: 0 };
      const offeredSet = offeredBy.get(c.id) ?? new Set<string>();
      const scoredSet = scoredBy.get(c.id) ?? new Set<string>();
      let subjectsScored = 0;
      for (const sid of scoredSet) if (offeredSet.has(sid)) subjectsScored++;
      return {
        classId: c.id,
        className: c.name,
        attendance: { baselineRate: baseline.rate, recentRate: recent.rate, recentMarks: recent.marks },
        fees: { expectedKobo: fee.expectedKobo, overdueKobo: fee.overdueKobo },
        results: { subjectsScored, subjectsOffered: offeredSet.size, released: releasedSet.has(c.id) },
        termElapsedFraction,
      };
    });

    return { term: termHeader, alerts: buildAlerts(inputs) };
  }
```

- [ ] **Step 4: Add the controller route** — in `apps/api/src/modules/dashboard/dashboard.controller.ts`, add below the `principal` handler:
```ts
  @Get("alerts")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  alerts(@Query("termId") termId?: string) {
    return this.service.getAlerts(termId);
  }
```

- [ ] **Step 5: Run the dashboard e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: PASS (11 tests — 4 proprietor + 4 principal + 3 alerts).

- [ ] **Step 6: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (24 suites / 161 tests), build + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard/dashboard.service.ts apps/api/src/modules/dashboard/dashboard.controller.ts apps/api/test/dashboard.e2e-spec.ts
git commit -m "feat(dashboard): alerts endpoint (attendance dip / overdue fees / results overdue, batched)"
```

---

## Task 3: Web — api client + `<AlertsPanel/>` on both dashboards

**Files:** Modify `apps/web/src/lib/api.ts`; create `apps/web/src/app/(app)/dashboard/alerts-panel.tsx`; modify `proprietor-dashboard.tsx`, `principal-dashboard.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add the types (near `PrincipalDashboard`) and the method (near `getPrincipalDashboard`):
```ts
export interface DashboardAlert {
  type: "ATTENDANCE_DIP" | "LOW_COLLECTION" | "RESULTS_OVERDUE";
  severity: "high" | "medium";
  classId: string;
  className: string;
  message: string;
}
export interface DashboardAlertsResponse {
  term: { id: string; name: string; number: number } | null;
  alerts: DashboardAlert[];
}
```
```ts
  getDashboardAlerts: (termId?: string) =>
    authedRequest<DashboardAlertsResponse>(`/v1/dashboard/alerts${termId ? `?termId=${termId}` : ""}`),
```

- [ ] **Step 2: Create the panel** — `apps/web/src/app/(app)/dashboard/alerts-panel.tsx`. Renders nothing while loading, on error, on 403, or when there are no alerts (calm).
```tsx
"use client";

import { useEffect, useState } from "react";
import { api, type DashboardAlert } from "@/lib/api";

export default function AlertsPanel({ termId }: { termId?: string }) {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);

  useEffect(() => {
    let active = true;
    api
      .getDashboardAlerts(termId)
      .then((r) => { if (active) setAlerts(r.alerts); })
      .catch(() => { if (active) setAlerts([]); });
    return () => { active = false; };
  }, [termId]);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-caption font-medium uppercase tracking-wide text-ink-500">Needs attention</p>
      {alerts.map((a, i) => (
        <div
          key={`${a.classId}-${a.type}-${i}`}
          className={`rounded-card border p-3 text-small ${
            a.severity === "high"
              ? "border-error/40 bg-error/10 text-error"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          {a.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mount on the proprietor view** — in `apps/web/src/app/(app)/dashboard/proprietor-dashboard.tsx`, add the import and render the panel just inside the main content (above the KPI hero). Add at top:
```tsx
import AlertsPanel from "./alerts-panel";
```
Then place `<AlertsPanel termId={termId || undefined} />` immediately after the opening `<div className="mx-auto max-w-4xl px-4 py-8">` wrapper's header block — i.e. right after the `</div>` that closes the heading+term-selector row, before the `{loading ? ... }` block. (The component already has `termId` state from its term selector.)

- [ ] **Step 4: Mount on the principal view** — in `apps/web/src/app/(app)/dashboard/principal-dashboard.tsx`, add the import and render `<AlertsPanel termId={termId || undefined} />` in the same position (after the heading+selector row, before the `{loading ? ...}` block). Add at top:
```tsx
import AlertsPanel from "./alerts-panel";
```

- [ ] **Step 5: Verify (no dev server running)**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: typecheck + lint clean (pre-existing `no-page-custom-font` warning unrelated); `/dashboard` builds. Confirm `text-warning`/`bg-warning`/`border-warning` + `text-error`/`bg-error`/`border-error` + `text-caption` tokens exist (they do — used elsewhere); confirm `termId` is in scope in both dashboard components.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/dashboard"
git commit -m "feat(dashboard): AlertsPanel on proprietor + principal dashboards"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs` Prisma script, deleted after) a school + current term (ENDED, so termElapsedFraction = 1) + the four scenario classes (dip / overdue-fees / results-overdue / healthy), AND onboard a proprietor (gets `reports.view`) for the school OR grant the permission. OTP-login → `GET /v1/dashboard/alerts` → assert 3 alerts with the right type+severity per class and none for the healthy class. Negatives: no token → 401; foreign termId → 404. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 5 slice 3 entry (smart alerts: `GET /v1/dashboard/alerts`, pure `buildAlerts` with the three heuristics + thresholds, `<AlertsPanel/>` on both dashboards, e2e count 161). Mark **Sprint 5 (Reporting & Dashboards) COMPLETE** (slices 1–3). Update "Next steps" (Sprint 6 per PRD — Communication/announcements is the remaining MVP module). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit (`pnpm exec jest`) + web vitest + UI vitest + builds, then merge `sprint-5-dashboard-alerts` → main per the user's choice.

---

## Notes for the implementer
- **No model, no migration.** Don't `next build` while `next dev` runs; stop dev servers before API `prisma`/builds (Windows engine lock).
- **Batched, explicit tenant scoping** — every read carries `where: { schoolId }` (or scopes via a schoolId-bearing relation; the `enrollment` query scopes via `classId in classIds`, and `classIds` come from a `schoolId`-scoped class query — same pattern as slice 2, reviewed safe). Foreign `termId` → 404. No per-class query loop.
- **`buildAlerts` is pure** — all detection + message strings live there; the web `<AlertsPanel/>` only renders `message`. Server formats money via `formatNairaFromKobo` (don't re-derive on the web).
- **Overdue** uses `computeInvoiceStatus({ totalKobo, paidKobo, dueDate, now }) === "OVERDUE"` (an invoice with `dueDate` in the past and a positive balance). `overdueKobo` = `totalKobo − paidKobo` for those.
- **Term resolution is identical to slices 1/2** — foreign 404; current term when omitted; none → `{ term: null, alerts: [] }`. The alerts e2e seeds a fresh school D (school A already has an `isCurrent` term).
- **Severity:** dip `high` ≥0.20 drop; overdue `high` ≥30% of expected; results `high` when term ended (`termElapsedFraction >= 1`), else `medium` at ≥80% elapsed.
- **Tokens/ui** — `text-warning`/`bg-warning`/`border-warning`, `text-error`/`bg-error`/`border-error`, `text-caption`, `rounded-card` are real; `formatMoney` not needed here (server builds messages).
```
