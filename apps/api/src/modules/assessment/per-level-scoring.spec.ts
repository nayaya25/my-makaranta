/**
 * Integration test: per-level scoring (AC-2 Task 3)
 *
 * Verifies that consumers route through resolveAssessmentTypes / resolveGradeBoundaries
 * so a class whose ClassLevel has override formats uses those overrides, while a class
 * on a level with no overrides falls back to the school defaults.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest per-level-scoring --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ScoresService } from "./scores.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("per-level scoring via resolver (AC-2 Task 3)", () => {
  let schoolId: string;
  let classWithOverrideId: string;
  let classDefaultId: string;
  let subjectId: string;
  let termId: string;
  let studentId: string;
  let studentDefaultId: string;

  let overrideCATypeId: string;
  let overrideExamTypeId: string;
  let defaultCATypeId: string;
  let defaultExamTypeId: string;

  let service: ScoresService;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `PLS-Test-${ts}`, slug: `pls-test-${ts}` } as never,
    });
    schoolId = school.id;

    // Level with overrides
    const levelWithOverride = await prisma.classLevel.create({
      data: { schoolId, name: `Override-Level-${ts}`, order: 1 },
    });
    // Level without overrides
    const levelDefault = await prisma.classLevel.create({
      data: { schoolId, name: `Default-Level-${ts}`, order: 2 },
    });

    // Default AssessmentTypes (classLevelId null): CA max 20, Exam max 80
    const defaultCA = await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 20, order: 1, classLevelId: null },
    });
    defaultCATypeId = defaultCA.id;

    const defaultExam = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 80, order: 2, classLevelId: null },
    });
    defaultExamTypeId = defaultExam.id;

    // Override AssessmentTypes for levelWithOverride: CA max 40, Exam max 60
    const overrideCA = await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 40, order: 1, classLevelId: levelWithOverride.id },
    });
    overrideCATypeId = overrideCA.id;

    const overrideExam = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 60, order: 2, classLevelId: levelWithOverride.id },
    });
    overrideExamTypeId = overrideExam.id;

    // Default GradeBoundaries (classLevelId null)
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", order: 1, classLevelId: null },
    });
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "C", minScore: 0, remark: "Fair", order: 2, classLevelId: null },
    });

    // Classes
    classWithOverrideId = (await prisma.class.create({
      data: { schoolId, name: `Override-Class-${ts}`, classLevelId: levelWithOverride.id },
    })).id;

    classDefaultId = (await prisma.class.create({
      data: { schoolId, name: `Default-Class-${ts}`, classLevelId: levelDefault.id },
    })).id;

    // Subject
    subjectId = (await prisma.subject.create({
      data: { schoolId, name: `Maths-${ts}`, code: `MTH-${ts}` },
    })).id;

    // AcademicYear + Term
    const year = await prisma.academicYear.create({
      data: { schoolId, name: `2025/2026-${ts}`, startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") },
    });
    termId = (await prisma.term.create({
      data: { schoolId, academicYearId: year.id, number: 1, startDate: new Date("2025-01-01"), endDate: new Date("2025-06-30") },
    })).id;

    // Students
    studentId = (await prisma.student.create({
      data: { schoolId, admissionNo: `PLS-OV-${ts}`, firstName: "Override", lastName: "Student", gender: "MALE", dateOfBirth: new Date("2012-01-01") },
    })).id;

    studentDefaultId = (await prisma.student.create({
      data: { schoolId, admissionNo: `PLS-DF-${ts}`, firstName: "Default", lastName: "Student", gender: "FEMALE", dateOfBirth: new Date("2012-01-01") },
    })).id;

    // Enrollments
    await prisma.enrollment.create({ data: { studentId, classId: classWithOverrideId, termId } });
    await prisma.enrollment.create({ data: { studentId: studentDefaultId, classId: classDefaultId, termId } });

    // Person (for recordedBy)
    const person = await prisma.person.create({ data: {} });

    // Scores for studentId in classWithOverride: CA=35, Exam=55 (using override type IDs)
    await prisma.score.createMany({
      data: [
        { schoolId, studentId, subjectId, classId: classWithOverrideId, assessmentTypeId: overrideCATypeId, termId, value: 35, recordedBy: person.id },
        { schoolId, studentId, subjectId, classId: classWithOverrideId, assessmentTypeId: overrideExamTypeId, termId, value: 55, recordedBy: person.id },
      ],
    });

    // Scores for studentDefaultId in classDefault: CA=18, Exam=72 (using default type IDs)
    await prisma.score.createMany({
      data: [
        { schoolId, studentId: studentDefaultId, subjectId, classId: classDefaultId, assessmentTypeId: defaultCATypeId, termId, value: 18, recordedBy: person.id },
        { schoolId, studentId: studentDefaultId, subjectId, classId: classDefaultId, assessmentTypeId: defaultExamTypeId, termId, value: 72, recordedBy: person.id },
      ],
    });

    // Instantiate service (pass raw PrismaClient as PrismaService — pattern from report-card spec)
    service = new ScoresService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  });

  it("class with level override: getGradebook uses override types (CA max 40, Exam max 60)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGradebook(classWithOverrideId, subjectId, termId),
    );

    // Should return override types (max 40, 60), NOT defaults (20, 80)
    const maxScores = result.assessmentTypes.map((t: { maxScore: number }) => t.maxScore).sort((a: number, b: number) => a - b);
    expect(maxScores).toEqual([40, 60]);

    // Student total: 35 + 55 = 90
    const student = result.students.find((s: { studentId: string }) => s.studentId === studentId);
    expect(student).toBeDefined();
    expect(student!.total).toBe(90);
  });

  it("class on level with NO override: getGradebook uses school defaults (CA max 20, Exam max 80)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGradebook(classDefaultId, subjectId, termId),
    );

    // Should return default types (max 20, 80)
    const maxScores = result.assessmentTypes.map((t: { maxScore: number }) => t.maxScore).sort((a: number, b: number) => a - b);
    expect(maxScores).toEqual([20, 80]);

    // Student total: 18 + 72 = 90
    const student = result.students.find((s: { studentId: string }) => s.studentId === studentDefaultId);
    expect(student).toBeDefined();
    expect(student!.total).toBe(90);
  });
});
