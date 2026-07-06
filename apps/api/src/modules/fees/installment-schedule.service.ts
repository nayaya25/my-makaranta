import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SetInstallmentDto } from "./dto/installments.dto";

@Injectable()
export class InstallmentScheduleService {
  constructor(private prisma: PrismaService) {}

  private async assertClassLevelTerm(schoolId: string, classLevelId: string, termId: string) {
    const [lvl, term] = await Promise.all([
      this.prisma.classLevel.findFirst({ where: { id: classLevelId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ]);
    if (!lvl) throw new NotFoundException("Class level not found in this school.");
    if (!term) throw new NotFoundException("Term not found in this school.");
  }

  async getSchedule(classLevelId: string, termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);
    return this.prisma.scheduleInstallment.findMany({
      where: { schoolId, classLevelId, termId },
      orderBy: { order: "asc" },
    });
  }

  async setSchedule(classLevelId: string, termId: string, rows: SetInstallmentDto[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertClassLevelTerm(schoolId, classLevelId, termId);

    for (const row of rows) {
      if (row.percentBps < 1 || row.percentBps > 10000) {
        throw new BadRequestException("Installment percentBps must be between 1 and 10000.");
      }
    }
    if (rows.length) {
      const sum = rows.reduce((s, r) => s + r.percentBps, 0);
      if (sum !== 10000) {
        throw new BadRequestException("Installment percentages must total 100%.");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduleInstallment.deleteMany({ where: { schoolId, classLevelId, termId } });
      if (rows.length) {
        await tx.scheduleInstallment.createMany({
          data: rows.map((r) => ({
            schoolId,
            classLevelId,
            termId,
            order: r.order,
            label: r.label ?? null,
            percentBps: r.percentBps,
            dueDate: new Date(r.dueDate),
          })),
        });
      }
    });

    return this.getSchedule(classLevelId, termId);
  }
}
