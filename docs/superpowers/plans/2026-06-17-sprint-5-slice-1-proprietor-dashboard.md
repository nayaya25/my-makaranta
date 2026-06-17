# Proprietor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A proprietor opens `/dashboard` and sees term-scoped school health at a glance: fees collected this week + term fee position, school attendance rate, results-release progress, and the top-performing class.

**Architecture:** New `apps/api/src/modules/dashboard/` module — two pure helpers (`attendanceRate`, `pickTopClass`) + a `DashboardService` that reuses the pure `summarizeInvoices` util (slice 3c) and does its own explicitly tenant-scoped Prisma queries (no cross-module DI). One read endpoint `GET /v1/dashboard/proprietor?termId=` (`reports.view`). Web: role-aware `/dashboard` renders a proprietor KPI view for `identityType === "PROPRIETOR"`, else the existing stub. No new model, no migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts`).

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-5-slice-1-proprietor-dashboard-design.md`

**Branch:** `sprint-5-proprietor-dashboard` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping on every read; uniform 404 on foreign term (tenant-IDOR); e2e service-level inside `TenantContext.run` (model on `test/finance.e2e-spec.ts`); unit specs co-located `src/**/*.spec.ts`; money kobo Int; attendance `rate` is a 0..1 fraction (web formats `%` — Sprint 2 rate bug); `noUncheckedIndexedAccess`. Reuse `summarizeInvoices`/`SummaryRow` from `fees/finance-summary.util`. `reports.view` is seeded + proprietor-granted. PrismaModule is `@Global`; `DashboardModule` imports only `AuthModule` (guards).

---

## File Structure
- Create: `apps/api/src/modules/dashboard/dashboard.util.ts` (pure `attendanceRate` + `pickTopClass`), `dashboard.util.spec.ts` (unit), `dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.module.ts`; `apps/api/test/dashboard.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `DashboardModule`)
- Create: `apps/web/src/app/(app)/dashboard/proprietor-dashboard.tsx`
- Modify: `apps/web/src/lib/api.ts` (type + `getProprietorDashboard`), `apps/web/src/app/(app)/dashboard/page.tsx` (role branch)

---

## Task 1: API — pure helpers + unit tests

**Files:** Create `apps/api/src/modules/dashboard/dashboard.util.ts`, `apps/api/src/modules/dashboard/dashboard.util.spec.ts`

- [ ] **Step 1: Write the failing unit test** — `apps/api/src/modules/dashboard/dashboard.util.spec.ts`:
```ts
import { attendanceRate, pickTopClass } from "./dashboard.util";

describe("attendanceRate", () => {
  it("counts present + late as attended over total", () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 1, excused: 1 })).toEqual({
      rate: 0.8, presentDays: 8, totalDays: 10,
    });
  });
  it("returns 0 (not NaN) when there are no records", () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toEqual({
      rate: 0, presentDays: 0, totalDays: 0,
    });
  });
});

