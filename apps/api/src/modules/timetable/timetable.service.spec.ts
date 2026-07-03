import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PeriodsService } from "./periods.service";
import { TimetableService } from "./timetable.service";

// Use the raw PrismaClient for seeding (avoids middleware complications in tests)
const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────────
// Shared seed state
// ──────────────────────────────────────────────────────────────────────────────
let schoolId: string;
let otherSchoolId: string;

let academicYearId: string;
let otherAcademicYearId: string;

let classAId: string;
let classBId: string;

let staffId: string;
let staff2Id: string;

let subjectId: string;

// Assignments: teacher1 → classA, teacher1 → classB, teacher2 → classA
let saAId: string; // teacher1 + classA + academicYear
let saBId: string; // teacher1 + classB + academicYear
let saA2Id: string; // teacher2 + classA + academicYear

// Periods
let p1Id: string; // period 1 (normal)
let p2Id: string; // period 2 (normal)
let pBreakId: string; // break period

// Other-school entities (for IDOR tests)
let otherClassId: string;
let otherPeriodId: string;
let otherYearId: string;
let otherSaId: string;

const TS = Date.now();

function withSchool<T>(sid: string, fn: (svc: TimetableService) => Promise<T>): Promise<T> {
  const svc = new TimetableService(prisma as unknown as PrismaService, new PeriodsService(prisma as unknown as PrismaService));
  return TenantContext.run({ schoolId: sid, userId: null }, () => fn(svc));
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed + teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Main school
  const school = await prisma.school.create({
    data: { name: "TimetableSvc School", slug: `timetable-svc-test-${TS}` } as never,
  });
  schoolId = school.id;

  // Other school for IDOR tests
  const otherSchool = await prisma.school.create({
    data: { name: "TimetableSvc Other School", slug: `timetable-svc-test-${TS}-other` } as never,
  });
  otherSchoolId = otherSchool.id;

  // ClassLevel + two classes in main school
  const classLevel = await prisma.classLevel.create({
    data: { schoolId, name: "JSS 1", order: 1 },
  });
  const classA = await prisma.class.create({
    data: { schoolId, classLevelId: classLevel.id, name: "JSS 1A" },
  });
  classAId = classA.id;
  const classB = await prisma.class.create({
    data: { schoolId, classLevelId: classLevel.id, name: "JSS 1B" },
  });
  classBId = classB.id;

  // Academic year
  const ay = await prisma.academicYear.create({
    data: {
      schoolId,
      name: `${TS}/2026`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
    },
  });
  academicYearId = ay.id;

  // Second academic year (for academicYearId mismatch test)
  const ay2 = await prisma.academicYear.create({
    data: {
      schoolId,
      name: `${TS}/2027`,
      startDate: new Date("2027-09-01"),
      endDate: new Date("2028-07-31"),
    },
  });
  otherAcademicYearId = ay2.id;

  // Subject
  const subject = await prisma.subject.create({
    data: { schoolId, name: "Mathematics", code: `MATH-${TS}` },
  });
  subjectId = subject.id;

  // Two staff members
  const staff = await prisma.staff.create({
    data: {
      schoolId,
      staffNo: `ST1-${TS}`,
      firstName: "Amina",
      lastName: "Yusuf",
      email: `amina.${TS}@school.com`,
      phone: `070${TS.toString().slice(-8)}`,
    },
  });
  staffId = staff.id;

  const staff2 = await prisma.staff.create({
    data: {
      schoolId,
      staffNo: `ST2-${TS}`,
      firstName: "Bello",
      lastName: "Musa",
      email: `bello.${TS}@school.com`,
      phone: `071${TS.toString().slice(-8)}`,
    },
  });
  staff2Id = staff2.id;

  // SubjectAssignments
  const saA = await prisma.subjectAssignment.create({
    data: { schoolId, subjectId, classId: classAId, staffId, academicYearId },
  });
  saAId = saA.id;

  const saB = await prisma.subjectAssignment.create({
    data: { schoolId, subjectId, classId: classBId, staffId, academicYearId },
  });
  saBId = saB.id;

  // staff2 → classA (need a different subject to avoid unique constraint [subjectId, classId, academicYearId])
  const subject2 = await prisma.subject.create({
    data: { schoolId, name: "English", code: `ENG-${TS}` },
  });
  const saA2 = await prisma.subjectAssignment.create({
    data: { schoolId, subjectId: subject2.id, classId: classAId, staffId: staff2Id, academicYearId },
  });
  saA2Id = saA2.id;

  // Periods
  const p1 = await prisma.period.create({
    data: { schoolId, label: "Period 1", startTime: "08:00", endTime: "08:45", order: 1 },
  });
  p1Id = p1.id;

  const p2 = await prisma.period.create({
    data: { schoolId, label: "Period 2", startTime: "09:00", endTime: "09:45", order: 2 },
  });
  p2Id = p2.id;

  const pBreak = await prisma.period.create({
    data: { schoolId, label: "Break", startTime: "09:45", endTime: "10:00", order: 3, isBreak: true },
  });
  pBreakId = pBreak.id;

  // ── Other school entities ──────────────────────────────────────────────────
  const otherClassLevel = await prisma.classLevel.create({
    data: { schoolId: otherSchoolId, name: "JSS 1", order: 1 },
  });
  const otherClass = await prisma.class.create({
    data: { schoolId: otherSchoolId, classLevelId: otherClassLevel.id, name: "JSS 1A" },
  });
  otherClassId = otherClass.id;

  const otherAy = await prisma.academicYear.create({
    data: {
      schoolId: otherSchoolId,
      name: `${TS}/2026`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
    },
  });
  otherYearId = otherAy.id;

  const otherSubject = await prisma.subject.create({
    data: { schoolId: otherSchoolId, name: "Mathematics", code: `MATH-O-${TS}` },
  });

  const otherStaff = await prisma.staff.create({
    data: {
      schoolId: otherSchoolId,
      staffNo: `STO-${TS}`,
      firstName: "Other",
      lastName: "Teacher",
      email: `other.${TS}@school.com`,
      phone: `072${TS.toString().slice(-8)}`,
    },
  });

  const otherSa = await prisma.subjectAssignment.create({
    data: {
      schoolId: otherSchoolId,
      subjectId: otherSubject.id,
      classId: otherClassId,
      staffId: otherStaff.id,
      academicYearId: otherYearId,
    },
  });
  otherSaId = otherSa.id;

  const otherPeriod = await prisma.period.create({
    data: { schoolId: otherSchoolId, label: "Period 1", startTime: "08:00", endTime: "08:45", order: 1 },
  });
  otherPeriodId = otherPeriod.id;
});

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "timetable-svc-test-" } },
    select: { id: true },
  });
  const ids = testSchools.map((s) => s.id);

  await prisma.timetableEntry.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.period.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.subjectAssignment.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.score.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.subject.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.staff.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.class.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.school.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// ──────────────────────────────────────────────────────────────────────────────
