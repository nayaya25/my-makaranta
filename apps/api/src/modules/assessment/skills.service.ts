import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { CreateSkillDomainDto, UpdateSkillDomainDto, CreateSkillItemDto, UpdateSkillItemDto, ScalePointDto, SaveSkillRatingsDto } from "./dto/skills.dto";
import { assertNotReleased } from "./release-lock.util";

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  async listConfig() {
    const schoolId = TenantContext.schoolIdOrThrow();
    const [domains, scale] = await Promise.all([
      this.prisma.skillDomain.findMany({
        where: { schoolId },
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      this.prisma.skillScalePoint.findMany({
        where: { schoolId },
        orderBy: { order: "asc" },
      }),
    ]);
    return { domains, scale };
  }

  async createDomain(dto: CreateSkillDomainDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.skillDomain.create({
      data: { schoolId, name: dto.name, order: dto.order ?? 0 },
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

  async getScale() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.skillScalePoint.findMany({
      where: { schoolId },
      orderBy: { order: "asc" },
    });
  }

  async setScale(points: ScalePointDto[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.$transaction([
      this.prisma.skillScalePoint.deleteMany({ where: { schoolId } }),
      this.prisma.skillScalePoint.createMany({
        data: points.map((p, i) => ({ schoolId, value: p.value, label: p.label, order: i })),
      }),
    ]);
    return this.getScale();
  }

  async getGrid(classId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();

    // Verify class belongs to this school
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw new NotFoundException("Class not found in this school.");

    // Parallel fetches
    const [enrollments, domains, scale, locked] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, termId },
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.skillDomain.findMany({
        where: { schoolId },
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
      }),
      this.prisma.skillScalePoint.findMany({
        where: { schoolId },
        orderBy: { order: "asc" },
        select: { value: true, label: true },
      }),
      this.prisma.release.findUnique({ where: { classId_termId: { classId, termId } } }),
    ]);

    const studentIds = enrollments.map((e) => e.studentId);

    const ratings = await this.prisma.skillRating.findMany({
      where: { schoolId, termId, studentId: { in: studentIds } },
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

    // Verify class belongs to this school (IDOR guard)
    const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!klass) throw new NotFoundException("Class not found in this school.");

    // Build allow-sets: enrolled students and valid skill items for this school
    const enrolled = new Set(
      (await this.prisma.enrollment.findMany({
        where: { classId: dto.classId, termId: dto.termId },
        select: { studentId: true },
      })).map((e) => e.studentId),
    );
    const validItems = new Set(
      (await this.prisma.skillItem.findMany({
        where: { schoolId },
        select: { id: true },
      })).map((i) => i.id),
    );
    for (const r of dto.ratings) {
      if (!enrolled.has(r.studentId) || !validItems.has(r.skillItemId)) {
        throw new ForbiddenException("Rating references a student or skill not in this class/school.");
      }
    }

    const school = await this.prisma.school.findFirst({ where: { id: schoolId }, select: { skillScaleMax: true } });
    const max = school?.skillScaleMax ?? 5;

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
