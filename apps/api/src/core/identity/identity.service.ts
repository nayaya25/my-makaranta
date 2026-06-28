// apps/api/src/core/identity/identity.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface MeMembershipEntry {
  id: string;
  schoolId: string;
  schoolName: string;
  roles: string[];
  isStaff: boolean;
  isParent: boolean;
  isStudent: boolean;
}

export interface MeContext {
  personId: string;
  activeMembershipId: string;
  schoolId: string;
  roles: string[];
  perms: string[];
  profile: { isStaff: boolean; isParent: boolean; isStudent: boolean };
  person: { firstName: string | null; lastName: string | null };
  memberships: MeMembershipEntry[];
}

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

  async getMeContext(personId: string, activeMembershipId: string): Promise<MeContext> {
    // Load all memberships for this person with profile relations
    const memberships = await this.prisma.membership.findMany({
      where: { personId },
      include: {
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true } },
        guardianOf: { select: { id: true } },
        roles: { include: { role: true } },
        person: { select: { firstName: true, lastName: true } },
      },
    });

    // Collect unique schoolIds so we can fetch names in one query
    const schoolIds = [...new Set(memberships.map((m) => m.schoolId))];
    const schools = await this.prisma.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true },
    });
    const schoolMap = new Map(schools.map((s) => [s.id, s.name]));

    const membershipEntries: MeMembershipEntry[] = memberships.map((m) => ({
      id: m.id,
      schoolId: m.schoolId,
      schoolName: schoolMap.get(m.schoolId) ?? "",
      roles: m.roles.map((r) => r.role.key),
      isStaff: m.staffProfile !== null,
      isParent: m.guardianOf.length > 0,
      isStudent: m.studentProfile !== null,
    }));

    const active = membershipEntries.find((m) => m.id === activeMembershipId);
    const activeMembership = memberships.find((m) => m.id === activeMembershipId);

    const { roles, perms } = await this.deriveAuthz(activeMembershipId);

    const person = activeMembership?.person ?? { firstName: null, lastName: null };

    return {
      personId,
      activeMembershipId,
      schoolId: active?.schoolId ?? activeMembership?.schoolId ?? "",
      roles,
      perms,
      profile: {
        isStaff: active?.isStaff ?? false,
        isParent: active?.isParent ?? false,
        isStudent: active?.isStudent ?? false,
      },
      person: { firstName: person.firstName ?? null, lastName: person.lastName ?? null },
      memberships: membershipEntries,
    };
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
