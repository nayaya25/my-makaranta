import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { StructureModule } from "../src/modules/structure/structure.module";
import { SchoolsService } from "../src/modules/structure/schools.service";
import { AcademicYearsService } from "../src/modules/structure/academic-years.service";
import { ClassLevelsService } from "../src/modules/structure/class-levels.service";
import { ClassesService } from "../src/modules/structure/classes.service";
import { SubjectsService } from "../src/modules/structure/subjects.service";
import { AuthModule } from "../src/core/auth/auth.module";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Structure module (e2e)", () => {
  let prisma: PrismaService;
  let schoolsService: SchoolsService;
  let academicYearsService: AcademicYearsService;
  let classLevelsService: ClassLevelsService;
  let classesService: ClassesService;
  let subjectsService: SubjectsService;

  const suffix = Date.now();
  let createdSchoolId: string;
  let createdUserId: string;
  let createdAcademicYearId: string;
  let createdClassLevelId: string;
  let createdClassId: string;
  let createdSubjectId: string;
  let secondSchoolId: string;
  let secondUserId: string;

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
        StructureModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    schoolsService = moduleRef.get(SchoolsService);
    academicYearsService = moduleRef.get(AcademicYearsService);
    classLevelsService = moduleRef.get(ClassLevelsService);
    classesService = moduleRef.get(ClassesService);
    subjectsService = moduleRef.get(SubjectsService);

    // Seed Permission catalog entries for the test
    await prisma.permission.upsert({
      where: { key: "school.manage" },
      create: { key: "school.manage", description: "Manage school settings" },
      update: {},
    });
    await prisma.permission.upsert({
      where: { key: "classes.manage" },
      create: { key: "classes.manage", description: "Manage classes" },
      update: {},
    });
    await prisma.permission.upsert({
      where: { key: "classes.view" },
      create: { key: "classes.view", description: "View classes" },
      update: {},
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order (classes before class levels before school)
    if (createdSchoolId) {
      await prisma.class.deleteMany({ where: { schoolId: createdSchoolId } });
      await prisma.subject.deleteMany({ where: { schoolId: createdSchoolId } });
      await prisma.classLevel.deleteMany({ where: { schoolId: createdSchoolId } });
      if (createdAcademicYearId) {
        await prisma.term.deleteMany({ where: { academicYearId: createdAcademicYearId } });
      }
      await prisma.academicYear.deleteMany({ where: { schoolId: createdSchoolId } });
    }
    if (createdUserId) {
      await prisma.userPermission.deleteMany({ where: { userId: createdUserId } });
    }
    if (createdSchoolId) {
      await prisma.school.deleteMany({ where: { id: createdSchoolId } });
    }
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    // Second school resources
    if (secondSchoolId) {
      await prisma.class.deleteMany({ where: { schoolId: secondSchoolId } });
      await prisma.subject.deleteMany({ where: { schoolId: secondSchoolId } });
      await prisma.classLevel.deleteMany({ where: { schoolId: secondSchoolId } });
      await prisma.term.deleteMany({ where: { schoolId: secondSchoolId } });
      await prisma.academicYear.deleteMany({ where: { schoolId: secondSchoolId } });
      await prisma.school.deleteMany({ where: { id: secondSchoolId } });
    }
    if (secondUserId) {
      await prisma.userPermission.deleteMany({ where: { userId: secondUserId } });
      await prisma.user.deleteMany({ where: { id: secondUserId } });
    }
    await prisma.onModuleDestroy();
  });

  describe("school create + proprietor bootstrap", () => {
    it("creates school, makes user proprietor, returns fresh token, grants all permissions", async () => {
      // Create a PENDING user (no schoolId yet)
      const pendingUser = await prisma.user.create({
        data: { phone: `+234${suffix}`, identityType: "PENDING", identityId: "" },
      });
      createdUserId = pendingUser.id;

      const result = await schoolsService.createSchool(
        { name: `Test School ${suffix}`, slug: `test-school-${suffix}` },
        pendingUser.id,
      );

      expect(result.school).toBeDefined();
      expect(result.school.slug).toBe(`test-school-${suffix}`);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      createdSchoolId = result.school.id;

      // User should now have schoolId set and be PROPRIETOR
      const updatedUser = await prisma.user.findUnique({ where: { id: pendingUser.id } });
      expect(updatedUser?.schoolId).toBe(createdSchoolId);
      expect(updatedUser?.identityType).toBe("PROPRIETOR");

      // tokenVersion bumped, so original token is invalid
      expect(updatedUser?.tokenVersion).toBeGreaterThan(0);

      // All permissions granted
      const granted = await prisma.userPermission.findMany({ where: { userId: pendingUser.id } });
      expect(granted.length).toBeGreaterThan(0);
    });
  });

  describe("GET schools/me", () => {
    it("returns the school for the current user's schoolId", async () => {
      const school = await schoolsService.getMySchool(createdSchoolId);
      expect(school.id).toBe(createdSchoolId);
    });

    it("throws if no schoolId", async () => {
      await expect(schoolsService.getMySchool(null)).rejects.toThrow();
    });
  });

  describe("academic years + terms", () => {
    it("creates academic year with nested terms, tenant-scoped", async () => {
      const result = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () =>
          academicYearsService.create({
            name: `2024/2025-${suffix}`,
            startDate: "2024-09-01",
            endDate: "2025-07-31",
            terms: [
              { number: 1, startDate: "2024-09-01", endDate: "2024-12-20", isCurrent: true },
              { number: 2, startDate: "2025-01-06", endDate: "2025-04-11" },
              { number: 3, startDate: "2025-04-28", endDate: "2025-07-11" },
            ],
          }),
      );

      expect(result.id).toBeDefined();
      expect(result.schoolId).toBe(createdSchoolId);
      expect(result.terms).toHaveLength(3);
      createdAcademicYearId = result.id;
    });

    it("lists academic years, tenant-scoped (only own school's years)", async () => {
      // Create a second school and its academic year
      const secondUser = await prisma.user.create({
        data: { phone: `+235${suffix}`, identityType: "PENDING", identityId: "" },
      });
      secondUserId = secondUser.id;
      const secondSchool = await prisma.school.create({
        data: { name: `Other School ${suffix}`, slug: `other-school-${suffix}` },
      });
      secondSchoolId = secondSchool.id;

      await TenantContext.run({ schoolId: secondSchoolId, userId: secondUserId }, async () =>
        academicYearsService.create({
          name: `2024/2025-other-${suffix}`,
          startDate: "2024-09-01",
          endDate: "2025-07-31",
          terms: [{ number: 1, startDate: "2024-09-01", endDate: "2024-12-20" }],
        }),
      );

      // School A should only see its own year
      const years = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () => academicYearsService.findAll(),
      );
      const ids = years.map((y) => y.schoolId);
      expect(ids.every((id) => id === createdSchoolId)).toBe(true);
    });
  });

  describe("class levels", () => {
    it("creates class levels ordered by 'order'", async () => {
      const created = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () =>
          classLevelsService.createMany([
            { name: `JSS1-${suffix}`, order: 1 },
            { name: `JSS2-${suffix}`, order: 2 },
            { name: `JSS3-${suffix}`, order: 3 },
          ]),
      );

      expect(created).toHaveLength(3);
      expect(created[0]!.schoolId).toBe(createdSchoolId);
      createdClassLevelId = created[0]!.id;
    });

    it("lists class levels in ascending order", async () => {
      const levels = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () => classLevelsService.findAll(),
      );
      expect(levels.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]!.order).toBeGreaterThanOrEqual(levels[i - 1]!.order);
      }
    });
  });

  describe("classes", () => {
    it("creates a class tenant-scoped", async () => {
      const cls = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () =>
          classesService.create({
            classLevelId: createdClassLevelId,
            name: `JSS1A-${suffix}`,
          }),
      );

      expect(cls.id).toBeDefined();
      expect(cls.schoolId).toBe(createdSchoolId);
      createdClassId = cls.id;
    });

    it("lists classes, tenant-scoped", async () => {
      const classes = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () => classesService.findAll(),
      );
      const ids = classes.map((c) => c.schoolId);
      expect(ids.every((id) => id === createdSchoolId)).toBe(true);
      expect(classes.find((c) => c.id === createdClassId)).toBeDefined();
    });
  });

  describe("subjects", () => {
    it("creates a subject tenant-scoped", async () => {
      const subject = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () =>
          subjectsService.create({ name: `Mathematics-${suffix}`, code: `MATH${suffix}`.slice(-20) }),
      );

      expect(subject.id).toBeDefined();
      expect(subject.schoolId).toBe(createdSchoolId);
      createdSubjectId = subject.id;
    });

    it("lists subjects, tenant-scoped", async () => {
      const subjects = await TenantContext.run(
        { schoolId: createdSchoolId, userId: createdUserId },
        async () => subjectsService.findAll(),
      );
      const ids = subjects.map((s) => s.schoolId);
      expect(ids.every((id) => id === createdSchoolId)).toBe(true);
    });

    it("second school cannot see first school's subjects", async () => {
      const subjects = await TenantContext.run(
        { schoolId: secondSchoolId, userId: secondUserId },
        async () => subjectsService.findAll(),
      );
      expect(subjects.find((s) => s.id === createdSubjectId)).toBeUndefined();
    });
  });
});
