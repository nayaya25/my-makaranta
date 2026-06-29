import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { generateVerificationCode } from "./verification.util";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";

@Injectable()
export class ReportCardService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  async getReportCard(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const sheet = await this.prisma.resultSheet.findFirst({
      where: { schoolId, studentId, termId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        class: { select: { name: true } },
        term: { select: { number: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } },
        release: { select: { releasedAt: true } },
        entries: { include: { subject: { select: { name: true } } } },
        verification: true,
      },
    });
    if (!sheet) throw new NotFoundException("No released result for this student/term.");

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, logoUrl: true, motto: true, principalSignatureUrl: true },
    });
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

    const termStart = sheet.term.startDate;
    const termEnd = sheet.term.endDate;

    await seedSkillDefaults(this.prisma, schoolId);

    const [boundaries, classSize, skillDomains, scalePoints, termRemark, presentCount, absentCount, config] =
      await Promise.all([
        this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } }),
        this.prisma.resultSheet.count({ where: { schoolId, classId: sheet.classId, termId } }),
        this.prisma.skillDomain.findMany({
          where: { schoolId },
          orderBy: { order: "asc" },
          include: {
            items: {
              orderBy: { order: "asc" },
              include: {
                ratings: {
                  where: { schoolId, studentId, termId },
                  take: 1,
                },
              },
            },
          },
        }),
        this.prisma.skillScalePoint.findMany({
          where: { schoolId },
          orderBy: { order: "asc" },
        }),
        this.prisma.termRemark.findFirst({
          where: { schoolId, studentId, termId },
        }),
        this.prisma.attendanceRecord.count({
          where: {
            schoolId,
            studentId,
            date: { gte: termStart, lte: termEnd },
            status: { in: ["PRESENT", "LATE"] },
          },
        }),
        this.prisma.attendanceRecord.count({
          where: {
            schoolId,
            studentId,
            date: { gte: termStart, lte: termEnd },
            status: "ABSENT",
          },
        }),
        this.prisma.reportCardConfig.upsert({
          where: { schoolId },
          create: { schoolId },
          update: {},
        }),
      ]);

    // Sign URLs
    const signUrl = async (key: string | null | undefined): Promise<string | null | undefined> => {
      if (key && !/^https?:\/\//.test(key)) {
        return this.storage.getSignedUrl(key);
      }
      return key;
    };

    const [signedLogoUrl, signedPrincipalSig] = await Promise.all([
      signUrl(school?.logoUrl),
      signUrl(school?.principalSignatureUrl),
    ]);

    // Build skills payload
    const skills = skillDomains.map((domain) => ({
      domain: domain.name,
      items: domain.items.map((item) => ({
        name: item.name,
        value: item.ratings[0]?.value ?? null,
      })),
    }));

    // Build scaleKey
    const scaleKey = scalePoints.map((sp) => ({ value: sp.value, label: sp.label }));

    // Attendance
    const present = presentCount;
    const absent = absentCount;
    const total = present + absent;

    return {
      school: {
        name: school?.name ?? "",
        logoUrl: signedLogoUrl ?? null,
        motto: school?.motto ?? null,
        principalSignatureUrl: signedPrincipalSig ?? null,
      },
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
      skills,
      scaleKey,
      remarks: {
        formTeacher: termRemark?.formTeacherRemark ?? null,
        principal: termRemark?.principalRemark ?? null,
      },
      attendance: { present, absent, total },
      config,
    };
  }
}
