import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { CreateSkillDomainDto, UpdateSkillDomainDto, CreateSkillItemDto, UpdateSkillItemDto, ScalePointDto } from "./dto/skills.dto";

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
    return this.prisma.skillDomain.findUnique({ where: { id }, include: { items: { orderBy: { order: "asc" } } } });
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
    return this.prisma.skillItem.findUnique({ where: { id } });
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
}
