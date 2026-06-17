import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class ParentService {
  constructor(private prisma: PrismaService) {}

  async getChildren(user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: user.identityId, schoolId } });
    if (!parent) return [];
    const guardians = await this.prisma.guardian.findMany({
      where: { parentId: parent.id },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    });
    return guardians.map((g) => ({
      studentId: g.student.id,
      name: `${g.student.firstName} ${g.student.lastName}`,
      admissionNo: g.student.admissionNo,
    }));
  }
}
