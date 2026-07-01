import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { computePositions } from "./position.util";
import { generateVerificationCode } from "./verification.util";
import { resolveAssessmentTypes, resolveGradeBoundaries } from "./format-resolution";

@Injectable()
export class ReleaseService {
  constructor(private prisma: PrismaService) {}

  async release(classId: string, termId: string, releasedBy: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [klass, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");

    const existing = await this.prisma.release.findFirst({ where: { classId, termId, schoolId } });
    if (existing) throw new ConflictException("This class has already been released for this term.");

    const classLevelId = klass!.classLevelId;
    const types = await resolveAssessmentTypes(this.prisma, schoolId, classLevelId);
    const typeIds = types.map((t) => t.id);
    const boundaries = await resolveGradeBoundaries(this.prisma, schoolId, classLevelId);
    const assignments = await this.prisma.subjectAssignment.findMany({ where: { classId, academicYearId: term.academicYearId, schoolId } });
    const subjectIds = assignments.map((a) => a.subjectId);
    const enrollments = await this.prisma.enrollment.findMany({ where: { classId, termId }, select: { studentId: true } });
    const studentIds = enrollments.map((e) => e.studentId);

    const scoreRows = await this.prisma.score.findMany({
      where: { schoolId, classId, termId, studentId: { in: studentIds }, subjectId: { in: subjectIds } },
    });
    const bySS = new Map<string, Map<string, { assessmentTypeId: string; value: number }[]>>();
    for (const r of scoreRows) {
      const m = bySS.get(r.studentId) ?? new Map<string, { assessmentTypeId: string; value: number }[]>();
      const a = m.get(r.subjectId) ?? [];
      a.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
      m.set(r.subjectId, a);
      bySS.set(r.studentId, m);
    }

    const perStudent = studentIds.map((studentId) => {
      const subjMap = bySS.get(studentId) ?? new Map<string, { assessmentTypeId: string; value: number }[]>();
      const entries: { subjectId: string; total: number; grade: string }[] = [];
      const totals: number[] = [];
      for (const subjectId of subjectIds) {
        const cells = subjMap.get(subjectId);
        if (!cells || cells.length === 0) continue;
        const r = computeSubjectResult(cells, typeIds, boundaries);
        entries.push({ subjectId, total: r.total, grade: r.grade ?? "" });
        totals.push(r.total);
      }
      const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      return { studentId, entries, average };
    });
    const positions = computePositions(perStudent.map((p) => ({ studentId: p.studentId, average: p.average })));

    const academicYear = await this.prisma.academicYear.findFirst({ where: { id: term.academicYearId, schoolId } });
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    const studentRows = await this.prisma.student.findMany({ where: { id: { in: studentIds }, schoolId }, select: { id: true, firstName: true, lastName: true } });
    const nameById = new Map(studentRows.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    const termLabel = `${academicYear?.name ?? ""} · Term ${term.number}`;

    await this.prisma.$transaction(async (tx) => {
      const rel = await tx.release.create({ data: { schoolId, classId, termId, releasedBy } });
      for (const p of perStudent) {
        const rs = await tx.resultSheet.create({
          data: { schoolId, releaseId: rel.id, studentId: p.studentId, classId, termId, average: p.average, position: positions.get(p.studentId) ?? 0 },
        });
        if (p.entries.length) {
          await tx.resultSheetEntry.createMany({
            data: p.entries.map((e) => ({ schoolId, resultSheetId: rs.id, subjectId: e.subjectId, total: e.total, grade: e.grade })),
          });
        }
        await tx.verification.create({
          data: {
            code: generateVerificationCode(),
            resultSheetId: rs.id,
            schoolId,
            studentName: nameById.get(p.studentId) ?? "",
            className: klass.name,
            termLabel,
            schoolName: school?.name ?? "",
            average: p.average,
            position: positions.get(p.studentId) ?? 0,
            issuedAt: rel.releasedAt,
          },
        });
      }
    });

    return { released: perStudent.length, classId, termId };
  }

  async getStatus(termId: string) {
    if (!termId) throw new BadRequestException("termId is required.");
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    const [classes, releases] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId, enrollments: { some: { termId } } } }),
      this.prisma.release.findMany({ where: { termId, schoolId } }),
    ]);
    const relBy = new Map(releases.map((r) => [r.classId, r.releasedAt]));
    return classes.map((c) => ({
      classId: c.id,
      name: c.name,
      released: relBy.has(c.id),
      releasedAt: relBy.get(c.id)?.toISOString() ?? null,
    }));
  }

  async getSheet(classId: string, termId: string) {
    if (!classId || !termId) throw new BadRequestException("classId and termId are required.");
    const schoolId = TenantContext.schoolIdOrThrow();
    const rel = await this.prisma.release.findFirst({ where: { classId, termId, schoolId } });
    if (!rel) throw new NotFoundException("This class has not been released for this term.");
    const sheets = await this.prisma.resultSheet.findMany({
      where: { schoolId, classId, termId },
      orderBy: { position: "asc" },
      include: {
        student: { select: { firstName: true, lastName: true } },
        entries: { include: { subject: { select: { name: true } } } },
      },
    });
    return {
      releasedAt: rel.releasedAt.toISOString(),
      students: sheets.map((s) => ({
        studentId: s.studentId,
        name: `${s.student.firstName} ${s.student.lastName}`,
        average: s.average,
        position: s.position,
        entries: s.entries.map((e) => ({ subjectId: e.subjectId, subjectName: e.subject.name, total: e.total, grade: e.grade })),
      })),
    };
  }
}
