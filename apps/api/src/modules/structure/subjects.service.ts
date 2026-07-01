import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SubjectCategoriesService } from "./subject-categories.service";
import { CreateSubjectDto, UpdateSubjectDto } from "./dto/subjects.dto";

@Injectable()
export class SubjectsService {
  constructor(
    private prisma: PrismaService,
    private categories: SubjectCategoriesService,
  ) {}

  async create(dto: CreateSubjectDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.categoryId) {
      await this.categories.validateForSchool(dto.categoryId, schoolId);
    }
    return this.prisma.subject.create({
      data: {
        schoolId,
        name: dto.name,
        code: dto.code,
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      } as never,
    });
  }

  async update(id: string, dto: UpdateSubjectDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    // IDOR guard: verify subject belongs to this school
    const existing = await this.prisma.subject.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Subject not found.");
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code;
    if ("categoryId" in dto) {
      if (dto.categoryId) {
        // non-empty string → validate ownership then set
        await this.categories.validateForSchool(dto.categoryId, schoolId);
        data.categoryId = dto.categoryId;
      } else {
        // "" or null/undefined but key present → clear the category
        data.categoryId = null;
      }
    }
    return this.prisma.subject.update({ where: { id }, data: data as never });
  }

  async findAll() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.subject.findMany({
      where: { schoolId },
      include: { category: true },
    });
  }
}
