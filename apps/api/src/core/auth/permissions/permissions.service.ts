import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /** All permission keys granted to a user, resolved from the DB per request. */
  async keysFor(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });
    return new Set(rows.map((r) => r.permission.key));
  }
}
