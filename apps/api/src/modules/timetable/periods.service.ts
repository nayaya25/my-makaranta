import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { CreatePeriodDto, UpdatePeriodDto } from "./dto/timetable.dto";
import { assertTimeRange } from "./time.util";

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.period.findMany({
      where: { schoolId },
      orderBy: { order: "asc" },
    });
  }

  async create(dto: CreatePeriodDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    assertTimeRange(dto.startTime, dto.endTime);

    try {
      return await this.prisma.period.create({
        data: {
          ...dto,
          schoolId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BadRequestException("A period with this order already exists");
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdatePeriodDto) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const existing = await this.prisma.period.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException(`Period ${id} not found`);
    }

    // If either time is being changed, validate the merged pair
    if (dto.startTime !== undefined || dto.endTime !== undefined) {
      const mergedStart = dto.startTime ?? existing.startTime;
      const mergedEnd = dto.endTime ?? existing.endTime;
      assertTimeRange(mergedStart, mergedEnd);
    }

    return this.prisma.period.update({
      where: { id, schoolId },
      data: dto,
    });
  }

  async remove(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const existing = await this.prisma.period.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException(`Period ${id} not found`);
    }

    const usageCount = await this.prisma.timetableEntry.count({
      where: { schoolId, periodId: id },
    });
    if (usageCount > 0) {
      throw new BadRequestException("Period is used in the timetable");
    }

    await this.prisma.period.deleteMany({ where: { id, schoolId } });
  }
}
