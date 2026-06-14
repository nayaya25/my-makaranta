/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { AssessmentModule } from "../src/modules/assessment/assessment.module";
import { AssessmentTypesService } from "../src/modules/assessment/assessment-types.service";
import { GradeBoundariesService } from "../src/modules/assessment/grade-boundaries.service";
import { SubjectAssignmentsService } from "../src/modules/assessment/subject-assignments.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Assessment config (e2e)", () => {
  let prisma: PrismaService;
  let types: AssessmentTypesService;
  let boundaries: GradeBoundariesService;
  let assignments: SubjectAssignmentsService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  let subjectId: string;
  let classId: string;
  let staffId: string;
  let academicYearId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        AssessmentModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    types = moduleRef.get(AssessmentTypesService);
    boundaries = moduleRef.get(GradeBoundariesService);
    assignments = moduleRef.get(SubjectAssignmentsService);

    const a = await prisma.school.create({ data: { name: `Asmt A ${suffix}`, slug: `asmt-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Asmt B ${suffix}`, slug: `asmt-b-${suffix}` } });
    schoolBId = b.id;

    const year = await prisma.academicYear.create({
      data: { schoolId, name: `2024/2025-asmt-${suffix}`, startDate: new Date("2024-09-01"), endDate: new Date("2025-07-31") },
    });
    academicYearId = year.id;
    const subject = await prisma.subject.create({ data: { schoolId, name: "Mathematics", code: `MTH-${suffix}` } });
    subjectId = subject.id;
    const level = await prisma.classLevel.create({ data: { schoolId, name: `JSS1-${suffix}`, order: 1 } });
    const klass = await prisma.class.create({ data: { schoolId, classLevelId: level.id, name: `JSS1A-${suffix}` } });
    classId = klass.id;
    const staff = await prisma.staff.create({
      data: { schoolId, staffNo: `T-${suffix}`, firstName: "Grace", lastName: "Okon", email: `g${suffix}@s.test`, phone: "+2348000000000" },
    });
    staffId = staff.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("assessment types", () => {
    it("rejects a set whose maxScores do not sum to 100", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 10, order: 0 },
          { name: "Exam", maxScore: 80, order: 1 },
        ])),
      ).rejects.toThrow(/100/);
    });

    it("accepts a valid set summing to 100 and lists it ordered", async () => {
      const saved = await asA(() => types.replace([
        { name: "CA1", maxScore: 10, order: 0 },
        { name: "CA2", maxScore: 10, order: 1 },
        { name: "CA3", maxScore: 10, order: 2 },
        { name: "Exam", maxScore: 70, order: 3 },
      ]));
      expect(saved.map((t) => t.name)).toEqual(["CA1", "CA2", "CA3", "Exam"]);
      const list = await asA(() => types.list());
      expect(list).toHaveLength(4);
      // school B never set any types; A's replace must not touch B's rows
      expect(await asB(() => types.list())).toHaveLength(0);
    });

    it("rejects duplicate type names", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 50, order: 0 },
          { name: "CA1", maxScore: 50, order: 1 },
        ])),
      ).rejects.toThrow();
    });
  });

  describe("grade boundaries", () => {
    it("applies the WAEC template and lists 9 bands ordered desc by minScore", async () => {
      await asA(() => boundaries.applyTemplate("WAEC"));
      const list = await asA(() => boundaries.list());
      expect(list).toHaveLength(9);
      expect(list[0]?.grade).toBe("A1");
      expect(list[0]?.minScore).toBe(75);
      expect(list[list.length - 1]?.grade).toBe("F9");
      expect(list[list.length - 1]?.minScore).toBe(0);
      // school B never applied a template; A's replace must not touch B's bands
      expect(await asB(() => boundaries.list())).toHaveLength(0);
    });

    it("rejects a band set with no zero (catch-all) band", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 75, remark: "Excellent", order: 0 },
          { grade: "C6", minScore: 50, remark: "Credit", order: 1 },
        ])),
      ).rejects.toThrow();
    });

    it("rejects duplicate minScores", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 50, remark: "x", order: 0 },
          { grade: "C6", minScore: 50, remark: "y", order: 1 },
          { grade: "F9", minScore: 0, remark: "z", order: 2 },
        ])),
      ).rejects.toThrow();
    });
  });

  describe("subject assignments", () => {
    let createdId: string;

    it("creates an assignment with valid tenant ids", async () => {
      const a = await asA(() => assignments.create({ subjectId, classId, staffId, academicYearId }));
      expect(a.id).toBeDefined();
      createdId = a.id;
    });

    it("rejects a duplicate (subject, class, year) with Conflict", async () => {
      await expect(
        asA(() => assignments.create({ subjectId, classId, staffId, academicYearId })),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects a foreign/unknown subjectId with NotFound", async () => {
      await expect(
        asA(() => assignments.create({ subjectId: "nonexistent", classId, staffId, academicYearId })),
      ).rejects.toThrow(NotFoundException);
    });

    it("lists assignments filtered by class + year, enriched with names", async () => {
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0]?.subject?.name).toBe("Mathematics");
    });

    it("removes an assignment", async () => {
      await asA(() => assignments.remove(createdId));
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.find((x) => x.id === createdId)).toBeUndefined();
    });
  });
});
