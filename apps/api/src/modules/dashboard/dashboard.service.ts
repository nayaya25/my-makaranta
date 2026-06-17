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

    // The term's classes (classes with an enrolment this term). Used both to scope
    // attendance to this term and as the classesTotal denominator.
    const termClasses = await this.prisma.class.findMany({
      where: { schoolId, enrollments: { some: { termId: term.id } } },
      select: { id: true },
    });
    const termClassIds = termClasses.map((c) => c.id);

    // --- Attendance (window = term.startDate .. min(now, term.endDate), scoped to this
    // term's classes so prior terms reusing the same class never contaminate the count) ---
    const windowTo = now < term.endDate ? now : term.endDate;
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { schoolId, classId: { in: termClassIds }, date: { gte: term.startDate, lte: windowTo } },
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
    const classesTotal = termClassIds.length;
    const [releases, sheetAgg] = await Promise.all([
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
