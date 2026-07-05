import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "lesson-plan-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.lessonPlan.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.subjectAssignment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.subject.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.staff.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.class.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("LessonPlan model", () => {
  let schoolAId: string;
  let schoolBId: string;
  let subjectAssignmentId: string;
  let termId: string;
  let subjectAssignmentBId: string;
  let termBId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const schoolA = await prisma.school.create({
      data: { name: "Lesson Plan School A", slug: `lesson-plan-test-${ts}-a` } as never,
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: { name: "Lesson Plan School B", slug: `lesson-plan-test-${ts}-b` } as never,
    });
    schoolBId = schoolB.id;

    // School A prerequisites
    const classLevel = await prisma.classLevel.create({
      data: { schoolId: schoolAId, name: "JSS 1", order: 1 },
    });
    const klass = await prisma.class.create({
      data: { schoolId: schoolAId, classLevelId: classLevel.id, name: "JSS 1A" },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolAId,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: schoolAId,
        academicYearId: academicYear.id,
        number: 1,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });
    termId = term.id;
    const subject = await prisma.subject.create({
      data: { schoolId: schoolAId, name: "Mathematics", code: `MATH-${ts}` },
    });
    const staff = await prisma.staff.create({
      data: {
        schoolId: schoolAId,
        staffNo: `ST-${ts}`,
        firstName: "Ahmed",
        lastName: "Ibrahim",
        email: `ahmed.${ts}@school.com`,
        phone: `070${ts.toString().slice(-8)}`,
      },
    });
    const subjectAssignment = await prisma.subjectAssignment.create({
      data: {
        schoolId: schoolAId,
        subjectId: subject.id,
        classId: klass.id,
        staffId: staff.id,
        academicYearId: academicYear.id,
      },
    });
    subjectAssignmentId = subjectAssignment.id;

    // School B prerequisites (for cross-tenant isolation)
    const classLevelB = await prisma.classLevel.create({
      data: { schoolId: schoolBId, name: "JSS 1", order: 1 },
    });
    const klassB = await prisma.class.create({
      data: { schoolId: schoolBId, classLevelId: classLevelB.id, name: "JSS 1A" },
    });
    const academicYearB = await prisma.academicYear.create({
      data: {
        schoolId: schoolBId,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    const termB = await prisma.term.create({
      data: {
        schoolId: schoolBId,
        academicYearId: academicYearB.id,
        number: 1,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });
    termBId = termB.id;
    const subjectB = await prisma.subject.create({
      data: { schoolId: schoolBId, name: "Mathematics", code: `MATH-B-${ts}` },
    });
    const staffB = await prisma.staff.create({
      data: {
        schoolId: schoolBId,
        staffNo: `STB-${ts}`,
        firstName: "Bola",
        lastName: "Adeyemi",
        email: `bola.${ts}@school.com`,
        phone: `080${ts.toString().slice(-8)}`,
      },
    });
    const subjectAssignmentB = await prisma.subjectAssignment.create({
      data: {
        schoolId: schoolBId,
        subjectId: subjectB.id,
        classId: klassB.id,
        staffId: staffB.id,
        academicYearId: academicYearB.id,
      },
    });
    subjectAssignmentBId = subjectAssignmentB.id;

    // Create a LessonPlan for school B
    await prisma.lessonPlan.create({
      data: {
        schoolId: schoolBId,
        subjectAssignmentId: subjectAssignmentBId,
        termId: termBId,
        weekNumber: 1,
      },
    });
  });

  it("creates a LessonPlan with default status DRAFT and persists", async () => {
    const plan = await prisma.lessonPlan.create({
      data: {
        schoolId: schoolAId,
        subjectAssignmentId,
        termId,
        weekNumber: 1,
        topic: "Introduction to Algebra",
      },
    });
    expect(plan.id).toBeDefined();
    expect(plan.schoolId).toBe(schoolAId);
    expect(plan.status).toBe("DRAFT");
    expect(plan.topic).toBe("Introduction to Algebra");

    const fetched = await prisma.lessonPlan.findUnique({ where: { id: plan.id } });
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe("DRAFT");
  });

  it("rejects duplicate (subjectAssignmentId, termId, weekNumber) — @@unique constraint", async () => {
    await expect(
      prisma.lessonPlan.create({
        data: {
          schoolId: schoolAId,
          subjectAssignmentId,
          termId,
          weekNumber: 1, // duplicate week for same assignment+term
          topic: "Duplicate week",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-tenant isolation: schoolA query does not return schoolB plans", async () => {
    const plans = await prisma.lessonPlan.findMany({
      where: { schoolId: schoolAId },
    });
    const schoolBPlanFound = plans.some((p) => p.schoolId === schoolBId);
    expect(schoolBPlanFound).toBe(false);

    // Ensure school B's plan exists in the DB
    const schoolBPlans = await prisma.lessonPlan.findMany({
      where: { schoolId: schoolBId },
    });
    expect(schoolBPlans.length).toBeGreaterThan(0);
  });
});
