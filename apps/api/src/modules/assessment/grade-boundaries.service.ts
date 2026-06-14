import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { GradeBoundaryItemDto } from "./dto/assessment.dto";
import { GRADE_TEMPLATES } from "./templates";

@Injectable()
export class GradeBoundariesService {
  constructor(private prisma: PrismaService) {}

  // Explicitly scope every read/delete by schoolId — do NOT rely on the $use middleware
  // (unreliable in the service-level test context and inside an array $transaction; proven in Task 5).
  list() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } });
  }

  async replace(boundaries: GradeBoundaryItemDto[]) {
    const grades = boundaries.map((b) => b.grade);
    if (new Set(grades).size !== grades.length) {
      throw new BadRequestException("Grade labels must be unique.");
    }
    const mins = boundaries.map((b) => b.minScore);
    if (new Set(mins).size !== mins.length) {
      throw new BadRequestException("Grade boundary minimum scores must be unique.");
    }
    if (mins.some((m) => m < 0 || m > 100)) {
      throw new BadRequestException("Grade boundary minimum scores must be between 0 and 100.");
    }
    if (!mins.includes(0)) {
      throw new BadRequestException("Grade boundaries must include a catch-all band with minScore 0.");
    }

    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.$transaction([
      this.prisma.gradeBoundary.deleteMany({ where: { schoolId } }),
      this.prisma.gradeBoundary.createMany({
        data: boundaries.map((b) => ({
          schoolId,
          grade: b.grade,
          minScore: b.minScore,
          remark: b.remark,
          order: b.order,
        })),
      }),
    ]);
    return this.list();
  }

  applyTemplate(template: "WAEC" | "NECO") {
    return this.replace(GRADE_TEMPLATES[template]);
  }
}
