import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { CreateSubjectAssignmentDto, UpdateSubjectAssignmentDto } from "./dto/assessment.dto";

@Injectable()
export class SubjectAssignmentsService {
  constructor(private prisma: PrismaService) {}

  // Explicitly scope every read by schoolId — do NOT rely on the $use middleware
  // (unreliable in the service-level test context; proven in Task 5). Explicit
  // scoping also IS the IDOR check here.
  list(filters: { classId?: string; academicYearId?: string }) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.subjectAssignment.findMany({
      where: {
        schoolId,
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(dto: CreateSubjectAssignmentDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [subject, klass, staff, year] = await Promise.all([
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } }),
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
      this.prisma.staff.findFirst({ where: { id: dto.staffId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }),
    ]);
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!staff) throw new NotFoundException("Staff member not found in this school.");
    if (!year) throw new NotFoundException("Academic year not found in this school.");

    try {
      return await this.prisma.subjectAssignment.create({
        data: {
          schoolId,
          subjectId: dto.subjectId,
          classId: dto.classId,
          staffId: dto.staffId,
          academicYearId: dto.academicYearId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("This subject is already assigned for this class and year.");
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateSubjectAssignmentDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const existing = await this.prisma.subjectAssignment.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Assignment not found in this school.");
    const staff = await this.prisma.staff.findFirst({ where: { id: dto.staffId, schoolId } });
    if (!staff) throw new NotFoundException("Staff member not found in this school.");
    return this.prisma.subjectAssignment.update({ where: { id }, data: { staffId: dto.staffId } });
  }

  async remove(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const existing = await this.prisma.subjectAssignment.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Assignment not found in this school.");
    await this.prisma.subjectAssignment.delete({ where: { id } });
    return { deleted: true };
  }
}
