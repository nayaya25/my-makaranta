import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async verify(code: string) {
    if (!code) return { valid: false as const };
    const v = await this.prisma.verification.findUnique({ where: { code } });
    if (!v) return { valid: false as const };
    return {
      valid: true as const,
      student: v.studentName,
      className: v.className,
      term: v.termLabel,
      school: v.schoolName,
      average: v.average,
      position: v.position,
      issuedAt: v.issuedAt.toISOString(),
    };
  }
}
