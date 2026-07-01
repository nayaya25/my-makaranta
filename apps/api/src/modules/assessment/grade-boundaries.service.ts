import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { GradeBoundaryItemDto, CreateGradeBoundaryDto, ApplyAssessmentFormatsDto } from "./dto/assessment.dto";
import { GRADE_TEMPLATES } from "./templates";
import { resolveGradeBoundaries } from "./format-resolution";

@Injectable()
export class GradeBoundariesService {
  constructor(private prisma: PrismaService) {}

  /** Validates that a classLevelId belongs to the school. Throws BadRequestException if not. */
  private async validateClassLevel(schoolId: string, classLevelId: string): Promise<void> {
    const level = await this.prisma.classLevel.findFirst({ where: { id: classLevelId, schoolId } });
    if (!level) {
      throw new BadRequestException(`classLevelId "${classLevelId}" does not belong to this school.`);
    }
  }

  // Explicitly scope every read/delete by schoolId — do NOT rely on the $use middleware
  // (unreliable in the service-level test context and inside an array $transaction; proven in Task 5).

  /**
   * List grade boundaries for the school.
   * If classLevelId is provided, use the T2 resolver (overrides → defaults).
   * Each returned row is augmented with isDefault: boolean (true when classLevelId is null).
   */
  async list(classLevelId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (classLevelId) {
      await this.validateClassLevel(schoolId, classLevelId);
      const rows = await resolveGradeBoundaries(this.prisma, schoolId, classLevelId);
      return rows.map((r) => ({ ...r, isDefault: r.classLevelId === null }));
    }
    const rows = await this.prisma.gradeBoundary.findMany({
      where: { schoolId, classLevelId: null },
      orderBy: { minScore: "desc" },
    });
    return rows.map((r) => ({ ...r, isDefault: true }));
  }

  /**
   * Create a single grade boundary row.
   * classLevelId is optional; when provided, it must belong to the school.
   */
  async create(dto: CreateGradeBoundaryDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.classLevelId) {
      await this.validateClassLevel(schoolId, dto.classLevelId);
    }
    return this.prisma.gradeBoundary.create({
      data: {
        schoolId,
        grade: dto.grade,
        minScore: dto.minScore,
        remark: dto.remark,
        order: dto.order,
        classLevelId: dto.classLevelId ?? null,
      },
    });
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

  /**
   * Apply (clone) a resolved grade-boundary set from source level → each target level.
   * sourceClassLevelId=null means use the school defaults.
   * Validates all target level IDs belong to the school before starting the transaction.
   */
  async apply(dto: ApplyAssessmentFormatsDto) {
    const schoolId = TenantContext.schoolIdOrThrow();

    // Validate all targets belong to the school
    for (const targetId of dto.targetClassLevelIds) {
      await this.validateClassLevel(schoolId, targetId);
    }

    // Resolve the source rows
    const sourceRows = dto.sourceClassLevelId
      ? await resolveGradeBoundaries(this.prisma, schoolId, dto.sourceClassLevelId)
      : await this.prisma.gradeBoundary.findMany({
          where: { schoolId, classLevelId: null },
          orderBy: { minScore: "desc" },
        });

    // For each target: delete existing overrides then clone source rows
    const ops = dto.targetClassLevelIds.flatMap((targetId) => [
      this.prisma.gradeBoundary.deleteMany({ where: { schoolId, classLevelId: targetId } }),
      this.prisma.gradeBoundary.createMany({
        data: sourceRows.map((r) => ({
          schoolId,
          grade: r.grade,
          minScore: r.minScore,
          remark: r.remark,
          order: r.order,
          classLevelId: targetId,
        })),
      }),
    ]);

    await this.prisma.$transaction(ops);
  }
}
