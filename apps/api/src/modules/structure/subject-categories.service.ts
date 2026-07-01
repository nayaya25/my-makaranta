import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { seedSubjectCategories } from "../../../prisma/seed-subject-categories";
import { CreateSubjectCategoryDto, UpdateSubjectCategoryDto } from "./dto/subject-categories.dto";

@Injectable()
export class SubjectCategoriesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const schoolId = TenantContext.schoolIdOrThrow();
    await seedSubjectCategories(this.prisma, schoolId);
    return this.prisma.subjectCategory.findMany({
      where: { schoolId },
      orderBy: { order: "asc" },
    });
  }

  async create(dto: CreateSubjectCategoryDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const maxOrder = await this.prisma.subjectCategory.aggregate({
      where: { schoolId },
      _max: { order: true },
    });
    const order = dto.order ?? (maxOrder._max.order ?? 0) + 1;
    return this.prisma.subjectCategory.create({
      data: { schoolId, name: dto.name, order },
    });
  }

  async update(id: string, dto: UpdateSubjectCategoryDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
    if (!cat) throw new NotFoundException("Subject category not found.");
    return this.prisma.subjectCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async remove(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
    if (!cat) throw new NotFoundException("Subject category not found.");
    await this.prisma.subjectCategory.delete({ where: { id } });
    return { deleted: true };
  }

  /** Validates that a categoryId belongs to the given school. Returns the category or throws 400. */
  async validateForSchool(categoryId: string, schoolId: string) {
    const cat = await this.prisma.subjectCategory.findFirst({ where: { id: categoryId, schoolId } });
    if (!cat) {
      throw new BadRequestException("categoryId does not belong to this school.");
    }
    return cat;
  }
}
