import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PutEntryDto } from "./dto/timetable.dto";
import { PeriodsService } from "./periods.service";

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodsService: PeriodsService,
  ) {}

  async putEntry(dto: PutEntryDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (dto.dayOfWeek < 1 || dto.dayOfWeek > 5) {
      throw new BadRequestException("dayOfWeek must be 1–5 (Mon–Fri).");
    }

    const [cls, year, period, assignment] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }),
      this.prisma.period.findFirst({ where: { id: dto.periodId, schoolId } }),
      this.prisma.subjectAssignment.findFirst({
        where: { id: dto.subjectAssignmentId, schoolId },
        include: {
          subject: { select: { name: true } },
          staff: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    if (!cls || !year || !period) {
      throw new NotFoundException("Class, year, or period not found in this school.");
    }
    if (!assignment) {
      throw new NotFoundException("Subject assignment not found in this school.");
    }
    if (assignment.classId !== dto.classId || assignment.academicYearId !== dto.academicYearId) {
      throw new BadRequestException("That subject assignment does not belong to this class and year.");
    }
    if (period.isBreak) {
      throw new BadRequestException("Cannot schedule into a break period.");
    }

    // Teacher hard-block: same teacher, same year/day/period, a DIFFERENT class.
    const clash = await this.prisma.timetableEntry.findFirst({
      where: {
        schoolId,
        academicYearId: dto.academicYearId,
        dayOfWeek: dto.dayOfWeek,
        periodId: dto.periodId,
        classId: { not: dto.classId },
        subjectAssignment: { staffId: assignment.staff.id },
      },
      include: { class: { select: { name: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        `${assignment.staff.firstName} ${assignment.staff.lastName} is already scheduled for ${clash.class.name} at this time.`,
      );
    }

    return this.prisma.timetableEntry.upsert({
      where: {
        classId_academicYearId_dayOfWeek_periodId: {
          classId: dto.classId,
          academicYearId: dto.academicYearId,
          dayOfWeek: dto.dayOfWeek,
          periodId: dto.periodId,
        },
      },
      create: { schoolId, ...dto },
      update: { subjectAssignmentId: dto.subjectAssignmentId },
    });
  }

  async deleteEntry(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const result = await this.prisma.timetableEntry.deleteMany({ where: { id, schoolId } });
    if (result.count === 0) {
      throw new NotFoundException(`TimetableEntry ${id} not found`);
    }
  }

  async getClassGrid(classId: string, academicYearId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const [periods, rawEntries] = await Promise.all([
      this.periodsService.list(),
      this.prisma.timetableEntry.findMany({
        where: { schoolId, classId, academicYearId },
        include: {
          subjectAssignment: {
            include: {
              subject: { select: { name: true } },
              staff: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    const entries = rawEntries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      subjectAssignmentId: e.subjectAssignmentId,
      subjectName: e.subjectAssignment.subject.name,
      teacherName: `${e.subjectAssignment.staff.firstName} ${e.subjectAssignment.staff.lastName}`.trim(),
    }));

    return { periods, entries };
  }

  async getTeacherGrid(staffId: string, academicYearId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();

    const [periods, rawEntries] = await Promise.all([
      this.periodsService.list(),
      this.prisma.timetableEntry.findMany({
        where: {
          schoolId,
          academicYearId,
          subjectAssignment: { staffId },
        },
        include: {
          class: { select: { name: true } },
          subjectAssignment: {
            include: {
              subject: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const entries = rawEntries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      className: e.class.name,
      subjectName: e.subjectAssignment.subject.name,
    }));

    return { periods, entries };
  }
}
