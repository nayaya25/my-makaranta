import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { CreateAcademicYearDto } from "./dto/academic-years.dto";

@Injectable()
export class AcademicYearsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAcademicYearDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const academicYear = await this.prisma.academicYear.create({
      data: {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        terms: {
          create: dto.terms.map((t) => ({
            schoolId,
            number: t.number,
            startDate: new Date(t.startDate),
            endDate: new Date(t.endDate),
            isCurrent: t.isCurrent ?? false,
          })),
        },
      } as never,
      include: { terms: true },
    });
    return academicYear;
  }

  async findAll() {
    return this.prisma.academicYear.findMany({ include: { terms: true } });
  }
}
