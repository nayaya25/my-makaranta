import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { summarizeInvoices, type SummaryRow } from "../fees/finance-summary.util";
import { attendanceRate, pickTopClass, feePaidRate, type AttendanceCounts, type TopClassRow } from "./dashboard.util";

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

    // Offered subjects per class (subject assignments this academic year) — keep the
    // subjectId set so coverage counts only scores for subjects actually offered.
    const offered = await this.prisma.subjectAssignment.findMany({
      where: { schoolId, classId: { in: classIds }, academicYearId: term.academicYearId },
      select: { classId: true, subjectId: true },
    });
    const offeredBy = new Map<string, Set<string>>();
    for (const o of offered) {
      const set = offeredBy.get(o.classId) ?? new Set<string>();
      set.add(o.subjectId);
      offeredBy.set(o.classId, set);
    }

    // Scored subjects per class (distinct subjectId with >=1 score this term)
    const scoredRows = await this.prisma.score.findMany({
      where: { schoolId, termId: term.id, classId: { in: classIds } },
      distinct: ["classId", "subjectId"],
      select: { classId: true, subjectId: true },
    });
    const scoredBy = new Map<string, Set<string>>();
    for (const s of scoredRows) {
      const set = scoredBy.get(s.classId) ?? new Set<string>();
      set.add(s.subjectId);
      scoredBy.set(s.classId, set);
    }

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
      const offeredSet = offeredBy.get(c.id) ?? new Set<string>();
      const scoredSet = scoredBy.get(c.id) ?? new Set<string>();
      // Coverage = offered subjects that have >=1 score (so a score for a no-longer-offered
      // subject can never push scored above offered).
      let subjectsScored = 0;
      for (const sid of scoredSet) if (offeredSet.has(sid)) subjectsScored++;
      return {
        classId: c.id,
        className: c.name,
        formTeacher: c.formTeacherId ? (teacherBy.get(c.formTeacherId) ?? null) : null,
        attendance: attendanceRate(counts),
        results: { subjectsScored, subjectsOffered: offeredSet.size, released: releasedSet.has(c.id) },
        fees: { expectedKobo: fee.expectedKobo, collectedKobo: fee.collectedKobo, paidRate: feePaidRate(fee.collectedKobo, fee.expectedKobo) },
      };
    });

    return { term: termHeader, classes: rows };
  }
}
