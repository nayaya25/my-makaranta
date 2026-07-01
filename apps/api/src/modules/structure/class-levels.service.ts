import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
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

    // Atomic tenant-IDOR guard: updateMany scopes to both id + schoolId in one query,
    // eliminating the findFirst → update race window.
    const result = await this.prisma.classLevel.updateMany({
      where: { id, schoolId },
      data: {
        ...(dto.isEarlyYears !== undefined ? { isEarlyYears: dto.isEarlyYears } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException(`ClassLevel ${id} not found`);

    // Seed EY defaults whenever isEarlyYears is being set to true (idempotent)
    if (dto.isEarlyYears === true) {
      await seedEarlyYearsDefaults(this.prisma as unknown as PrismaClient, schoolId);
    }

    return this.prisma.classLevel.findFirst({ where: { id, schoolId } });
  }
}
