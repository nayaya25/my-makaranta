import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { validateSlug } from "../../core/tenant/slug";

@Injectable()
export class SignupService {
  constructor(private readonly prisma: PrismaService) {}

  async checkSlug(slug: string): Promise<{ available: boolean; reason: string | null }> {
    const validationError = validateSlug(slug);
    if (validationError !== null) {
      return { available: false, reason: validationError };
    }

    const existing = await this.prisma.school.findUnique({ where: { slug } });
    if (existing) {
      return { available: false, reason: "taken" };
    }

    return { available: true, reason: null };
  }
}
