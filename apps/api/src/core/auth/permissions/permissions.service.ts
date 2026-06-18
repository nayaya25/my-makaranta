import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /** All permission keys for a user: UserPermission rows + (for STAFF) their StaffPermission grants. */
  async keysFor(user: { id: string; identityType?: string; identityId?: string | null }): Promise<Set<string>> {
    const rows = await this.prisma.userPermission.findMany({ where: { userId: user.id }, include: { permission: true } });
    const keys = new Set(rows.map((r) => r.permission.key));
    if (user.identityType === "STAFF" && user.identityId) {
      const staffRows = await this.prisma.staffPermission.findMany({ where: { staffId: user.identityId }, include: { permission: true } });
      for (const r of staffRows) keys.add(r.permission.key);
    }
    return keys;
  }
}
