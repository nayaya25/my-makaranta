import { Injectable } from "@nestjs/common";
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
    if (dto.categoryId) {
      await this.categories.validateForSchool(dto.categoryId, schoolId);
    }
    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      } as never,
    });
  }

  async findAll() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.subject.findMany({
      where: { schoolId },
      include: { category: true },
    });
  }
}
