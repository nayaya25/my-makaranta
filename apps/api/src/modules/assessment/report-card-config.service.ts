import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { UpdateReportCardConfigDto } from "./dto/report-card-config.dto";

const VALID_LAYOUTS = ["classic", "modern", "compact"] as const;

@Injectable()
export class ReportCardConfigService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.prisma.reportCardConfig.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
  }

  async update(dto: UpdateReportCardConfigDto) {
    const schoolId = TenantContext.schoolIdOrThrow();

    if (dto.layout !== undefined && !VALID_LAYOUTS.includes(dto.layout as (typeof VALID_LAYOUTS)[number])) {
      throw new BadRequestException(`layout must be one of: ${VALID_LAYOUTS.join(", ")}`);
    }

    return this.prisma.reportCardConfig.upsert({
      where: { schoolId },
      create: { schoolId, ...dto },
      update: { ...dto },
    });
  }
}
