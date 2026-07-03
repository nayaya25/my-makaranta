import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "timetable-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.timetableEntry.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.period.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.subjectAssignment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.score.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.subject.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.staff.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.class.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("Period model", () => {
  let schoolAId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const schoolA = await prisma.school.create({
      data: { name: "Timetable School A", slug: `timetable-test-${ts}-a` } as never,
    });
    schoolAId = schoolA.id;
  });

  it("creates a Period successfully", async () => {
    const period = await prisma.period.create({
      data: {
        schoolId: schoolAId,
        label: "Period 1",
        startTime: "08:00",
        endTime: "08:45",
        order: 1,
      },
    });
    expect(period.id).toBeDefined();
    expect(period.schoolId).toBe(schoolAId);
    expect(period.isBreak).toBe(false);
  });

  it("rejects duplicate (schoolId, order) — @@unique[schoolId, order]", async () => {
    await expect(
      prisma.period.create({
        data: {
          schoolId: schoolAId,
          label: "Period 1 Duplicate",
          startTime: "08:00",
          endTime: "08:45",
          order: 1, // duplicate order for same school
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("TimetableEntry model", () => {
  let schoolAId: string;
  let schoolBId: string;
  let academicYearId: string;
  let classId: string;
  let periodId: string;
  let subjectAssignmentId: string;
  let subjectAssignmentBId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const schoolA = await prisma.school.create({
      data: { name: "Timetable Entry School A", slug: `timetable-test-${ts}-entry-a` } as never,
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: { name: "Timetable Entry School B", slug: `timetable-test-${ts}-entry-b` } as never,
    });
    schoolBId = schoolB.id;

    // Create prerequisites for school A
    const classLevel = await prisma.classLevel.create({
      data: { schoolId: schoolAId, name: "JSS 1", order: 1 },
    });

    const klass = await prisma.class.create({
      data: { schoolId: schoolAId, classLevelId: classLevel.id, name: "JSS 1A" },
    });
    classId = klass.id;

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolAId,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    academicYearId = academicYear.id;

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

    // Period for school A (use order 10 to avoid conflict with Period model tests)
    const period = await prisma.period.create({
      data: {
        schoolId: schoolAId,
        label: "Period A1",
        startTime: "09:00",
        endTime: "09:45",
        order: 10,
      },
    });
    periodId = period.id;

    // Prerequisites for school B (for cross-tenant test)
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

    const periodB = await prisma.period.create({
      data: {
        schoolId: schoolBId,
        label: "Period B1",
        startTime: "09:00",
        endTime: "09:45",
        order: 10,
      },
    });

    // Create a TimetableEntry for school B
    await prisma.timetableEntry.create({
      data: {
        schoolId: schoolBId,
        academicYearId: academicYearB.id,
        classId: klassB.id,
        dayOfWeek: 1,
        periodId: periodB.id,
        subjectAssignmentId: subjectAssignmentB.id,
      },
    });
  });

  it("creates a TimetableEntry successfully", async () => {
    const entry = await prisma.timetableEntry.create({
      data: {
        schoolId: schoolAId,
        academicYearId,
        classId,
        dayOfWeek: 1,
        periodId,
        subjectAssignmentId,
      },
    });
    expect(entry.id).toBeDefined();
    expect(entry.schoolId).toBe(schoolAId);
    expect(entry.dayOfWeek).toBe(1);
  });

  it("rejects duplicate (classId, academicYearId, dayOfWeek, periodId) — @@unique constraint", async () => {
    await expect(
      prisma.timetableEntry.create({
        data: {
          schoolId: schoolAId,
          academicYearId,
          classId,
          dayOfWeek: 1, // same day
          periodId, // same period
          subjectAssignmentId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-tenant isolation: schoolA query does not return schoolB entries", async () => {
    const entries = await prisma.timetableEntry.findMany({
      where: { schoolId: schoolAId },
    });
    const schoolBEntryFound = entries.some((e) => e.schoolId === schoolBId);
    expect(schoolBEntryFound).toBe(false);

    // Ensure school B's entry exists in the DB
    const schoolBEntries = await prisma.timetableEntry.findMany({
      where: { schoolId: schoolBId },
    });
    expect(schoolBEntries.length).toBeGreaterThan(0);
  });
});
