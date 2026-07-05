import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { CreateSchemeDto, UpdateSchemeDto } from "./dto/discounts.dto";

@Injectable()
export class DiscountsService {
  constructor(private prisma: PrismaService) {}

  private validateMethodValue(method: "PERCENT" | "FIXED", value: number) {
    if (method === "PERCENT") {
      if (value < 1 || value > 100) {
        throw new BadRequestException("PERCENT value must be between 1 and 100.");
      }
    } else {
      if (value <= 0) {
        throw new BadRequestException("FIXED value must be greater than 0.");
      }
    }
  }

  private async assertScheme(schoolId: string, id: string) {
    const scheme = await this.prisma.discountScheme.findFirst({ where: { id, schoolId } });
    if (!scheme) throw new NotFoundException("Discount scheme not found in this school.");
    return scheme;
  }

  private async assertStudent(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException("Student not found in this school.");
    return student;
  }

  async listSchemes() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.discountScheme.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async createScheme(dto: CreateSchemeDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    this.validateMethodValue(dto.method, dto.value);
    return this.prisma.discountScheme.create({
      data: {
        schoolId,
        name: dto.name,
        method: dto.method,
        value: dto.value,
        active: dto.active ?? true,
      },
    });
  }

  async updateScheme(id: string, dto: UpdateSchemeDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const scheme = await this.assertScheme(schoolId, id);

    const method = dto.method ?? scheme.method;
    const value = dto.value ?? scheme.value;
    if (dto.method !== undefined || dto.value !== undefined) {
      this.validateMethodValue(method, value);
    }

    await this.prisma.discountScheme.updateMany({
      where: { id, schoolId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return this.assertScheme(schoolId, id);
  }

  async deleteScheme(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const scheme = await this.assertScheme(schoolId, id);

    const assignedCount = await this.prisma.studentDiscount.count({
      where: { discountSchemeId: id, schoolId },
    });
    if (assignedCount > 0) {
      throw new BadRequestException("Scheme is assigned to students; deactivate it instead.");
    }

    await this.prisma.discountScheme.deleteMany({ where: { id, schoolId } });
    return scheme;
  }

  async listForStudent(studentId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertStudent(schoolId, studentId);
    return this.prisma.studentDiscount.findMany({
      where: { schoolId, studentId },
      include: { discountScheme: true },
    });
  }

  async assign(studentId: string, schemeId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertStudent(schoolId, studentId);
    await this.assertScheme(schoolId, schemeId);
    return this.prisma.studentDiscount.create({
      data: { schoolId, studentId, discountSchemeId: schemeId },
    });
  }

  async revoke(assignmentId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const assignment = await this.prisma.studentDiscount.findFirst({
      where: { id: assignmentId, schoolId },
    });
    if (!assignment) throw new NotFoundException("Assignment not found in this school.");
    await this.prisma.studentDiscount.deleteMany({ where: { id: assignmentId, schoolId } });
    return assignment;
  }

  async schemeRoster(schemeId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertScheme(schoolId, schemeId);
    return this.prisma.studentDiscount.findMany({
      where: { schoolId, discountSchemeId: schemeId },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
    });
  }
}
