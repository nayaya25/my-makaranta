import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { assertNotReleased } from "./release-lock.util";
import type { UpsertRemarkDto, RemarkCapabilities } from "./dto/remarks.dto";

@Injectable()
export class RemarksService {
  constructor(private prisma: PrismaService) {}

  async upsertRemark(dto: UpsertRemarkDto, caps: RemarkCapabilities) {
    const { studentId, termId, classId, formTeacherRemark, principalRemark } = dto;
    const schoolId = TenantContext.schoolIdOrThrow();

    // Per-field permission checks
    if (formTeacherRemark !== undefined && !caps.canForm) {
      throw new ForbiddenException("Requires skills.record permission to set formTeacherRemark.");
    }
    if (principalRemark !== undefined && !caps.canPrincipal) {
      throw new ForbiddenException("Requires results.review permission to set principalRemark.");
    }

    // Lock check
    await assertNotReleased(this.prisma, classId, termId);

    // IDOR guard 1: class belongs to school
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw new NotFoundException("Class not found in this school.");

    // IDOR guard 2: student enrolled in (classId, termId)
    const enrollment = await this.prisma.enrollment.findFirst({ where: { classId, termId, studentId } });
    if (!enrollment) throw new ForbiddenException("Student is not enrolled in this class/term.");

    // Build only the data fields that were provided
    const updateData: { formTeacherRemark?: string; principalRemark?: string } = {};
    if (formTeacherRemark !== undefined) updateData.formTeacherRemark = formTeacherRemark;
    if (principalRemark !== undefined) updateData.principalRemark = principalRemark;

    return this.prisma.termRemark.upsert({
      where: { studentId_termId: { studentId, termId } },
      create: { schoolId, studentId, termId, ...updateData },
      update: updateData,
    });
  }

  async getRemark(studentId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.termRemark.findFirst({ where: { studentId, termId, schoolId } });
  }
}
