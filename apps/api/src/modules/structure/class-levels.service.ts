import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { seedEarlyYearsDefaults } from "../assessment/early-years-defaults";
import { ClassLevelItemDto, UpdateClassLevelDto } from "./dto/class-levels.dto";

@Injectable()
export class ClassLevelsService {
  constructor(private prisma: PrismaService) {}

  async createMany(items: ClassLevelItemDto[]) {
    const created = await Promise.all(
      items.map((item) =>
        this.prisma.classLevel.create({ data: { name: item.name, order: item.order } as never }),
      ),
    );
    return created;
  }

  async findAll() {
    return this.prisma.classLevel.findMany({ orderBy: { order: "asc" } });
  }

  async updateLevel(id: string, dto: UpdateClassLevelDto) {
    const schoolId = TenantContext.schoolIdOrThrow();

    // Tenant-IDOR guard: verify the level belongs to the caller's school
    const existing = await this.prisma.classLevel.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException(`ClassLevel not found.`);

    const updated = await this.prisma.classLevel.update({
      where: { id },
      data: {
        ...(dto.isEarlyYears !== undefined ? { isEarlyYears: dto.isEarlyYears } : {}),
      },
    });

    // Seed EY defaults whenever isEarlyYears is being set to true (idempotent)
    if (dto.isEarlyYears === true) {
      await seedEarlyYearsDefaults(this.prisma as never, schoolId);
    }

    return updated;
  }
}
