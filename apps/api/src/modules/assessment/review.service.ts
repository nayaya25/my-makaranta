import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { flagAnomalies, type AnomalyInfo } from "./anomaly.util";
import { resolveAssessmentTypes, resolveGradeBoundaries } from "./format-resolution";

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

  // Build a per-level-aware cohort: each student's total is computed using the type-ids for
  // their class's level, so override classes are not penalised with mismatched type lookups.
  private async cohortPerLevel(
    schoolId: string,
    subjectId: string,
    termId: string,
    academicYearId: string,
  ) {
    // Load assignments to get classId → classLevelId mapping (schoolId-scoped per tenant rule)
    const assignments = await this.prisma.subjectAssignment.findMany({
      where: { subjectId, academicYearId, class: { schoolId } },
      include: { class: { select: { id: true, classLevelId: true } } },
    });

    // Build classId → classLevelId map
    const classLevelMap = new Map<string, string>(); // classId → classLevelId
    for (const a of assignments) classLevelMap.set(a.classId, a.class.classLevelId);

    // Resolve type-ids once per distinct classLevelId
    const typeIdsByLevel = new Map<string, string[]>(); // classLevelId → typeIds
    for (const classLevelId of new Set(classLevelMap.values())) {
      const types = await resolveAssessmentTypes(this.prisma, schoolId, classLevelId);
      typeIdsByLevel.set(classLevelId, types.map((t) => t.id));
    }

    // Load all scores for subject+term
    const allRows = await this.prisma.score.findMany({ where: { schoolId, subjectId, termId } });

    // Group by student; pick classLevelId from the score's classId
    const byStudent = new Map<string, { classLevelId: string; cells: { assessmentTypeId: string; value: number }[] }>();
    for (const r of allRows) {
      const lvl = classLevelMap.get(r.classId) ?? "";
      if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, { classLevelId: lvl, cells: [] });
      byStudent.get(r.studentId)!.cells.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
    }

    // Compute per-student totals with correct type-ids
    // Cohort z-scores compare each student's raw total against their own class's format — cross-level totals are comparable because both are out-of-format, but max-score may differ between levels.
    const totals = [...byStudent.entries()].map(([studentId, { classLevelId, cells }]) => ({
      studentId,
      total: computeSubjectResult(cells, typeIdsByLevel.get(classLevelId) ?? [], []).total,
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

    const classLevelId = klass!.classLevelId;
    const types = await resolveAssessmentTypes(this.prisma, schoolId, classLevelId);
    const typeIds = types.map((t) => t.id);
    const boundaries = await resolveGradeBoundaries(this.prisma, schoolId, classLevelId);

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
    // Resolve all subjects in parallel (avoids a serial N+1 over the class's subjects).
    const cohortBySubject = new Map<string, Map<string, AnomalyInfo>>();
    const cellsBySubjectStudent = new Map<string, Map<string, { assessmentTypeId: string; value: number }[]>>();
    await Promise.all(
      subjects.map(async (s) => {
        const [{ anomalies }, rows] = await Promise.all([
          this.cohort(schoolId, s.id, termId, typeIds),
          this.prisma.score.findMany({ where: { schoolId, subjectId: s.id, termId, studentId: { in: studentIds } } }),
        ]);
        cohortBySubject.set(s.id, anomalies);
        const byStudent = new Map<string, { assessmentTypeId: string; value: number }[]>();
        for (const r of rows) {
          const a = byStudent.get(r.studentId) ?? [];
          a.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
          byStudent.set(r.studentId, a);
        }
        cellsBySubjectStudent.set(s.id, byStudent);
      }),
    );

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

    // For the cross-class cohort (anomaly/z-score), use per-level type-ids so students in
    // override-format classes are not scored with mismatched ids. Grade lookup is resolved per-class below.
    const { totals, anomalies } = await this.cohortPerLevel(schoolId, subjectId, termId, term.academicYearId);
    const totalByStudent = new Map(totals.map((t) => [t.studentId, t.total]));
    const subjectMean = totals.length ? totals.reduce((a, t) => a + t.total, 0) / totals.length : 0;
    const subjectStdDev = totals.length
      ? Math.sqrt(totals.reduce((a, t) => a + (t.total - subjectMean) ** 2, 0) / totals.length)
      : 0;

    // Classes offering this subject this year, that have enrollments this term (schoolId-scoped).
    const assignments = await this.prisma.subjectAssignment.findMany({
      where: { subjectId, academicYearId: term.academicYearId, class: { schoolId } },
      include: { class: { select: { id: true, name: true, classLevelId: true } } },
    });
    const classes = [];
    for (const a of assignments) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { classId: a.classId, termId },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (enrollments.length === 0) continue;
      // Resolve grade boundaries for this class's level
      const classBoundaries = await resolveGradeBoundaries(this.prisma, schoolId, a.class.classLevelId);
      // Only students with a score in this subject/term — keeps class mean on the same
      // (scored-only) population as subjectMean, so drift compares like with like and
      // un-scored enrollees don't appear as phantom 0s during partial entry.
      const students = enrollments
        .filter((e) => totalByStudent.has(e.studentId))
        .map((e) => {
          const total = totalByStudent.get(e.studentId)!;
          const grade = computeSubjectResult(
            [{ assessmentTypeId: "_", value: total }], // total already summed; map via boundaries directly
            ["_"], classBoundaries,
          ).grade;
          const info = anomalies.get(e.studentId);
          return { studentId: e.studentId, name: `${e.student.firstName} ${e.student.lastName}`, total, grade, z: info?.z ?? 0, anomaly: info?.anomaly ?? false };
        });
      if (students.length === 0) continue;
      const mean = students.reduce((x, s) => x + s.total, 0) / students.length;
      classes.push({ classId: a.classId, name: a.class.name, mean, drift: mean - subjectMean, students });
    }

    return { subjectMean, subjectStdDev, classes };
  }
}