describe("pickTopClass", () => {
  it("returns null when no rows", () => {
    expect(pickTopClass([])).toBeNull();
  });
  it("ignores null averages and picks the highest", () => {
    expect(
      pickTopClass([
        { classId: "a", name: "JSS1A", average: 72 },
        { classId: "b", name: "JSS1B", average: null },
        { classId: "c", name: "JSS2A", average: 81 },
      ]),
    ).toEqual({ classId: "c", name: "JSS2A", average: 81 });
  });
  it("keeps the first on a tie (deterministic)", () => {
    expect(
      pickTopClass([
        { classId: "a", name: "A", average: 80 },
        { classId: "b", name: "B", average: 80 },
      ]),
    ).toEqual({ classId: "a", name: "A", average: 80 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/dashboard.util.spec.ts`
Expected: FAIL — "Cannot find module './dashboard.util'".

- [ ] **Step 3: Write the implementation** — `apps/api/src/modules/dashboard/dashboard.util.ts`:
```ts
export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export function attendanceRate(c: AttendanceCounts): {
  rate: number;
  presentDays: number;
  totalDays: number;
} {
  const presentDays = c.present + c.late;
  const totalDays = c.present + c.late + c.absent + c.excused;
  return { rate: totalDays === 0 ? 0 : presentDays / totalDays, presentDays, totalDays };
}

export interface TopClassRow {
  classId: string;
  name: string;
  average: number | null;
}

export function pickTopClass(
  rows: TopClassRow[],
): { classId: string; name: string; average: number } | null {
  let best: { classId: string; name: string; average: number } | null = null;
  for (const r of rows) {
    if (r.average === null) continue;
    if (best === null || r.average > best.average) {
      best = { classId: r.classId, name: r.name, average: r.average };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/dashboard/dashboard.util.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard/dashboard.util.ts apps/api/src/modules/dashboard/dashboard.util.spec.ts
git commit -m "feat(dashboard): pure attendanceRate + pickTopClass helpers"
```

---

## Task 2: API — DashboardService + controller + module + e2e

**Files:** Create `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.module.ts`, `apps/api/test/dashboard.e2e-spec.ts`; modify `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing e2e** — `apps/api/test/dashboard.e2e-spec.ts` (model on `test/finance.e2e-spec.ts`; two-school A/B; service-level inside `TenantContext.run`):
```ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { DashboardModule } from "../src/modules/dashboard/dashboard.module";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Dashboard (e2e)", () => {
  let prisma: PrismaService;
  let dashboard: DashboardService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        DashboardModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    dashboard = moduleRef.get(DashboardService);

    const a = await prisma.school.create({ data: { name: `Dash A ${suffix}`, slug: `dash-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Dash B ${suffix}`, slug: `dash-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("proprietor summary", () => {
    let termId: string;

    beforeAll(async () => {
      // Term window 2025-09-01..2025-12-20 (ended → windowTo clamps to endDate).
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `DashYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `DashJSS1-${suffix}`, order: 1 } });

      // Two students, two invoices (one fully paid, one half) — past due so the unpaid one is OVERDUE.
      const past = new Date("2025-10-15");
      const mkStudent = async (label: string) =>
        prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "D", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      const s1 = await mkStudent("D1");
      const s2 = await mkStudent("D2");
      const inv1 = await prisma.invoice.create({ data: { schoolId, studentId: s1.id, termId, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 6000000, dueDate: past } });
      const inv2 = await prisma.invoice.create({ data: { schoolId, studentId: s2.id, termId, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 3000000, dueDate: past } });
      // collectedThisWeek = a SUCCESS payment paid now (within 7d); an old one must NOT count.
      await prisma.payment.create({ data: { schoolId, invoiceId: inv1.id, amountKobo: 6000000, channel: "CASH", reference: `DASHR-${suffix}`, status: "SUCCESS", paidAt: new Date(), recordedBy: "x" } });
      await prisma.payment.create({ data: { schoolId, invoiceId: inv2.id, amountKobo: 3000000, channel: "CASH", reference: `DASHO-${suffix}`, status: "SUCCESS", paidAt: new Date("2025-10-15"), recordedBy: "x" } });

      // Attendance inside the window: 6 present, 2 late, 1 absent, 1 excused → rate 0.8.
      const d = new Date("2025-10-01");
      const cls = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `DashClass-${suffix}` } });
      const mkAtt = async (student: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED", n: number) => {
        for (let i = 0; i < n; i++) {
          await prisma.attendanceRecord.create({ data: { schoolId, studentId: student, classId: cls.id, date: new Date(d.getTime() + (status.length + i) * 86400000), status } });
        }
      };
      await mkAtt(s1.id, "PRESENT", 6);
      await mkAtt(s1.id, "LATE", 2);
      await mkAtt(s2.id, "ABSENT", 1);
      await mkAtt(s2.id, "EXCUSED", 1);

      // Results: enrol both, release the class, two result sheets → mean average 80.
      await prisma.enrollment.create({ data: { studentId: s1.id, classId: cls.id, termId } });
      await prisma.enrollment.create({ data: { studentId: s2.id, classId: cls.id, termId } });
      const rel = await prisma.release.create({ data: { schoolId, classId: cls.id, termId, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId, releaseId: rel.id, studentId: s1.id, classId: cls.id, termId, average: 85, position: 1 } });
      await prisma.resultSheet.create({ data: { schoolId, releaseId: rel.id, studentId: s2.id, classId: cls.id, termId, average: 75, position: 2 } });
    });

    it("aggregates fees / attendance / results for the current term (no termId)", async () => {
      const r = await asA(() => dashboard.getProprietorSummary());
      expect(r.term?.id).toBe(termId);
      expect(r.term?.number).toBe(1);
      // fees
      expect(r.fees.expectedKobo).toBe(12000000);
      expect(r.fees.collectedKobo).toBe(9000000);
      expect(r.fees.outstandingKobo).toBe(3000000);
      expect(r.fees.overdueKobo).toBe(3000000);
      expect(r.fees.collectedThisWeekKobo).toBe(6000000);
      // attendance
      expect(r.attendance.presentDays).toBe(8);
      expect(r.attendance.totalDays).toBe(10);
      expect(r.attendance.rate).toBeCloseTo(0.8, 5);
      // results
      expect(r.results.classesTotal).toBe(1);
      expect(r.results.classesReleased).toBe(1);
      expect(r.results.topClass?.average).toBe(80);
      expect(r.results.topClass?.classId).toBeDefined();
    });

    it("accepts an explicit termId", async () => {
      const r = await asA(() => dashboard.getProprietorSummary(termId));
      expect(r.term?.id).toBe(termId);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getProprietorSummary(termId))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + zeroed KPIs when the school has no current term", async () => {
      // School B has no term at all.
      const r = await asB(() => dashboard.getProprietorSummary());
      expect(r.term).toBeNull();
      expect(r.fees.expectedKobo).toBe(0);
      expect(r.results.topClass).toBeNull();
      expect(r.attendance.rate).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: FAIL — cannot find `../src/modules/dashboard/dashboard.module`.

- [ ] **Step 3: Implement the service** — `apps/api/src/modules/dashboard/dashboard.service.ts`:
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { summarizeInvoices, type SummaryRow } from "../fees/finance-summary.util";
import { attendanceRate, pickTopClass, type AttendanceCounts, type TopClassRow } from "./dashboard.util";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function zeroSummary(now: Date) {
  return {
    term: null,
    fees: { expectedKobo: 0, collectedKobo: 0, outstandingKobo: 0, overdueKobo: 0, collectedThisWeekKobo: 0 },
    attendance: { rate: 0, presentDays: 0, totalDays: 0, windowFrom: now.toISOString(), windowTo: now.toISOString() },
    results: { classesReleased: 0, classesTotal: 0, topClass: null },
  };
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getProprietorSummary(termId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const now = new Date();

    const term = termId
      ? await this.prisma.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: { select: { name: true } } } })
      : await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, include: { academicYear: { select: { name: true } } } });
    if (termId && !term) throw new NotFoundException("Term not found in this school.");
    if (!term) return zeroSummary(now);

    // --- Fees ---
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId: term.id },
      include: { classLevel: { select: { name: true } } },
    });
    const rows: SummaryRow[] = invoices.map((i) => ({
      classLevelId: i.classLevelId,
      classLevelName: i.classLevel.name,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      dueDate: i.dueDate,
    }));
    const summary = summarizeInvoices(rows, now);
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const agg = await this.prisma.payment.aggregate({
      where: { schoolId, status: "SUCCESS", paidAt: { gte: weekAgo }, invoice: { termId: term.id } },
      _sum: { amountKobo: true },
    });
    const fees = {
      expectedKobo: summary.expectedKobo,
      collectedKobo: summary.collectedKobo,
      outstandingKobo: summary.outstandingKobo,
      overdueKobo: summary.overdueKobo,
      collectedThisWeekKobo: agg._sum.amountKobo ?? 0,
    };

    // --- Attendance (window = term.startDate .. min(now, term.endDate)) ---
    const windowTo = now < term.endDate ? now : term.endDate;
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { schoolId, date: { gte: term.startDate, lte: windowTo } },
      _count: { _all: true },
    });
    const counts: AttendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const g of grouped) {
      const n = g._count._all;
      if (g.status === "PRESENT") counts.present = n;
      else if (g.status === "LATE") counts.late = n;
      else if (g.status === "ABSENT") counts.absent = n;
      else if (g.status === "EXCUSED") counts.excused = n;
    }
    const att = attendanceRate(counts);
    const attendance = { ...att, windowFrom: term.startDate.toISOString(), windowTo: windowTo.toISOString() };

    // --- Results ---
    const [classesTotal, releases, sheetAgg] = await Promise.all([
      this.prisma.class.count({ where: { schoolId, enrollments: { some: { termId: term.id } } } }),
      this.prisma.release.findMany({ where: { schoolId, termId: term.id }, select: { classId: true } }),
      this.prisma.resultSheet.groupBy({ by: ["classId"], where: { schoolId, termId: term.id }, _avg: { average: true } }),
    ]);
    // ResultSheets exist only for released classes; resolve names for the topClass pick.
    const classNames = sheetAgg.length
      ? await this.prisma.class.findMany({ where: { schoolId, id: { in: sheetAgg.map((s) => s.classId) } }, select: { id: true, name: true } })
      : [];
    const nameBy = new Map(classNames.map((c) => [c.id, c.name]));
    const topRows: TopClassRow[] = sheetAgg.map((s) => ({
      classId: s.classId,
      name: nameBy.get(s.classId) ?? "",
      average: s._avg.average,
    }));
    const results = { classesReleased: releases.length, classesTotal, topClass: pickTopClass(topRows) };

    return { term: { id: term.id, name: term.academicYear.name, number: term.number }, fees, attendance, results };
  }
}
```

- [ ] **Step 4: Implement the controller** — `apps/api/src/modules/dashboard/dashboard.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { DashboardService } from "./dashboard.service";

@Controller("v1/dashboard")
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get("proprietor")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  proprietor(@Query("termId") termId?: string) {
    return this.service.getProprietorSummary(termId);
  }
}
```

- [ ] **Step 5: Implement the module** — `apps/api/src/modules/dashboard/dashboard.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({ imports: [AuthModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
```
(PrismaModule is `@Global` — no need to import it; `AuthModule` supplies `JwtAuthGuard`/`PermissionGuard`/`JwtStrategy`.)

- [ ] **Step 6: Register in `app.module.ts`** — add the import and list it in `imports` next to `ParentModule`:
```ts
import { DashboardModule } from "./modules/dashboard/dashboard.module";
```
Add `DashboardModule,` to the `imports: [...]` array (after `ParentModule`).

- [ ] **Step 7: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json dashboard`
Expected: PASS (4 tests).

- [ ] **Step 8: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (now 24 suites), build + typecheck clean.

- [ ] **Step 9: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/dashboard apps/api/src/app.module.ts apps/api/test/dashboard.e2e-spec.ts
git commit -m "feat(dashboard): proprietor summary endpoint (fees + attendance + results, tenant-scoped)"
```

---

## Task 3: Web — api client + role-aware proprietor dashboard

**Files:** Modify `apps/web/src/lib/api.ts`; create `apps/web/src/app/(app)/dashboard/proprietor-dashboard.tsx`; modify `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add the type (near `FinanceSummary`, ~line 365) and the method (near `getFinanceSummary`, ~line 633 inside the `api` object):
```ts
export interface ProprietorDashboard {
  term: { id: string; name: string; number: number } | null;
  fees: { expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; collectedThisWeekKobo: number };
  attendance: { rate: number; presentDays: number; totalDays: number; windowFrom: string; windowTo: string };
  results: { classesReleased: number; classesTotal: number; topClass: { classId: string; name: string; average: number } | null };
}
```
```ts
  getProprietorDashboard: (termId?: string) =>
    authedRequest<ProprietorDashboard>(`/v1/dashboard/proprietor${termId ? `?termId=${termId}` : ""}`),
```

- [ ] **Step 2: Create the proprietor dashboard component** — `apps/web/src/app/(app)/dashboard/proprietor-dashboard.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, Spinner } from "@mymakaranta/ui";
import { api, type AcademicYear, type ProprietorDashboard } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface TermOpt { id: string; label: string; isCurrent: boolean; }

export default function ProprietorDashboardView() {
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ProprietorDashboard | null>(null);
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
        /* fall through to the no-term load below */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getProprietorDashboard(termId || undefined)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [termId]);

  const pct = data ? Math.round(data.attendance.rate * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Dashboard</h1>
        {terms.length > 0 && (
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error}</div>
      ) : !data || data.term === null ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No active term yet</p>
          <p className="text-small text-ink-500 mt-1">Set a current term to see your school at a glance.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Hero: collected this week */}
          <Card elevation="sm">
            <CardBody>
              <p className="text-caption text-ink-500">Collected this week</p>
              <p className="text-h1 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">
                {formatMoney(data.fees.collectedThisWeekKobo, "NGN")}
              </p>
            </CardBody>
          </Card>

          {/* Fees row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Expected", kobo: data.fees.expectedKobo },
              { label: "Collected", kobo: data.fees.collectedKobo },
              { label: "Outstanding", kobo: data.fees.outstandingKobo },
              { label: "Overdue", kobo: data.fees.overdueKobo, tone: "text-error" },
            ].map((k) => (
              <Card key={k.label} elevation="sm">
                <CardBody>
                  <p className="text-caption text-ink-500">{k.label}</p>
                  <p className={`text-body font-semibold tabular-nums ${k.tone ?? "text-ink-1000 dark:text-ink-100"}`}>
                    {formatMoney(k.kobo, "NGN")}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Attendance + Results */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card elevation="sm">
              <CardBody>
                <p className="text-caption text-ink-500">Attendance rate</p>
                <p className="text-h2 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">{pct}%</p>
                <p className="text-caption text-ink-500 mt-1">
                  {data.attendance.presentDays} of {data.attendance.totalDays} marks (term to date)
                </p>
              </CardBody>
            </Card>
            <Card elevation="sm">
              <CardBody>
                <p className="text-caption text-ink-500">Results released</p>
                <p className="text-h2 font-display font-semibold text-ink-1000 dark:text-ink-100 tabular-nums">
                  {data.results.classesReleased} of {data.results.classesTotal}
                </p>
                <p className="text-caption text-ink-500 mt-1">
                  {data.results.topClass
                    ? `Top class: ${data.results.topClass.name} (${data.results.topClass.average}%)`
                    : "No classes released yet"}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Role branch in `dashboard/page.tsx`** — add the proprietor branch after the PARENT redirect and before the `!user.schoolId` onboarding block. Add the import at the top:
```tsx
import ProprietorDashboardView from "./proprietor-dashboard";
```
Then, right after the existing PARENT block (`if (user.identityType === "PARENT") { ... }`):
```tsx
  if (user.identityType === "PROPRIETOR" && user.schoolId) {
    return <ProprietorDashboardView />;
  }
```
(Leave the `!user.schoolId` onboarding block and the staff `quickLinks` render unchanged — non-proprietor staff still see the stub; a proprietor mid-onboarding with no `schoolId` falls through to the onboarding CTA.)

- [ ] **Step 4: Verify (no dev server running)**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: typecheck + lint clean (the pre-existing `no-page-custom-font` warning in `app/layout.tsx` is unrelated); `/dashboard` builds. Confirm `Card`/`CardBody`/`Spinner` import from `@mymakaranta/ui`, `AcademicYear.terms` shape, `formatMoney` signature.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/dashboard"
git commit -m "feat(dashboard): role-aware proprietor dashboard view (fees + attendance + results KPIs)"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing stack). Start the API (`cd apps/api && pnpm dev`; PORT 4080). Seed (one-off `apps/api/*.mjs` Prisma script, then delete it): a school with a current term + invoices (some paid, some overdue) + attendance records in-window + one released class with result sheets, AND a proprietor `User` (`identityType: "PROPRIETOR"`, `schoolId`, granted `reports.view` — proprietors are auto-granted on school create, so the simplest path is the real onboarding flow OR grant the permission row directly) with a loginable phone. OTP-login → `GET /v1/dashboard/proprietor` → assert the KPIs match the seed (fees expected/collected/outstanding/overdue + collectedThisWeek, attendance rate, classesReleased/Total, topClass). Then `?termId=<foreign>` → 401/403/404 as appropriate; a non-`reports.view` caller → 403. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 5 slice 1 entry (proprietor dashboard: `apps/api/src/modules/dashboard/`, `GET /v1/dashboard/proprietor`, KPI definitions, reuse of `summarizeInvoices`, role-aware `/dashboard`, e2e count), note **Sprint 5 (Reporting & Dashboards) in progress — slice 2 (principal operational dashboard) + slice 3 (alerts) remain**, and update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit (`pnpm exec jest`) + web vitest + UI vitest + builds, then merge `sprint-5-proprietor-dashboard` → main per the user's choice.

---

## Notes for the implementer
- **No model, no migration.** Don't `next build` while `next dev` runs; stop dev servers before API `prisma`/builds (Windows engine lock).
- **Tenant scoping is explicit** — every Prisma read in `DashboardService` carries `where: { schoolId }` (or scopes via a relation that does, e.g. `class.count` by `schoolId`); foreign `termId` → 404. Don't rely on the `$use` middleware (per the standing tenancy learning).
- **Attendance rate is a 0..1 fraction** — the web multiplies by 100. Don't return a percentage from the API (Sprint 2 rate bug).
- **`ResultSheet.average` is an `Int`**; Prisma `_avg.average` is `number | null` — `pickTopClass` handles `null`. Result sheets exist only for released classes, so the `groupBy` already excludes unreleased ones.
- **`reports.view`** is seeded + proprietor-auto-granted — no new permission, no backfill. The endpoint is permission-gated (not proprietor-gated); the **web** restricts the view to `identityType === "PROPRIETOR"`.
- **DI:** `DashboardModule` imports only `AuthModule` (guards); `PrismaModule` is `@Global`. The e2e needs `ConfigModule`/`JwtModule`/`PassportModule`/`PrismaModule`/`AuthModule`/`DashboardModule` — NOT `PaymentsProviderModule`/`EmailModule` (the dashboard touches no provider).
- **Tokens/ui** — `Card`/`CardBody`/`Spinner` from `@mymakaranta/ui`; `bg-surface`/`text-ink-*`/`text-error`/`text-caption`/`rounded-card`/`rounded-input`/`elevation="sm"` are real; `bg-canvas`/`text-brand-600` are not. `formatMoney(kobo, "NGN")`.
```
