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
