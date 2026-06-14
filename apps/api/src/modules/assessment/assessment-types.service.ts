import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AssessmentTypeItemDto } from "./dto/assessment.dto";

@Injectable()
export class AssessmentTypesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.assessmentType.findMany({ orderBy: { order: "asc" } });
  }

  async replace(types: AssessmentTypeItemDto[]) {
    const names = types.map((t) => t.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException("Assessment type names must be unique.");
    }
    const sum = types.reduce((acc, t) => acc + t.maxScore, 0);
    if (sum !== 100) {
      throw new BadRequestException(`Assessment type max scores must sum to 100 (got ${sum}).`);
    }
    // createMany is NOT auto-scoped by the tenant middleware (only single create is),
    // so set schoolId explicitly. deleteMany IS scoped by the middleware.
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.$transaction([
      this.prisma.assessmentType.deleteMany({}),
      this.prisma.assessmentType.createMany({
        data: types.map((t) => ({ schoolId, name: t.name, maxScore: t.maxScore, order: t.order })),
      }),
    ]);
    return this.list();
  }
}
