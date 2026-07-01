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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getReportCard(studentId: string, termId: string): Promise<Record<string, any>> {
    const schoolId = TenantContext.schoolIdOrThrow();

    // Step 1: Look up enrollment to determine the class and whether it's EY
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, termId },
      include: {
        class: {
          include: { classLevel: true },
        },
      },
    });

    // Load the term for dates/labels regardless of mode
    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
      include: { academicYear: { select: { name: true } } },
    });

    const isEarlyYears = enrollment?.class?.classLevel?.isEarlyYears === true;

    if (isEarlyYears) {
      return this._getEarlyYearsReportCard(studentId, termId, schoolId, enrollment!, term!);
    } else {
      return this._getStandardReportCard(studentId, termId, schoolId, term!);
    }
  }

  private async _getEarlyYearsReportCard(
    studentId: string,
    termId: string,
    schoolId: string,
    enrollment: {
      class: { name: string; classLevel: { isEarlyYears: boolean } };
    },
    term: { number: number; startDate: Date; endDate: Date; academicYear: { name: string } },
  ) {
    const termStart = term.startDate;
    const termEnd = term.endDate;
    const termLabel = `${term.academicYear.name} · Term ${term.number}`;

    const signUrl = async (key: string | null | undefined): Promise<string | null | undefined> => {
      if (key && !/^https?:\/\//.test(key)) {
        return this.storage.getSignedUrl(key);
      }
      return key;
    };

    const [school, eyDomains, eyScalePoints, termRemark, presentCount, absentCount] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, logoUrl: true, motto: true, principalSignatureUrl: true },
      }),
      this.prisma.skillDomain.findMany({
        where: { schoolId, kind: "early_years" },
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
        where: { schoolId, kind: "early_years" },
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
    ]);

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { firstName: true, lastName: true, admissionNo: true },
    });

    const [signedLogoUrl, signedPrincipalSig] = await Promise.all([
      signUrl(school?.logoUrl),
      signUrl(school?.principalSignatureUrl),
    ]);

    // Build scale lookup map for labels
    const scaleLookup = new Map<number, string>(eyScalePoints.map((sp) => [sp.value, sp.label]));

    // Build areas with items and ratings
    const areas = eyDomains.map((domain) => ({
      area: domain.name,
      items: domain.items.map((item) => {
        const rating = item.ratings[0];
        return {
          name: item.name,
          rating: rating
            ? { value: rating.value, label: scaleLookup.get(rating.value) ?? String(rating.value) }
            : null,
        };
      }),
    }));

    const scaleKey = eyScalePoints.map((sp) => ({ value: sp.value, label: sp.label }));

    const present = presentCount;
    const absent = absentCount;
    const total = present + absent;

    return {
      mode: "early_years" as const,
      student: {
        name: `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim(),
        admissionNo: student?.admissionNo ?? "",
      },
      class: { name: enrollment.class.name },
      term: { label: termLabel },
      school: {
        name: school?.name ?? "",
        logoUrl: signedLogoUrl ?? null,
        motto: school?.motto ?? null,
        principalSignatureUrl: signedPrincipalSig ?? null,
      },
      areas,
      scaleKey,
      narrative: {
        formTeacher: termRemark?.formTeacherRemark ?? null,
        principal: termRemark?.principalRemark ?? null,
      },
      attendance: { present, absent, total },
    };
  }

  private async _getStandardReportCard(
    studentId: string,
    termId: string,
    schoolId: string,
    _term: unknown,
  ) {
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
          where: { schoolId, kind: "conduct" },
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
          where: { schoolId, kind: "conduct" },
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

    // Build skills payload — conduct kind only
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
      mode: "standard" as const,
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
