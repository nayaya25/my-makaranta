import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateParentDto, CreateGuardianDto } from "./dto/parent.dto";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import type { SetPreferenceDto } from "../../core/notification-dispatch/dto/preference.dto";

@Injectable()
export class ParentsService {
  constructor(private prisma: PrismaService, private preferences: PreferenceService) {}

  async getNotificationPreferences(parentId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!parent) throw new NotFoundException("Parent not found.");
    return this.preferences.getForParent(schoolId, parentId);
  }

  async setNotificationPreferences(parentId: string, dto: SetPreferenceDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.preferences.setForParent(schoolId, parentId, dto);
  }

  async createParent(dto: CreateParentDto) {
    return this.prisma.parent.create({
      data: {
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        ...(dto.preferredLang !== undefined ? { preferredLang: dto.preferredLang } : {}),
      } as never,
    });
  }

  async createGuardian(studentId: string, dto: CreateGuardianDto) {
    // Both student and parent are tenant-scoped models; findUnique returns null for another
    // tenant's rows, so this rejects cross-tenant guardian links (Guardian has no schoolId).
    const [student, parent] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: studentId } }),
      this.prisma.parent.findUnique({ where: { id: dto.parentId } }),
    ]);
    if (!student) throw new NotFoundException("Student not found");
    if (!parent) throw new NotFoundException("Parent not found");

    return this.prisma.guardian.create({
      data: {
        studentId,
        parentId: dto.parentId,
        relationship: dto.relationship as never,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async findGuardians(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found");

    return this.prisma.guardian.findMany({
      where: { studentId },
      include: { parent: true },
    });
  }
}
