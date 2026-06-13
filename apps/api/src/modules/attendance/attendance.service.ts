import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { MarkAttendanceDto } from "./dto/attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /v1/attendance/class/:classId?date=YYYY-MM-DD
   * Returns the roster for a class on a given date, with attendance status where recorded.
   */
  async getRoster(classId: string, dateStr: string) {
    const date = new Date(dateStr);

    // Enrollment has no schoolId (not auto-scoped), so verify the class is THIS tenant's first
    // (Class is tenant-scoped → null for another school) to avoid leaking a foreign roster.
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) throw new NotFoundException("Class not found");

    // Resolve the current term for this class; fall back to any enrollment for the class.
    const currentTerm = await this.prisma.term.findFirst({
      where: { isCurrent: true },
    });

    let enrollments: Array<{
      studentId: string;
      student: { id: string; firstName: string; lastName: string; photoUrl: string | null };
    }>;

    if (currentTerm) {
      enrollments = await this.prisma.enrollment.findMany({
        where: { classId, termId: currentTerm.id },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        },
      });
    } else {
      enrollments = await this.prisma.enrollment.findMany({
        where: { classId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        },
      });
    }

    // Fetch attendance records for all enrolled students on this date.
    const studentIds = enrollments.map((e) => e.studentId);
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: studentIds },
        date,
      },
    });

    const recordMap = new Map(records.map((r) => [r.studentId, r]));

    const students = enrollments.map((e) => {
      const record = recordMap.get(e.studentId);
      return {
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photoUrl: e.student.photoUrl ?? null,
        status: record ? record.status : null,
        reason: record ? (record.reason ?? null) : null,
      };
    });

    return { date: dateStr, students };
  }

  /**
   * POST /v1/attendance/mark
   * Upserts attendance records by (studentId, date). Last-write-wins.
   */
  async markAttendance(dto: MarkAttendanceDto, recordedBy: string) {
    const date = new Date(dto.date);

    // Validate all statuses (also validated by DTO but belt-and-suspenders).
    const validStatuses = new Set<string>(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
    for (const rec of dto.records) {
      if (!validStatuses.has(rec.status)) {
        throw new BadRequestException(`Invalid status: ${rec.status}`);
      }
    }

    // For upsert, the PrismaService tenant middleware does not auto-inject schoolId
    // (it only handles create/findMany/etc. individually). Fetch it explicitly.
    const schoolId = TenantContext.schoolIdOrThrow();

    // Prevent cross-tenant writes: upsert's where (studentId,date) isn't tenant-filtered, so a
    // foreign studentId/classId could otherwise be linked to this school. Validate ownership via
    // the tenant-scoped Class + Student models (findUnique/findMany return only this tenant's rows).
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass) throw new NotFoundException("Class not found in this school");
    const ids = dto.records.map((r) => r.studentId);
    const owned = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((s) => s.id));
    const foreign = ids.filter((id) => !ownedSet.has(id));
    if (foreign.length) throw new NotFoundException("One or more students not found in this school");

    let saved = 0;
    for (const rec of dto.records) {
      await this.prisma.attendanceRecord.upsert({
        where: {
          studentId_date: {
            studentId: rec.studentId,
            date,
          },
        },
        create: {
          studentId: rec.studentId,
          schoolId,
          classId: dto.classId,
          date,
          status: rec.status as AttendanceStatus,
          reason: rec.reason ?? null,
          recordedBy,
          idempotencyKey: rec.idempotencyKey ?? null,
        } as never,
        update: {
          status: rec.status as AttendanceStatus,
          reason: rec.reason ?? null,
          classId: dto.classId,
          recordedBy,
        },
      });
      saved++;
    }

    return { saved };
  }

  /**
   * GET /v1/attendance/student/:studentId?limit=60
   * Returns a student's attendance history, most recent first.
   */
  async getStudentHistory(studentId: string, limit = 60) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      take: limit,
    });

    return records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      reason: r.reason ?? null,
      classId: r.classId,
    }));
  }

  /**
   * GET /v1/attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Per-class totals + anomaly students with >=3 ABSENT.
   */
  async getSummary(fromStr: string, toStr: string) {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        date: { gte: from, lte: to },
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Aggregate per class.
    const classMap = new Map<
      string,
      { present: number; absent: number; late: number; excused: number; total: number }
    >();

    for (const r of records) {
      if (!classMap.has(r.classId)) {
        classMap.set(r.classId, { present: 0, absent: 0, late: 0, excused: 0, total: 0 });
      }
      const bucket = classMap.get(r.classId)!;
      bucket.total++;
      if (r.status === "PRESENT") bucket.present++;
      else if (r.status === "ABSENT") bucket.absent++;
      else if (r.status === "LATE") bucket.late++;
      else if (r.status === "EXCUSED") bucket.excused++;
    }

    // Fetch class names.
    const classIds = [...classMap.keys()];
    const classes = classIds.length
      ? await this.prisma.class.findMany({
          where: { id: { in: classIds } },
          select: { id: true, name: true },
        })
      : [];

    const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

    const classSummary = classIds.map((classId) => {
      const b = classMap.get(classId)!;
      return {
        classId,
        className: classNameMap.get(classId) ?? classId,
        present: b.present,
        absent: b.absent,
        late: b.late,
        excused: b.excused,
        total: b.total,
        rate: b.total > 0 ? b.present / b.total : 0,
      };
    });

    // Aggregate absences per student.
    const studentAbsenceMap = new Map<
      string,
      { studentId: string; name: string; absences: number }
    >();

    for (const r of records) {
      if (r.status === "ABSENT") {
        if (!studentAbsenceMap.has(r.studentId)) {
          const name = `${r.student.firstName} ${r.student.lastName}`;
          studentAbsenceMap.set(r.studentId, { studentId: r.studentId, name, absences: 0 });
        }
        studentAbsenceMap.get(r.studentId)!.absences++;
      }
    }

    const anomalies = [...studentAbsenceMap.values()].filter((s) => s.absences >= 3);

    return { classes: classSummary, anomalies };
  }
}
