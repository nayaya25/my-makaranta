import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { nextApplicationNo } from "./sequence.util";
import { ALLOWED_TRANSITIONS } from "./transitions";
import { CreateApplicantDto, ListApplicantsQuery, TransitionDto, UpdateApplicantDto } from "./dto/admissions.dto";

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
}
