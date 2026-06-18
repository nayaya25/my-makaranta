import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ROLE_PRESETS } from "./permission-presets";

@Injectable()
export class StaffAccessService {
  constructor(private prisma: PrismaService) {}

  async getCatalog() {
    const catalog = await this.prisma.permission.findMany({ orderBy: { key: "asc" }, select: { key: true, description: true } });
    return { catalog, presets: ROLE_PRESETS };
  }

  private async assertStaff(staffId: string, schoolId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true } });
    if (!staff) throw new NotFoundException("Staff not found in this school.");
  }

  async getStaffPermissions(staffId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertStaff(staffId, schoolId);
    const rows = await this.prisma.staffPermission.findMany({ where: { staffId }, include: { permission: { select: { key: true } } } });
    return { keys: rows.map((r) => r.permission.key).sort() };
  }

  async setStaffPermissions(staffId: string, keys: string[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    // A staff who holds staff.manage may manage OTHER staff — never elevate their own grant.
    const callerUserId = TenantContext.current()?.userId;
    if (callerUserId) {
      const caller = await this.prisma.user.findFirst({ where: { id: callerUserId }, select: { identityType: true, identityId: true } });
      if (caller?.identityType === "STAFF" && caller.identityId === staffId) {
        throw new ForbiddenException("You cannot modify your own permissions.");
      }
    }
    await this.assertStaff(staffId, schoolId);
    const unique = [...new Set(keys)];
    const perms = unique.length ? await this.prisma.permission.findMany({ where: { key: { in: unique } }, select: { id: true, key: true } }) : [];
    if (perms.length !== unique.length) {
      const known = new Set(perms.map((p) => p.key));
      const bad = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission(s): ${bad.join(", ")}`);
    }
    await this.prisma.$transaction([
      this.prisma.staffPermission.deleteMany({ where: { staffId } }),
      this.prisma.staffPermission.createMany({ data: perms.map((p) => ({ staffId, permissionId: p.id })) }),
    ]);
    // best-effort audit
    try {
      await this.prisma.auditLog.create({ data: { schoolId, actorId: TenantContext.current()?.userId ?? "", action: "Staff.setPermissions", resourceType: "Staff", resourceId: staffId, after: { keys: unique } } });
    } catch { /* never break the grant */ }
    return { keys: unique.sort() };
  }
}
