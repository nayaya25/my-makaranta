import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { computeSubjectResult } from "./score.util";
import { SaveScoresDto } from "./dto/assessment.dto";
import { resolveAssessmentTypes, resolveGradeBoundaries } from "./format-resolution";

@Injectable()
export class ScoresService {
  constructor(private prisma: PrismaService) {}

  private async assertContext(schoolId: string, classId: string, subjectId: string, termId: string) {
    const [klass, subject, term] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
  }

  async getGradebook(classId: string, subjectId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertContext(schoolId, classId, subjectId, termId);

    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { classLevelId: true } });
    const classLevelId = klass!.classLevelId;

    const [assessmentTypes, gradeBoundaries, enrollments] = await Promise.all([
      resolveAssessmentTypes(this.prisma, schoolId, classLevelId),
      resolveGradeBoundaries(this.prisma, schoolId, classLevelId),
      this.prisma.enrollment.findMany({
        where: { classId, termId },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    const typeIds = assessmentTypes.map((t) => t.id);
    const studentIds = enrollments.map((e) => e.studentId);
    const rows = await this.prisma.score.findMany({
      where: { schoolId, subjectId, termId, studentId: { in: studentIds } },
    });
    const byStudent = new Map<string, { assessmentTypeId: string; value: number }[]>();
    for (const r of rows) {
      const arr = byStudent.get(r.studentId) ?? [];
      arr.push({ assessmentTypeId: r.assessmentTypeId, value: r.value });
      byStudent.set(r.studentId, arr);
    }

    const students = enrollments.map((e) => {
      const cells = byStudent.get(e.studentId) ?? [];
      const result = computeSubjectResult(cells, typeIds, gradeBoundaries);
      const scoreMap: Record<string, number> = {};
      for (const c of cells) scoreMap[c.assessmentTypeId] = c.value;
      return {
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        scores: scoreMap,
        ...result,
      };
    });

    return { assessmentTypes, gradeBoundaries, students };
  }

  async saveScores(dto: SaveScoresDto, recordedBy: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertContext(schoolId, dto.classId, dto.subjectId, dto.termId);
    const released = await this.prisma.release.findFirst({ where: { classId: dto.classId, termId: dto.termId, schoolId } });
    if (released) {
      throw new ConflictException("Results released for this class/term; correction required.");
    }

    const klassForSave = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId }, select: { classLevelId: true } });
    const types = await resolveAssessmentTypes(this.prisma, schoolId, klassForSave!.classLevelId);
    const maxById = new Map(types.map((t) => [t.id, t.maxScore]));
    const enrolled = new Set(
      (
        await this.prisma.enrollment.findMany({
          where: { classId: dto.classId, termId: dto.termId },
          select: { studentId: true },
        })
      ).map((e) => e.studentId),
    );

    for (const s of dto.scores) {
      const max = maxById.get(s.assessmentTypeId);
      if (max === undefined) throw new NotFoundException(`Unknown assessment type ${s.assessmentTypeId}.`);
      if (s.value < 0 || s.value > max) {
        throw new BadRequestException(`Score ${s.value} exceeds max ${max} for this component.`);
      }
      if (!enrolled.has(s.studentId)) {
        throw new NotFoundException(`Student ${s.studentId} is not enrolled in this class/term.`);
      }
    }

    let saved = 0;
    for (const s of dto.scores) {
      await this.prisma.score.upsert({
        where: {
          studentId_subjectId_assessmentTypeId_termId: {
            studentId: s.studentId,
            subjectId: dto.subjectId,
            assessmentTypeId: s.assessmentTypeId,
            termId: dto.termId,
          },
        },
        create: {
          schoolId,
          studentId: s.studentId,
          subjectId: dto.subjectId,
          classId: dto.classId,
          assessmentTypeId: s.assessmentTypeId,
          termId: dto.termId,
          value: s.value,
          recordedBy,
        },
        update: { value: s.value, classId: dto.classId, recordedBy },
      });
      saved++;
    }
    return { saved };
  }
}
