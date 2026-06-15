import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AuthService } from "../../core/auth/auth.service";
import { computeSubjectResult } from "./score.util";
import { computePositions } from "./position.util";
import { CorrectScoreDto } from "./dto/assessment.dto";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class CorrectionService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  async getConfig() {
    const schoolId = TenantContext.schoolIdOrThrow();
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { requireCorrectionOtp: true } });
    return { requireCorrectionOtp: school?.requireCorrectionOtp ?? true };
  }

  async setConfig(requireCorrectionOtp: boolean) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.school.update({ where: { id: schoolId }, data: { requireCorrectionOtp } });
    return { requireCorrectionOtp };
  }

  async getCorrectableScores(classId: string, termId: string, studentId: string, subjectId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertTarget(schoolId, classId, termId, studentId, subjectId);
    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const rows = await this.prisma.score.findMany({ where: { schoolId, studentId, subjectId, termId } });
    const byType = new Map(rows.map((r) => [r.assessmentTypeId, r.value]));
    return types.map((t) => ({ assessmentTypeId: t.id, name: t.name, maxScore: t.maxScore, value: byType.get(t.id) ?? null }));
  }

  private async assertTarget(schoolId: string, classId: string, termId: string, studentId: string, subjectId: string) {
    const [klass, term, subject] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
    ]);
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    const sheet = await this.prisma.resultSheet.findFirst({ where: { schoolId, classId, termId, studentId } });
    if (!sheet) throw new NotFoundException("No released result sheet for this student/class/term.");
    return { sheet };
  }

  async correct(dto: CorrectScoreDto, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const cfg = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { requireCorrectionOtp: true } });
    const otpRequired = cfg?.requireCorrectionOtp ?? true;
    let otpVerified = false;
    if (otpRequired) {
      if (!actor.phone) throw new BadRequestException("No phone on the authenticated account for OTP.");
      if (!dto.otpCode) throw new BadRequestException("OTP code required.");
      await this.auth.assertOtp(actor.phone, dto.otpCode);
      otpVerified = true;
    }

    if (!dto.reason || dto.reason.trim().length === 0) throw new BadRequestException("A correction reason is required.");

    const { sheet } = await this.assertTarget(schoolId, dto.classId, dto.termId, dto.studentId, dto.subjectId);
    const type = await this.prisma.assessmentType.findFirst({ where: { id: dto.assessmentTypeId, schoolId } });
    if (!type) throw new NotFoundException("Assessment type not found in this school.");
    if (dto.newValue < 0 || dto.newValue > type.maxScore) {
      throw new BadRequestException(`Score ${dto.newValue} exceeds max ${type.maxScore} for this component.`);
    }

    const oldScore = await this.prisma.score.findFirst({ where: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId } });
    const oldValue = oldScore?.value ?? 0;
    const oldEntry = await this.prisma.resultSheetEntry.findFirst({ where: { schoolId, resultSheetId: sheet.id, subjectId: dto.subjectId } });
    const oldTotal = oldEntry?.total ?? 0;
    const oldPosition = sheet.position;

    const types = await this.prisma.assessmentType.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
    const typeIds = types.map((t) => t.id);
    const boundaries = await this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });

    await this.prisma.$transaction(async (tx) => {
      await tx.score.upsert({
        where: { studentId_subjectId_assessmentTypeId_termId: { studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId } },
        create: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, classId: dto.classId, assessmentTypeId: dto.assessmentTypeId, termId: dto.termId, value: dto.newValue, recordedBy: actor.id },
        update: { value: dto.newValue, classId: dto.classId, recordedBy: actor.id },
      });

      const subjScores = await tx.score.findMany({ where: { schoolId, studentId: dto.studentId, subjectId: dto.subjectId, termId: dto.termId } });
      const r = computeSubjectResult(subjScores.map((s) => ({ assessmentTypeId: s.assessmentTypeId, value: s.value })), typeIds, boundaries);
      const newTotal = r.total;

      if (oldEntry) {
        await tx.resultSheetEntry.update({ where: { id: oldEntry.id, schoolId }, data: { total: newTotal, grade: r.grade ?? "" } });
      } else {
        await tx.resultSheetEntry.create({ data: { schoolId, resultSheetId: sheet.id, subjectId: dto.subjectId, total: newTotal, grade: r.grade ?? "" } });
      }

      const entries = await tx.resultSheetEntry.findMany({ where: { schoolId, resultSheetId: sheet.id } });
      const totals = entries.map((e) => e.total);
      const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      await tx.resultSheet.update({ where: { id: sheet.id, schoolId }, data: { average } });

      const sheets = await tx.resultSheet.findMany({ where: { schoolId, classId: dto.classId, termId: dto.termId }, select: { id: true, studentId: true, average: true } });
      const positions = computePositions(sheets.map((s) => ({ studentId: s.studentId, average: s.average })));
      for (const s of sheets) {
        await tx.resultSheet.update({ where: { id: s.id, schoolId }, data: { position: positions.get(s.studentId) ?? 0 } });
      }
      const newPosition = positions.get(dto.studentId) ?? 0;

      await tx.correction.create({
        data: {
          schoolId, classId: dto.classId, termId: dto.termId, studentId: dto.studentId, subjectId: dto.subjectId, assessmentTypeId: dto.assessmentTypeId,
          oldValue, newValue: dto.newValue, oldTotal, newTotal, oldPosition, newPosition,
          reason: dto.reason.trim(), otpVerified, correctedBy: actor.id,
        },
      });
    });

    return { corrected: true };
  }
}