// putEntry — create + upsert (replace)
// ──────────────────────────────────────────────────────────────────────────────

describe("TimetableService.putEntry", () => {
  it("creates a timetable cell", async () => {
    const entry = await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classAId,
        academicYearId,
        dayOfWeek: 1,
        periodId: p1Id,
        subjectAssignmentId: saAId,
      }),
    );
    expect(entry.id).toBeDefined();
    expect(entry.classId).toBe(classAId);
    expect(entry.periodId).toBe(p1Id);
  });

  it("replaces on same (class, year, day, period) — still one row", async () => {
    // First: create another subject assignment to replace with
    // Use saA2Id (staff2 → classA) as the replacement assignment
    const updated = await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classAId,
        academicYearId,
        dayOfWeek: 1,
        periodId: p1Id,
        subjectAssignmentId: saA2Id,
      }),
    );
    expect(updated.subjectAssignmentId).toBe(saA2Id);

    // Confirm only one row exists for this slot
    const rows = await prisma.timetableEntry.findMany({
      where: { classId: classAId, academicYearId, dayOfWeek: 1, periodId: p1Id },
    });
    expect(rows).toHaveLength(1);

    // Reset back to saAId for clash tests below
    await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classAId,
        academicYearId,
        dayOfWeek: 1,
        periodId: p1Id,
        subjectAssignmentId: saAId,
      }),
    );
  });

  // ── Clash guard ────────────────────────────────────────────────────────────

  it("throws BadRequestException when teacher is already scheduled in another class at same time", async () => {
    // classA@Mon/P1 = staff1 (Amina Yusuf) — already seeded above
    // scheduling classB@Mon/P1 with staff1 should clash
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classBId,
          academicYearId,
          dayOfWeek: 1,
          periodId: p1Id,
          subjectAssignmentId: saBId, // staff1 → classB
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Error message should contain classA's name
    try {
      await withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classBId,
          academicYearId,
          dayOfWeek: 1,
          periodId: p1Id,
          subjectAssignmentId: saBId,
        }),
      );
    } catch (err: any) {
      expect(err.message).toContain("JSS 1A");
    }
  });

  it("allows scheduling the same teacher in classB at a different period (P2)", async () => {
    const entry = await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classBId,
        academicYearId,
        dayOfWeek: 1,
        periodId: p2Id,
        subjectAssignmentId: saBId,
      }),
    );
    expect(entry.id).toBeDefined();
  });

  it("allows a different teacher in classB at Mon/P1", async () => {
    // staff2 (Bello) → classA assignment — but put into classB slot
    // Actually, we need staff2 → classB assignment. Let's create one.
    // staff2 has saA2 for classA. We need staff2 → classB with a different subject.
    const subjectB = await prisma.subject.create({
      data: { schoolId, name: "Physics", code: `PHY-${TS}` },
    });
    const saB2 = await prisma.subjectAssignment.create({
      data: { schoolId, subjectId: subjectB.id, classId: classBId, staffId: staff2Id, academicYearId },
    });

    const entry = await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classBId,
        academicYearId,
        dayOfWeek: 1,
        periodId: p1Id,
        subjectAssignmentId: saB2.id,
      }),
    );
    expect(entry.id).toBeDefined();
  });

  // ── Break guard ────────────────────────────────────────────────────────────

  it("throws BadRequestException when scheduling into a break period", async () => {
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId,
          dayOfWeek: 2,
          periodId: pBreakId,
          subjectAssignmentId: saAId,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Consistency / IDOR checks ──────────────────────────────────────────────

  it("throws BadRequestException when assignment classId !== dto.classId", async () => {
    // saBId belongs to classB, but we're putting into classA
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId,
          dayOfWeek: 3,
          periodId: p1Id,
          subjectAssignmentId: saBId, // classB's assignment
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException when assignment academicYearId !== dto.academicYearId", async () => {
    // saAId belongs to academicYearId, but we pass otherAcademicYearId in the dto
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId: otherAcademicYearId,
          dayOfWeek: 3,
          periodId: p1Id,
          subjectAssignmentId: saAId, // this assignment's academicYearId ≠ otherAcademicYearId
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFoundException when classId/periodId/academicYearId belongs to another school", async () => {
    // Use other-school classId in main school context
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: otherClassId,
          academicYearId,
          dayOfWeek: 1,
          periodId: p1Id,
          subjectAssignmentId: saAId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Use other-school periodId in main school context
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId,
          dayOfWeek: 1,
          periodId: otherPeriodId,
          subjectAssignmentId: saAId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Use other-school academicYearId in main school context
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId: otherYearId,
          dayOfWeek: 1,
          periodId: p1Id,
          subjectAssignmentId: saAId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when subjectAssignmentId belongs to another school", async () => {
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId,
          dayOfWeek: 3,
          periodId: p2Id,
          subjectAssignmentId: otherSaId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws BadRequestException when dayOfWeek=6", async () => {
    await expect(
      withSchool(schoolId, (svc) =>
        svc.putEntry({
          classId: classAId,
          academicYearId,
          dayOfWeek: 6,
          periodId: p1Id,
          subjectAssignmentId: saAId,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// deleteEntry
// ──────────────────────────────────────────────────────────────────────────────

describe("TimetableService.deleteEntry", () => {
  let entryId: string;

  beforeAll(async () => {
    const entry = await withSchool(schoolId, (svc) =>
      svc.putEntry({
        classId: classAId,
        academicYearId,
        dayOfWeek: 5,
        periodId: p2Id,
        subjectAssignmentId: saAId,
      }),
    );
    entryId = entry.id;
  });

  it("deletes an existing entry", async () => {
    await withSchool(schoolId, (svc) => svc.deleteEntry(entryId));
    const gone = await prisma.timetableEntry.findFirst({ where: { id: entryId } });
    expect(gone).toBeNull();
  });

  it("throws NotFoundException for a non-existent or foreign-school entry", async () => {
    await expect(
      withSchool(schoolId, (svc) => svc.deleteEntry("non-existent-id")),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getClassGrid
// ──────────────────────────────────────────────────────────────────────────────

describe("TimetableService.getClassGrid", () => {
  it("returns periods + entries with subjectName and teacherName", async () => {
    const result = await withSchool(schoolId, (svc) =>
      svc.getClassGrid(classAId, academicYearId),
    );

    expect(Array.isArray(result.periods)).toBe(true);
    expect(result.periods.length).toBeGreaterThan(0);

    // Periods should be ordered by order asc
    const orders = result.periods.map((p) => p.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));

    expect(Array.isArray(result.entries)).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);

    const entry = result.entries[0]!;
    expect(typeof entry.subjectName).toBe("string");
    expect(entry.subjectName.length).toBeGreaterThan(0);
    expect(typeof entry.teacherName).toBe("string");
    expect(entry.teacherName.length).toBeGreaterThan(0);
    expect(entry.id).toBeDefined();
    expect(entry.dayOfWeek).toBeDefined();
    expect(entry.periodId).toBeDefined();
    expect(entry.subjectAssignmentId).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getTeacherGrid
// ──────────────────────────────────────────────────────────────────────────────

describe("TimetableService.getTeacherGrid", () => {
  it("aggregates entries across both classes with className", async () => {
    // staff1 (Amina) is assigned to classA@Mon/P1 and classB@Mon/P2
    const result = await withSchool(schoolId, (svc) =>
      svc.getTeacherGrid(staffId, academicYearId),
    );

    expect(Array.isArray(result.periods)).toBe(true);
    expect(result.periods.length).toBeGreaterThan(0);

    expect(Array.isArray(result.entries)).toBe(true);
    // Should have at least 2 entries (classA Mon/P1 + classB Mon/P2)
    expect(result.entries.length).toBeGreaterThanOrEqual(2);

    const classNames = result.entries.map((e) => e.className);
    expect(classNames).toContain("JSS 1A");
    expect(classNames).toContain("JSS 1B");

    const entry = result.entries[0]!;
    expect(typeof entry.className).toBe("string");
    expect(typeof entry.subjectName).toBe("string");
    expect(entry.dayOfWeek).toBeDefined();
    expect(entry.periodId).toBeDefined();
  });
});
