import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { CreateSkillDomainDto, UpdateSkillDomainDto, CreateSkillItemDto, UpdateSkillItemDto, ScalePointDto, SaveSkillRatingsDto, SkillKind } from "./dto/skills.dto";
import { assertNotReleased } from "./release-lock.util";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";
import { seedEarlyYearsDefaults } from "./early-years-defaults";

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  private async ensureSeeded(schoolId: string, kind: SkillKind = "conduct"): Promise<void> {
    if (kind === "early_years") {
      await seedEarlyYearsDefaults(this.prisma, schoolId);
    } else {
      await seedSkillDefaults(this.prisma, schoolId);
    }
  }

  async listConfig(kind: SkillKind = "conduct") {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.ensureSeeded(schoolId, kind);
    const [domains, scale] = await Promise.all([
      this.prisma.skillDomain.findMany({
        where: { schoolId, kind },
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      this.prisma.skillScalePoint.findMany({
        where: { schoolId, kind },
        orderBy: { order: "asc" },
      }),
    ]);
    return { domains, scale };
  }

  async createDomain(dto: CreateSkillDomainDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.skillDomain.create({
      data: { schoolId, name: dto.name, order: dto.order ?? 0, kind: dto.kind ?? "conduct" },
    });
  }

  async updateDomain(id: string, dto: UpdateSkillDomainDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const domain = await this.prisma.skillDomain.findFirst({ where: { id, schoolId } });
    if (!domain) throw new NotFoundException("Skill domain not found.");
    await this.prisma.skillDomain.updateMany({ where: { id, schoolId }, data: dto });
    return this.prisma.skillDomain.findFirst({ where: { id, schoolId }, include: { items: { orderBy: { order: "asc" } } } });
  }

  async deleteDomain(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const domain = await this.prisma.skillDomain.findFirst({ where: { id, schoolId } });
    if (!domain) throw new NotFoundException("Skill domain not found.");
    await this.prisma.skillDomain.deleteMany({ where: { id, schoolId } });
  }

  async createItem(dto: CreateSkillItemDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    // Verify domain belongs to this school
    const domain = await this.prisma.skillDomain.findFirst({ where: { id: dto.domainId, schoolId } });
    if (!domain) throw new NotFoundException("Skill domain not found.");
    return this.prisma.skillItem.create({
      data: { schoolId, domainId: dto.domainId, name: dto.name, order: dto.order ?? 0 },
    });
  }

  async updateItem(id: string, dto: UpdateSkillItemDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const item = await this.prisma.skillItem.findFirst({ where: { id, schoolId } });
    if (!item) throw new NotFoundException("Skill item not found.");
    await this.prisma.skillItem.updateMany({ where: { id, schoolId }, data: dto });
    return this.prisma.skillItem.findFirst({ where: { id, schoolId } });
  }

  async deleteItem(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const item = await this.prisma.skillItem.findFirst({ where: { id, schoolId } });
    if (!item) throw new NotFoundException("Skill item not found.");
    await this.prisma.skillItem.deleteMany({ where: { id, schoolId } });
  }

  async getScale(kind: SkillKind = "conduct") {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.skillScalePoint.findMany({
      where: { schoolId, kind },
      orderBy: { order: "asc" },
    });
  }

  async setScale(points: ScalePointDto[], kind: SkillKind = "conduct") {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.$transaction([
      this.prisma.skillScalePoint.deleteMany({ where: { schoolId, kind } }),
      this.prisma.skillScalePoint.createMany({
        data: points.map((p, i) => ({ schoolId, kind, value: p.value, label: p.label, order: i })),
      }),
    ]);
    return this.getScale(kind);
  }

  async getGrid(classId: string, termId: string, kind: SkillKind = "conduct") {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.ensureSeeded(schoolId, kind);

    // Verify class belongs to this school
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw new NotFoundException("Class not found in this school.");

    // Parallel fetches — filter domains and scale by kind
    const [enrollments, domains, scale, locked] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, termId, student: { schoolId } },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.skillDomain.findMany({
        where: { schoolId, kind },
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
      }),
      this.prisma.skillScalePoint.findMany({
        where: { schoolId, kind },
        orderBy: { order: "asc" },
        select: { value: true, label: true },
      }),
      this.prisma.release.findUnique({ where: { classId_termId: { classId, termId } } }),
    ]);

    const studentIds = enrollments.map((e) => e.studentId);

    // Gather item IDs for this kind to scope ratings to the right kind
    const itemIds = domains.flatMap((d) => d.items.map((i) => i.id));

    const ratings = await this.prisma.skillRating.findMany({
      where: {
        schoolId,
        termId,
        studentId: { in: studentIds },
        skillItemId: { in: itemIds },
      },
      select: { studentId: true, skillItemId: true, value: true },
    });

    return {
      locked: locked !== null,
      scale,
      domains: domains.map((d) => ({ id: d.id, name: d.name, items: d.items })),
      students: enrollments.map((e) => ({
        studentId: e.studentId,
        name: `${e.student.firstName} ${e.student.lastName}`,
      })),
      ratings,
    };
  }

  async saveRatings(dto: SaveSkillRatingsDto, recordedBy: string) {
    await assertNotReleased(this.prisma, dto.classId, dto.termId);

    const schoolId = TenantContext.schoolIdOrThrow();
    const kind: SkillKind = dto.kind ?? "conduct";

    // Verify class belongs to this school (IDOR guard)
    const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!klass) throw new NotFoundException("Class not found in this school.");

    // Build allow-sets: enrolled students and valid skill items for this school scoped to kind
    const enrolled = new Set(
      (await this.prisma.enrollment.findMany({
        where: { classId: dto.classId, termId: dto.termId, student: { schoolId } },
        select: { studentId: true },
      })).map((e) => e.studentId),
    );

    // Valid items must belong to domains of the requested kind (cross-kind IDOR guard)
    const validItems = new Set(
      (await this.prisma.skillItem.findMany({
        where: {
          schoolId,
          domain: { kind },
        },
        select: { id: true },
      })).map((i) => i.id),
    );

    for (const r of dto.ratings) {
      if (!enrolled.has(r.studentId) || !validItems.has(r.skillItemId)) {
        throw new ForbiddenException("Rating references a student or skill not in this class/school.");
      }
    }

    // For EY ratings the max is spec-mandated 3 (EY scale is fixed as {3=Secure,2=Developing,1=Beginning}
    // per AC-3 spec; no school-level override is supported for EY). For conduct, read school.skillScaleMax.
    // TODO: if dynamic EY scale support is added later, query MAX(value) from skillScalePoint where { schoolId, kind:"early_years" }.
    let max: number;
    if (kind === "early_years") {
      max = 3;
    } else {
      const school = await this.prisma.school.findFirst({ where: { id: schoolId }, select: { skillScaleMax: true } });
      max = school?.skillScaleMax ?? 5;
    }

    for (const r of dto.ratings) {
      if (r.value < 1 || r.value > max) {
        throw new BadRequestException(`Rating value ${r.value} is outside the allowed range (1–${max}).`);
      }
    }

    for (const r of dto.ratings) {
      await this.prisma.skillRating.upsert({
        where: { studentId_termId_skillItemId: { studentId: r.studentId, termId: dto.termId, skillItemId: r.skillItemId } },
        create: { schoolId, studentId: r.studentId, termId: dto.termId, skillItemId: r.skillItemId, value: r.value, recordedBy },
        update: { value: r.value, recordedBy },
      });
    }

    return { saved: dto.ratings.length };
  }
}
