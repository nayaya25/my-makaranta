import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AssessmentTypeItemDto, CreateAssessmentTypeDto, ApplyAssessmentFormatsDto } from "./dto/assessment.dto";
import { resolveAssessmentTypes } from "./format-resolution";

@Injectable()
export class AssessmentTypesService {
  constructor(private prisma: PrismaService) {}

  /** Validates that a classLevelId belongs to the school. Throws BadRequestException if not. */
  private async validateClassLevel(schoolId: string, classLevelId: string): Promise<void> {
    const level = await this.prisma.classLevel.findFirst({ where: { id: classLevelId, schoolId } });
    if (!level) {
      throw new BadRequestException(`classLevelId "${classLevelId}" does not belong to this school.`);
    }
  }

  /**
   * List assessment types for the school.
   * If classLevelId is provided, use the T2 resolver (overrides → defaults).
   * Each returned row is augmented with isDefault: boolean (true when classLevelId is null).
   */
  async list(classLevelId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (classLevelId) {
      await this.validateClassLevel(schoolId, classLevelId);
      const rows = await resolveAssessmentTypes(this.prisma, schoolId, classLevelId);
      return rows.map((r) => ({ ...r, isDefault: r.classLevelId === null }));
    }
    const rows = await this.prisma.assessmentType.findMany({
      where: { schoolId, classLevelId: null },
      orderBy: { order: "asc" },
    });
    return rows.map((r) => ({ ...r, isDefault: true }));
  }

  /**
   * Create a single assessment type row.
   * classLevelId is optional; when provided, it must belong to the school.
   */
  async create(dto: CreateAssessmentTypeDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.classLevelId) {
      await this.validateClassLevel(schoolId, dto.classLevelId);
    }
    return this.prisma.assessmentType.create({
      data: {
        schoolId,
        name: dto.name,
        maxScore: dto.maxScore,
        order: dto.order,
        classLevelId: dto.classLevelId ?? null,
      },
    });
  }

  /**
   * Bulk-replace the school-wide default set (classLevelId IS NULL).
   * Existing method — unchanged.
   */
  async replace(types: AssessmentTypeItemDto[]) {
    const names = types.map((t) => t.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException("Assessment type names must be unique.");
    }
    const sum = types.reduce((acc, t) => acc + t.maxScore, 0);
    if (sum !== 100) {
      throw new BadRequestException(`Assessment type max scores must sum to 100 (got ${sum}).`);
    }
    // Scope BOTH ops explicitly: the tenant middleware does not reliably scope
    // operations executed inside an array $transaction, so never rely on it here.
    const schoolId = TenantContext.schoolIdOrThrow();
    const scoreCount = await this.prisma.score.count({ where: { schoolId } });
    if (scoreCount > 0) {
      throw new ConflictException("Cannot change assessment structure after scores have been entered.");
    }
    await this.prisma.$transaction([
      this.prisma.assessmentType.deleteMany({ where: { schoolId } }),
      this.prisma.assessmentType.createMany({
        data: types.map((t) => ({ schoolId, name: t.name, maxScore: t.maxScore, order: t.order })),
      }),
    ]);
    return this.list();
  }

  /**
   * Apply (clone) a resolved assessment-type set from source level → each target level.
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
      ? await resolveAssessmentTypes(this.prisma, schoolId, dto.sourceClassLevelId)
      : await this.prisma.assessmentType.findMany({
          where: { schoolId, classLevelId: null },
          orderBy: { order: "asc" },
        });

    // For each target: delete existing overrides then clone source rows
    const ops = dto.targetClassLevelIds.flatMap((targetId) => [
      this.prisma.assessmentType.deleteMany({ where: { schoolId, classLevelId: targetId } }),
      this.prisma.assessmentType.createMany({
        data: sourceRows.map((r) => ({
          schoolId,
          name: r.name,
          maxScore: r.maxScore,
          order: r.order,
          classLevelId: targetId,
        })),
      }),
    ]);

    await this.prisma.$transaction(ops);
  }
}
