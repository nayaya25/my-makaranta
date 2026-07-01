import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { nextAdmissionNo, nextApplicationNo } from "./sequence.util";
import { ALLOWED_TRANSITIONS } from "./transitions";
import { CreateApplicantDto, EnrollApplicantDto, ListApplicantsQuery, TransitionDto, UpdateApplicantDto } from "./dto/admissions.dto";
import { PublicApplicationDto } from "./dto/public-application.dto";

@Injectable()
export class AdmissionsService {
  constructor(private prisma: PrismaService) {}

  /** Staff-side intake: source=STAFF, status=APPLIED, generates applicationNo.
   *  Retries once on P2002 (unique constraint: schoolId + applicationNo). */
  async createStaff(dto: CreateApplicantDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const year = new Date().getFullYear();

    // Validate that desiredClassLevelId belongs to this school
    const level = await this.prisma.classLevel.findFirst({
      where: { id: dto.desiredClassLevelId, schoolId },
      select: { id: true },
    });
    if (!level) throw new NotFoundException("Class level not found in this school.");

    // Validate that academicYearId belongs to this school
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
      select: { id: true },
    });
    if (!academicYear) throw new NotFoundException("Academic year not found in this school.");

    const attempt = async () => {
      const applicationNo = await nextApplicationNo(
        this.prisma as unknown as Prisma.TransactionClient,
        schoolId,
        year,
      );
      return this.prisma.applicant.create({
        data: {
          schoolId,
          applicationNo,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          stateOfOrigin: dto.stateOfOrigin,
          desiredClassLevelId: dto.desiredClassLevelId,
          academicYearId: dto.academicYearId,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          guardianEmail: dto.guardianEmail,
          guardianRelation: dto.guardianRelation,
          previousSchool: dto.previousSchool,
          source: "STAFF",
          status: "APPLIED",
        },
      });
    };

    try {
      return await attempt();
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") {
        // Retry once on duplicate applicationNo
        return attempt();
      }
      throw err;
    }
  }

  async list(filter: ListApplicantsQuery) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const where: Prisma.ApplicantWhereInput = { schoolId };

    if (filter.status) where.status = filter.status;
    if (filter.level) where.desiredClassLevelId = filter.level;
    if (filter.year) where.academicYearId = filter.year;

    if (filter.q) {
      where.OR = [
        { firstName: { contains: filter.q, mode: "insensitive" } },
        { lastName: { contains: filter.q, mode: "insensitive" } },
        { applicationNo: { contains: filter.q, mode: "insensitive" } },
        { guardianPhone: { contains: filter.q, mode: "insensitive" } },
      ];
    }

    return this.prisma.applicant.findMany({ where, orderBy: { createdAt: "desc" } });
  }

  async getOne(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const applicant = await this.prisma.applicant.findFirst({ where: { id, schoolId } });
    if (!applicant) throw new NotFoundException("Applicant not found.");
    return applicant;
  }

  async patch(id: string, dto: UpdateApplicantDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const applicant = await this.prisma.applicant.findFirst({ where: { id, schoolId } });
    if (!applicant) throw new NotFoundException("Applicant not found.");

    return this.prisma.applicant.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.stateOfOrigin !== undefined ? { stateOfOrigin: dto.stateOfOrigin } : {}),
        ...(dto.desiredClassLevelId !== undefined ? { desiredClassLevelId: dto.desiredClassLevelId } : {}),
        ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
        ...(dto.guardianName !== undefined ? { guardianName: dto.guardianName } : {}),
        ...(dto.guardianPhone !== undefined ? { guardianPhone: dto.guardianPhone } : {}),
        ...(dto.guardianEmail !== undefined ? { guardianEmail: dto.guardianEmail } : {}),
        ...(dto.guardianRelation !== undefined ? { guardianRelation: dto.guardianRelation } : {}),
        ...(dto.previousSchool !== undefined ? { previousSchool: dto.previousSchool } : {}),
        ...(dto.reviewNote !== undefined ? { reviewNote: dto.reviewNote } : {}),
      },
    });
  }

  async transition(id: string, dto: TransitionDto, actorId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const applicant = await this.prisma.applicant.findFirst({ where: { id, schoolId } });
    if (!applicant) throw new NotFoundException("Applicant not found.");

    if (dto.to === "ENROLLED") {
      throw new BadRequestException("Use the enroll action to admit an applicant.");
    }

    const allowed: ApplicationStatus[] = ALLOWED_TRANSITIONS[applicant.status] ?? [];
    if (!allowed.includes(dto.to)) {
      throw new BadRequestException(`Cannot move ${applicant.status} → ${dto.to}.`);
    }

    const updated = await this.prisma.applicant.update({
      where: { id },
      data: {
        status: dto.to,
        ...(dto.to === "REJECTED"
          ? { rejectionReason: dto.reason ?? null, decidedAt: new Date() }
          : {}),
        ...(dto.to === "OFFERED" ? { decidedAt: null } : {}),
        ...(dto.reason && dto.to !== "REJECTED" ? { reviewNote: dto.reason } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        schoolId,
        actorId,
        action: "Applicant.transition",
        resourceType: "Applicant",
        resourceId: id,
        before: { status: applicant.status },
        after: { status: dto.to },
      },
    });

    return updated;
  }

  async stats() {
    const schoolId = TenantContext.schoolIdOrThrow();
    const groups = await this.prisma.applicant.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: true,
    });

    const result: Partial<Record<ApplicationStatus, number>> = {};
    for (const g of groups) {
      result[g.status] = g._count;
    }
    return result;
  }

  async enroll(id: string, dto: EnrollApplicantDto): Promise<{ studentId: string; admissionNo: string }> {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.$transaction(async (tx) => {
      const applicant = await tx.applicant.findFirst({ where: { id, schoolId } });
      if (!applicant) throw new NotFoundException("Applicant not found.");
      if (applicant.status !== "ACCEPTED" || applicant.convertedStudentId) {
        throw new BadRequestException("Only an accepted applicant that hasn't been enrolled can be admitted.");
      }
      const [cls, term] = await Promise.all([
        tx.class.findFirst({ where: { id: dto.classId, schoolId } }),
        tx.term.findFirst({ where: { id: dto.termId, schoolId } }),
      ]);
      if (!cls || !term) throw new NotFoundException("Class or term not found in this school.");

      const year = new Date().getFullYear();
      const admissionNo = dto.admissionNo?.trim() || (await nextAdmissionNo(tx, schoolId, year));

      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNo,
          firstName: applicant.firstName,
          middleName: applicant.middleName,
          lastName: applicant.lastName,
          gender: applicant.gender,
          dateOfBirth: applicant.dateOfBirth,
          stateOfOrigin: applicant.stateOfOrigin,
        },
      });

      const [gFirst, gLast] = this.splitName(applicant.guardianName);
      const parent = await tx.parent.upsert({
        where: { schoolId_phone: { schoolId, phone: applicant.guardianPhone } },
        create: {
          schoolId,
          phone: applicant.guardianPhone,
          email: applicant.guardianEmail,
          firstName: gFirst,
          lastName: gLast,
        },
        update: {},
      });
      await tx.guardian.create({
        data: {
          studentId: student.id,
          parentId: parent.id,
          relationship: applicant.guardianRelation,
          isPrimary: true,
        },
      });
      await tx.enrollment.create({
        data: { studentId: student.id, classId: dto.classId, termId: dto.termId },
      });

      await tx.applicant.update({
        where: { id },
        data: { status: "ENROLLED", decidedAt: new Date(), convertedStudentId: student.id },
      });
      return { studentId: student.id, admissionNo };
    });
  }

  /** Public portal: resolve school by slug, create source=PUBLIC applicant. No JWT/tenant context used. */
  async createPublic(dto: PublicApplicationDto): Promise<{ applicationNo: string }> {
    const school = await this.prisma.school.findUnique({ where: { slug: dto.schoolSlug } });
    if (!school) throw new NotFoundException("School not found.");

    const schoolId = school.id;
    const year = new Date().getFullYear();

    const level = await this.prisma.classLevel.findFirst({
      where: { id: dto.desiredClassLevelId, schoolId },
      select: { id: true },
    });
    if (!level) throw new NotFoundException("Class level not found in this school.");

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
      select: { id: true },
    });
    if (!academicYear) throw new NotFoundException("Academic year not found in this school.");

    const attempt = async () => {
      const applicationNo = await nextApplicationNo(
        this.prisma as unknown as Prisma.TransactionClient,
        schoolId,
        year,
      );
      await this.prisma.applicant.create({
        data: {
          schoolId,
          applicationNo,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          stateOfOrigin: dto.stateOfOrigin,
          desiredClassLevelId: dto.desiredClassLevelId,
          academicYearId: dto.academicYearId,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          guardianEmail: dto.guardianEmail,
          guardianRelation: dto.guardianRelation,
          previousSchool: dto.previousSchool,
          source: "PUBLIC",
          status: "APPLIED",
        },
      });
      return { applicationNo };
    };

    try {
      return await attempt();
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") {
        return attempt();
      }
      throw err;
    }
  }

  /** Public portal: return school name + class levels + academic years for form dropdowns. */
  async publicMeta(slug: string): Promise<{
    schoolName: string;
    classLevels: { id: string; name: string }[];
    academicYears: { id: string; name: string }[];
  }> {
    const school = await this.prisma.school.findUnique({ where: { slug } });
    if (!school) throw new NotFoundException("School not found.");

    const [classLevels, academicYears] = await Promise.all([
      this.prisma.classLevel.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
      this.prisma.academicYear.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true },
        orderBy: { startDate: "desc" },
      }),
    ]);

    return { schoolName: school.name, classLevels, academicYears };
  }

  private splitName(full: string): [string, string] {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return [parts[0]!, parts[0]!];
    const last = parts[parts.length - 1]!;
    const first = parts.slice(0, parts.length - 1).join(" ");
    return [first, last];
  }
}
