import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { StorageModule } from "../src/core/storage/storage.module";
import { SisModule } from "../src/modules/sis/sis.module";
import { StudentsService } from "../src/modules/sis/students.service";
import { StaffService } from "../src/modules/sis/staff.service";
import { ParentsService } from "../src/modules/sis/parents.service";
import { EnrollmentService } from "../src/modules/sis/enrollment.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("SIS module (e2e)", () => {
  let prisma: PrismaService;
  let studentsService: StudentsService;
  let staffService: StaffService;
  let parentsService: ParentsService;
  let enrollmentService: EnrollmentService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  let academicYearId: string;
  let termId: string;
  let classLevelId: string;
  let classId: string;
  let studentId: string;
  let staffId: string;
  let parentId: string;
  let guardianId: string;
  let enrollmentId: string;

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
        StorageModule,
        SisModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    studentsService = moduleRef.get(StudentsService);
    staffService = moduleRef.get(StaffService);
    parentsService = moduleRef.get(ParentsService);
    enrollmentService = moduleRef.get(EnrollmentService);

    // Seed two schools
    const school = await prisma.school.create({
      data: { name: `SIS School ${suffix}`, slug: `sis-school-${suffix}` },
    });
    schoolId = school.id;

    const schoolB = await prisma.school.create({
      data: { name: `SIS School B ${suffix}`, slug: `sis-school-b-${suffix}` },
    });
    schoolBId = schoolB.id;

    // Seed academic hierarchy for enrollment tests (bypass tenant middleware by using raw prisma without context)
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2024/2025-${suffix}`,
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
      data: { schoolId, name: `JSS1-${suffix}`, order: 1 },
    });
    classLevelId = classLevel.id;

    const cls = await prisma.class.create({
      data: { schoolId, classLevelId, name: `JSS1A-${suffix}` },
    });
    classId = cls.id;
  });

  afterAll(async () => {
    if (guardianId) await prisma.guardian.deleteMany({ where: { id: guardianId } });
    if (enrollmentId) await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    if (studentId) await prisma.student.deleteMany({ where: { id: studentId } });
    if (staffId) await prisma.staff.deleteMany({ where: { id: staffId } });
    if (parentId) await prisma.parent.deleteMany({ where: { id: parentId } });
    // Clean up school B students
    await prisma.student.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.staff.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.parent.deleteMany({ where: { schoolId: schoolBId } });
    // Clean up structure
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.classLevel.deleteMany({ where: { id: classLevelId } });
    await prisma.term.deleteMany({ where: { academicYearId } });
    await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolId, schoolBId] } } });
    await prisma.onModuleDestroy();
  });

  describe("students", () => {
    it("creates a student with tenant auto-injection", async () => {
      const student = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.create({
          admissionNo: `ADM${suffix}`,
          firstName: "Amina",
          lastName: "Yusuf",
          gender: "MALE" as never,
          dateOfBirth: "2010-05-15",
        }),
      );

      expect(student.id).toBeDefined();
      expect(student.schoolId).toBe(schoolId);
      expect(student.firstName).toBe("Amina");
      studentId = student.id;
    });

    it("lists students for current tenant", async () => {
      const students = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.findAll(),
      );
      expect(students.length).toBeGreaterThanOrEqual(1);
      expect(students.every((s) => s.schoolId === schoolId)).toBe(true);
    });

    it("gets student profile with guardians and enrollments", async () => {
      const profile = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.findOne(studentId),
      );
      expect(profile.id).toBe(studentId);
      expect(Array.isArray(profile.guardians)).toBe(true);
      expect(Array.isArray(profile.enrollments)).toBe(true);
    });

    it("updates a student", async () => {
      const updated = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.update(studentId, { firstName: "Fatima" }),
      );
      expect(updated.firstName).toBe("Fatima");
    });

    it("tenant B cannot see tenant A's students", async () => {
      const students = await TenantContext.run({ schoolId: schoolBId, userId: "u2" }, async () =>
        studentsService.findAll(),
      );
      expect(students.find((s) => s.id === studentId)).toBeUndefined();
    });
  });

  describe("staff", () => {
    it("creates a staff member", async () => {
      const staff = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        staffService.create({
          staffNo: `ST${suffix}`,
          firstName: "Ibrahim",
          lastName: "Musa",
          email: `staff${suffix}@school.test`,
          phone: `+2348${suffix}`.slice(0, 14),
        }),
      );

      expect(staff.id).toBeDefined();
      expect(staff.schoolId).toBe(schoolId);
      staffId = staff.id;
    });

    it("lists staff for current tenant", async () => {
      const staff = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        staffService.findAll(),
      );
      expect(staff.find((s) => s.id === staffId)).toBeDefined();
      expect(staff.every((s) => s.schoolId === schoolId)).toBe(true);
    });

    it("gets staff by id", async () => {
      const staff = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        staffService.findOne(staffId),
      );
      expect(staff.id).toBe(staffId);
    });

    it("updates staff", async () => {
      const updated = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        staffService.update(staffId, { firstName: "Ahmed" }),
      );
      expect(updated.firstName).toBe("Ahmed");
    });
  });

  describe("parents + guardians", () => {
    it("creates a parent", async () => {
      const parent = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        parentsService.createParent({
          phone: `+2347${suffix}`.slice(0, 14),
          firstName: "Khadijah",
          lastName: "Yusuf",
          email: `parent${suffix}@school.test`,
        }),
      );

      expect(parent.id).toBeDefined();
      expect(parent.schoolId).toBe(schoolId);
      parentId = parent.id;
    });

    it("links parent to student as guardian", async () => {
      const guardian = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        parentsService.createGuardian(studentId, {
          parentId,
          relationship: "MOTHER" as never,
          isPrimary: true,
        }),
      );

      expect(guardian.id).toBeDefined();
      expect(guardian.studentId).toBe(studentId);
      expect(guardian.parentId).toBe(parentId);
      guardianId = guardian.id;
    });

    it("lists guardians for student, includes parent", async () => {
      const guardians = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        parentsService.findGuardians(studentId),
      );
      expect(guardians.length).toBeGreaterThanOrEqual(1);
      const g = guardians.find((g) => g.id === guardianId);
      expect(g).toBeDefined();
      expect(g?.parent).toBeDefined();
      expect(g?.parent.id).toBe(parentId);
    });

    it("student profile includes guardian with parent data", async () => {
      const profile = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.findOne(studentId),
      );
      const g = profile.guardians.find((g) => g.id === guardianId);
      expect(g).toBeDefined();
      expect(g?.parent).toBeDefined();
      expect(g?.parent.firstName).toBe("Khadijah");
    });
  });

  describe("enrollment", () => {
    it("creates an enrollment", async () => {
      const enrollment = await enrollmentService.create({
        studentId,
        classId,
        termId,
      });

      expect(enrollment.id).toBeDefined();
      expect(enrollment.studentId).toBe(studentId);
      expect(enrollment.classId).toBe(classId);
      expect(enrollment.termId).toBe(termId);
      enrollmentId = enrollment.id;
    });

    it("is idempotent (upsert on same studentId+termId)", async () => {
      const second = await enrollmentService.create({
        studentId,
        classId,
        termId,
      });
      expect(second.id).toBe(enrollmentId);
    });

    it("student profile includes enrollment with class and term", async () => {
      const profile = await TenantContext.run({ schoolId, userId: "u1" }, async () =>
        studentsService.findOne(studentId),
      );
      const e = profile.enrollments.find((e) => e.id === enrollmentId);
      expect(e).toBeDefined();
      expect(e?.class).toBeDefined();
      expect(e?.term).toBeDefined();
    });
  });
});
