// apps/api/src/core/identity/identity.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IdentityService {
  constructor(private prisma: PrismaService) {}

  async resolvePerson(schoolId: string, identifier: string) {
    const id = identifier.trim();
    // 1) Student ID within this school
    const student = await this.prisma.studentProfile.findFirst({
      where: { schoolId, studentId: id, membershipId: { not: null } },
      include: { membership: { include: { person: true } } },
    });
    if (student?.membership?.person) {
      return { person: student.membership.person, membership: student.membership };
    }
    // 2) Global email/phone → person → membership in this school
    const person = await this.prisma.person.findFirst({
      where: { OR: [{ email: id }, { phone: id }] },
    });
    if (!person) return null;
    const membership = await this.prisma.membership.findUnique({
      where: { personId_schoolId: { personId: person.id, schoolId } },
    });
    if (!membership) return null;
    return { person, membership };
  }

  async deriveAuthz(membershipId: string): Promise<{ roles: string[]; perms: string[] }> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { membershipId },
      include: { role: { include: { permissions: true } } },
    });
    const roles = assignments.map((a) => a.role.key);
    const permIds = [...new Set(assignments.flatMap((a) => a.role.permissions.map((p) => p.permissionId)))];
    const perms = permIds.length
      ? (await this.prisma.permission.findMany({ where: { id: { in: permIds } } })).map((p) => p.key)
      : [];
    return { roles, perms };
  }
}
