/**
 * Integration test: subject-master per-level z-score fix (AC-2 review fix)
 *
 * Verifies that subjectMaster() computes each student's cohort total using the
 * assessment-type ids for their own class's level, so override-class students are
 * not scored at 0 due to mismatched type ids.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest review.service --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ReviewService } from "./review.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("ReviewService.subjectMaster — per-level cohort z-scores (AC-2 review fix)", () => {
  let schoolId: string;
  let classDefaultId: string;
  let classOverrideId: string;
  let subjectId: string;
  let termId: string;
  let studentDefaultId: string;
  let studentOverrideId: string;
  let academicYearId: string;

  let service: ReviewService;

  beforeAll(async () => {
    const ts = Date.now();

    // School
    const school = await prisma.school.create({
      data: { name: `RSFix-Test-${ts}`, slug: `rsfix-test-${ts}` } as never,
    });
    schoolId = school.id;

    // ClassLevels
    const levelDefault = await prisma.classLevel.create({
      data: { schoolId, name: `RSFix-Default-Level-${ts}`, order: 1 },
    });
    const levelOverride = await prisma.classLevel.create({
      data: { schoolId, name: `RSFix-Override-Level-${ts}`, order: 2 },
    });

    // School-default AssessmentTypes (classLevelId null): CA max 20, Exam max 80
    await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 20, order: 1, classLevelId: null },
    });
    await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 80, order: 2, classLevelId: null },
    });

    // Override AssessmentTypes for levelOverride: CA max 40, Exam max 60
    const overrideCA = await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 40, order: 1, classLevelId: levelOverride.id },
    });
    const overrideExam = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 60, order: 2, classLevelId: levelOverride.id },
    });

    // Default GradeBoundaries (classLevelId null)
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", order: 1, classLevelId: null },
    });
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "C", minScore: 0, remark: "Fair", order: 2, classLevelId: null },
    });

    // Classes
    classDefaultId = (await prisma.class.create({
      data: { schoolId, name: `RSFix-Default-Class-${ts}`, classLevelId: levelDefault.id },
    })).id;
    classOverrideId = (await prisma.class.create({
      data: { schoolId, name: `RSFix-Override-Class-${ts}`, classLevelId: levelOverride.id },
    })).id;

    // Subject
    subjectId = (await prisma.subject.create({
      data: { schoolId, name: `RSFix-Maths-${ts}`, code: `RSF-MTH-${ts}` },
    })).id;

    // AcademicYear + Term
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `RSFix-2025/2026-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });
    academicYearId = year.id;
    termId = (await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    })).id;

    // Staff (required by SubjectAssignment)
    const staff = await prisma.staff.create({
      data: {
        schoolId,
        staffNo: `RSF-ST-${ts}`,
        firstName: "Test",
        lastName: "Teacher",
        email: `rsfix-teacher-${ts}@test.com`,
        phone: `0800${ts}`.slice(0, 11),
        hiredAt: new Date("2024-01-01"),
      },
    });

    // SubjectAssignments: both classes assigned the subject for this academic year
    await prisma.subjectAssignment.create({
      data: { schoolId, subjectId, classId: classDefaultId, staffId: staff.id, academicYearId },
    });
    await prisma.subjectAssignment.create({
      data: { schoolId, subjectId, classId: classOverrideId, staffId: staff.id, academicYearId },
    });

    // Students
    studentDefaultId = (await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `RSF-DF-${ts}`,
        firstName: "Default",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    })).id;
    studentOverrideId = (await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `RSF-OV-${ts}`,
        firstName: "Override",
        lastName: "Student",
        gender: "FEMALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    })).id;

    // Enrollments
    await prisma.enrollment.create({ data: { studentId: studentDefaultId, classId: classDefaultId, termId } });
    await prisma.enrollment.create({ data: { studentId: studentOverrideId, classId: classOverrideId, termId } });

    // Person (for recordedBy on scores)
    const person = await prisma.person.create({ data: {} });

    // Scores for studentDefault in classDefault: CA=18, Exam=72 → total=90 (default type ids)
    const defaultCA = await prisma.assessmentType.findFirst({
      where: { schoolId, classLevelId: null, name: "CA" },
    });
    const defaultExam = await prisma.assessmentType.findFirst({
      where: { schoolId, classLevelId: null, name: "Exam" },
    });
    await prisma.score.createMany({
      data: [
        { schoolId, studentId: studentDefaultId, subjectId, classId: classDefaultId, assessmentTypeId: defaultCA!.id, termId, value: 18, recordedBy: person.id },
        { schoolId, studentId: studentDefaultId, subjectId, classId: classDefaultId, assessmentTypeId: defaultExam!.id, termId, value: 72, recordedBy: person.id },
      ],
    });

    // Scores for studentOverride in classOverride: CA=35, Exam=55 → total=90 (override type ids)
    await prisma.score.createMany({
      data: [
        { schoolId, studentId: studentOverrideId, subjectId, classId: classOverrideId, assessmentTypeId: overrideCA.id, termId, value: 35, recordedBy: person.id },
        { schoolId, studentId: studentOverrideId, subjectId, classId: classOverrideId, assessmentTypeId: overrideExam.id, termId, value: 55, recordedBy: person.id },
      ],
    });

    service = new ReviewService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  });

  it("override-class student total is 90, not 0", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.subjectMaster(subjectId, termId),
    );

    const overrideClass = result.classes.find((c) => c.classId === classOverrideId);
    expect(overrideClass).toBeDefined();
    const overrideStudent = overrideClass?.students.find((s) => s.studentId === studentOverrideId);
    expect(overrideStudent).toBeDefined();
    expect(overrideStudent!.total).toBe(90);
  });

  it("cohort subjectMean reflects real totals of both students (both scored 90 → mean ≈ 90)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.subjectMaster(subjectId, termId),
    );

    // Both students scored 90 → mean should be 90
    expect(result.subjectMean).toBeCloseTo(90, 1);
  });
});
