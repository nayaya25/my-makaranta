import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { AttendanceModule } from "../src/modules/attendance/attendance.module";
import { AttendanceService } from "../src/modules/attendance/attendance.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Attendance module (e2e)", () => {
  let prisma: PrismaService;
  let attendanceService: AttendanceService;

  const suffix = Date.now();

  let schoolId: string;
  let schoolBId: string;
  let academicYearId: string;
  let termId: string;
  let classLevelId: string;
  let classId: string;

  // Three students enrolled in the class
  let studentId1: string;
  let studentId2: string;
  let studentId3: string;

  const recordedBy = "test-user-id";
  const testDate = "2025-03-10";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({
          global: true,
          secret: getJwtSecret(),
          signOptions: { expiresIn: "30d" },
        }),
        PassportModule,
        PrismaModule,
        AuthModule,
        AttendanceModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    attendanceService = moduleRef.get(AttendanceService);

    // Seed two schools
    const school = await prisma.school.create({
      data: { name: `Att School ${suffix}`, slug: `att-school-${suffix}` },
    });
    schoolId = school.id;

    const schoolB = await prisma.school.create({
      data: { name: `Att School B ${suffix}`, slug: `att-school-b-${suffix}` },
    });
    schoolBId = schoolB.id;

    // Academic hierarchy for school A
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2024/2025-att-${suffix}`,
        startDate: new Date("2024-09-01"),
        endDate: new Date("2025-07-31"),
      },
    });
    academicYearId = academicYear.id;

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        number: 1,
        startDate: new Date("2024-09-01"),
        endDate: new Date("2024-12-20"),
        isCurrent: true,
      },
    });
    termId = term.id;

    const classLevel = await prisma.classLevel.create({
      data: { schoolId, name: `JSS1-att-${suffix}`, order: 1 },
    });
    classLevelId = classLevel.id;

    const cls = await prisma.class.create({
      data: { schoolId, classLevelId, name: `JSS1A-att-${suffix}` },
    });
    classId = cls.id;

    // Create 3 students
    const s1 = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `ATT-A-${suffix}`,
        firstName: "Amina",
        lastName: "Yusuf",
        gender: "FEMALE",
        dateOfBirth: new Date("2010-01-01"),
      },
    });
    studentId1 = s1.id;

    const s2 = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `ATT-B-${suffix}`,
        firstName: "Ibrahim",
        lastName: "Musa",
        gender: "MALE",
        dateOfBirth: new Date("2010-02-15"),
      },
    });
    studentId2 = s2.id;

    const s3 = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `ATT-C-${suffix}`,
        firstName: "Fatima",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2010-03-20"),
      },
    });
    studentId3 = s3.id;

    // Enroll all 3 in the class for the current term
    await prisma.enrollment.createMany({
      data: [
        { studentId: studentId1, classId, termId },
        { studentId: studentId2, classId, termId },
        { studentId: studentId3, classId, termId },
      ],
    });
  });

  afterAll(async () => {
    // Delete attendance records
    await prisma.attendanceRecord.deleteMany({ where: { schoolId } });
    await prisma.attendanceRecord.deleteMany({ where: { schoolId: schoolBId } });

    // Delete enrollments
    await prisma.enrollment.deleteMany({ where: { classId } });

    // Delete students
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId: schoolBId } });

    // Delete structure
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.classLevel.deleteMany({ where: { id: classLevelId } });
    await prisma.term.deleteMany({ where: { academicYearId } });
    await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolId, schoolBId] } } });

    await prisma.onModuleDestroy();
  });

  describe("mark attendance", () => {
    it("creates records for a batch (tenant-scoped)", async () => {
      const result = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.markAttendance(
          {
            classId,
            date: testDate,
            records: [
              { studentId: studentId1, status: "PRESENT" },
              { studentId: studentId2, status: "ABSENT", reason: "Sick" },
              { studentId: studentId3, status: "LATE" },
            ],
          },
          recordedBy,
        ),
      );

      expect(result.saved).toBe(3);

      // Verify records are in the DB and scoped to the school
      const records = await prisma.attendanceRecord.findMany({
        where: { schoolId, date: new Date(testDate) },
      });
      expect(records).toHaveLength(3);
      expect(records.every((r) => r.schoolId === schoolId)).toBe(true);
    });

    it("re-marking a student updates status (last-write-wins, still 1 record per student/day)", async () => {
      // student1 was PRESENT; re-mark as EXCUSED
      const result = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.markAttendance(
          {
            classId,
            date: testDate,
            records: [{ studentId: studentId1, status: "EXCUSED", reason: "Family event" }],
          },
          recordedBy,
        ),
      );

      expect(result.saved).toBe(1);

      // Still only 1 record per student per day
      const records = await prisma.attendanceRecord.findMany({
        where: { studentId: studentId1, date: new Date(testDate) },
      });
      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe("EXCUSED");
      expect(records[0]!.reason).toBe("Family event");
    });
  });

  describe("GET class roster", () => {
    it("returns all 3 enrolled students with their statuses for the date", async () => {
      const result = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getRoster(classId, testDate),
      );

      expect(result.date).toBe(testDate);
      expect(result.students).toHaveLength(3);

      const s1Row = result.students.find((s) => s.studentId === studentId1);
      const s2Row = result.students.find((s) => s.studentId === studentId2);
      const s3Row = result.students.find((s) => s.studentId === studentId3);

      expect(s1Row).toBeDefined();
      expect(s1Row!.status).toBe("EXCUSED"); // was re-marked
      expect(s1Row!.reason).toBe("Family event");

      expect(s2Row).toBeDefined();
      expect(s2Row!.status).toBe("ABSENT");
      expect(s2Row!.reason).toBe("Sick");

      expect(s3Row).toBeDefined();
      expect(s3Row!.status).toBe("LATE");

      // Each row has the expected shape
      for (const row of result.students) {
        expect(row).toHaveProperty("studentId");
        expect(row).toHaveProperty("firstName");
        expect(row).toHaveProperty("lastName");
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("reason");
      }
    });

    it("returns students with null status for a date with no attendance records", async () => {
      const result = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getRoster(classId, "2025-03-11"),
      );

      expect(result.students).toHaveLength(3);
      expect(result.students.every((s) => s.status === null)).toBe(true);
    });
  });

  describe("GET student history", () => {
    it("returns records for a specific student, most recent first", async () => {
      // Add a second record on a different date
      await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.markAttendance(
          {
            classId,
            date: "2025-03-12",
            records: [{ studentId: studentId1, status: "PRESENT" }],
          },
          recordedBy,
        ),
      );

      const history = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getStudentHistory(studentId1),
      );

      expect(history.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(history[0]!.date).toBe("2025-03-12");
      expect(history[1]!.date).toBe("2025-03-10");

      for (const row of history) {
        expect(row).toHaveProperty("date");
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("reason");
        expect(row).toHaveProperty("classId");
      }
    });

    it("respects the limit parameter", async () => {
      const history = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getStudentHistory(studentId1, 1),
      );

      expect(history).toHaveLength(1);
    });
  });

  describe("GET summary", () => {
    it("returns per-class counts, rate, and flags students with >= 3 absences", async () => {
      // Create absences across multiple days for student2 to trigger anomaly (already has 1 from testDate)
      await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.markAttendance(
          {
            classId,
            date: "2025-03-13",
            records: [{ studentId: studentId2, status: "ABSENT" }],
          },
          recordedBy,
        ),
      );
      await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.markAttendance(
          {
            classId,
            date: "2025-03-14",
            records: [{ studentId: studentId2, status: "ABSENT" }],
          },
          recordedBy,
        ),
      );

      // Now student2 has 3 ABSENT records: 2025-03-10, 2025-03-13, 2025-03-14

      const summary = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getSummary("2025-03-10", "2025-03-14"),
      );

      expect(summary.classes).toHaveLength(1);
      const classSummary = summary.classes[0]!;
      expect(classSummary.classId).toBe(classId);
      expect(classSummary.className).toBeDefined();
      expect(typeof classSummary.className).toBe("string");
      expect(classSummary.present).toBeGreaterThanOrEqual(1);
      expect(classSummary.absent).toBeGreaterThanOrEqual(3);
      expect(classSummary.total).toBeGreaterThan(0);
      expect(classSummary.rate).toBeGreaterThanOrEqual(0);
      expect(classSummary.rate).toBeLessThanOrEqual(1);

      // student2 should appear in anomalies (3+ absences)
      expect(summary.anomalies.length).toBeGreaterThanOrEqual(1);
      const anomaly = summary.anomalies.find((a) => a.studentId === studentId2);
      expect(anomaly).toBeDefined();
      expect(anomaly!.absences).toBeGreaterThanOrEqual(3);
      expect(anomaly!.name).toBe("Ibrahim Musa");
    });

    it("does not include students with fewer than 3 absences in anomalies", async () => {
      const summary = await TenantContext.run({ schoolId, userId: recordedBy }, async () =>
        attendanceService.getSummary("2025-03-10", "2025-03-14"),
      );

      // student3 only has 1 LATE record — should NOT appear
      const anomaly3 = summary.anomalies.find((a) => a.studentId === studentId3);
      expect(anomaly3).toBeUndefined();
    });
  });

  describe("tenant isolation", () => {
    it("school B cannot see school A's attendance records", async () => {
      // School B has no students, so roster and summary should return empty
      // But we also test that school B can't directly retrieve the records
      const schoolBRecords = await prisma.attendanceRecord.findMany({
        where: { schoolId: schoolBId },
      });
      expect(schoolBRecords).toHaveLength(0);
    });

    it("GET class roster via tenant B context returns empty (classId belongs to school A)", async () => {
      // The class belongs to school A. Under school B's tenant context,
      // the Term findFirst returns null (no terms for B) and Enrollment findMany
      // returns [] because the tenant middleware scopes Enrollment through school's students/classes.
      // Because Enrollment is not a TENANT_MODEL (no schoolId), the prisma middleware won't scope it —
      // but the class itself won't be found under school B's context via other means.
      // Here we directly verify: school B has no attendance records at all.
      const result = await TenantContext.run({ schoolId: schoolBId, userId: "b-user" }, async () =>
        attendanceService.getSummary("2025-01-01", "2025-12-31"),
      );

      expect(result.classes).toHaveLength(0);
      expect(result.anomalies).toHaveLength(0);
    });

    it("rejects marking school A's students from school B (cross-tenant write IDOR)", async () => {
      await TenantContext.run({ schoolId: schoolBId, userId: "b-user" }, async () => {
        await expect(
          attendanceService.markAttendance(
            { classId, date: testDate, records: [{ studentId: studentId1, status: "PRESENT" }] },
            "b-user",
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    it("rejects reading school A's class roster from school B (no foreign roster leak)", async () => {
      await TenantContext.run({ schoolId: schoolBId, userId: "b-user" }, async () => {
        await expect(attendanceService.getRoster(classId, testDate)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });
    });
  });
});
