import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { generateVerificationCode } from "./verification.util";

@Injectable()
export class ReportCardService {
  constructor(private prisma: PrismaService) {}

  async getReportCard(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const sheet = await this.prisma.resultSheet.findFirst({
      where: { schoolId, studentId, termId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        class: { select: { name: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
        release: { select: { releasedAt: true } },
        entries: { include: { subject: { select: { name: true } } } },
        verification: true,
      },
    });
    if (!sheet) throw new NotFoundException("No released result for this student/term.");

    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    const termLabel = `${sheet.term.academicYear.name} · Term ${sheet.term.number}`;

    let code = sheet.verification?.code;
    if (!code) {
      code = generateVerificationCode();
      await this.prisma.verification.create({
        data: {
          code, resultSheetId: sheet.id, schoolId,
          studentName: `${sheet.student.firstName} ${sheet.student.lastName}`,
          className: sheet.class.name, termLabel, schoolName: school?.name ?? "",
          average: sheet.average, position: sheet.position, issuedAt: sheet.release.releasedAt,
        },
      });
    }

    const [boundaries, classSize] = await Promise.all([
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } }),
      this.prisma.resultSheet.count({ where: { schoolId, classId: sheet.classId, termId } }),
    ]);

    return {
      school: { name: school?.name ?? "" },
      student: { name: `${sheet.student.firstName} ${sheet.student.lastName}`, admissionNo: sheet.student.admissionNo },
      className: sheet.class.name,
      term: { label: termLabel },
      entries: sheet.entries.map((e) => ({ subjectId: e.subjectId, subjectName: e.subject.name, total: e.total, grade: e.grade })),
      average: sheet.average,
      position: sheet.position,
      classSize,
      releasedAt: sheet.release.releasedAt.toISOString(),
      gradeKey: boundaries.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })),
      verificationCode: code,
    };
  }
}
