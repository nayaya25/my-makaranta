/**
 * Integration test: ReleaseService – EY branch (AC-3 Task 6)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm --filter @mymakaranta/api exec jest release --runInBand --testPathPattern="release.service"
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ReleaseService } from "./release.service";
import { assertNotReleased } from "./release-lock.util";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: EY class release – Release row created, ZERO ResultSheets
// ──────────────────────────────────────────────────────────────────────────────
describe("ReleaseService – EY class release", () => {
  let service: ReleaseService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let personId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `EYRelease-${ts}`, slug: `ey-rel-${ts}` } as never,
    });
    schoolId = school.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: `Nursery-${ts}`, order: 0, isEarlyYears: true },
    });

    const klass = await prisma.class.create({
      data: { schoolId, name: `Nursery 1A-${ts}`, classLevelId: level.id },
    });
    classId = klass.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2025/2026-ey-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    // Create a person (for releasedBy)
    const person = await prisma.person.create({ data: {} });
    personId = person.id;

    // Create a student + enroll (no personId on Student — use admissionNo)
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `EY-${ts}`,
        firstName: "Amira",
        lastName: "EY",
        gender: "FEMALE",
        dateOfBirth: new Date("2020-01-01"),
      },
    });

    await prisma.enrollment.create({
      data: { classId, termId, studentId: student.id },
    });

    service = new ReleaseService(prisma as unknown as PrismaService);
  });

  it("creates a Release row and ZERO ResultSheet rows for an EY class", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.release(classId, termId, personId),
    );

    // Return value has released: 0
    expect(result.released).toBe(0);
    expect(result.classId).toBe(classId);
    expect(result.termId).toBe(termId);

    // Exactly one Release row exists
    const releaseCount = await prisma.release.count({ where: { classId, termId, schoolId } });
    expect(releaseCount).toBe(1);

    // ZERO ResultSheet rows – the EY path skips numeric computation
    const sheetCount = await prisma.resultSheet.count({ where: { classId, termId, schoolId } });
    expect(sheetCount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: Lock – assertNotReleased throws ForbiddenException after EY release
// ──────────────────────────────────────────────────────────────────────────────
describe("ReleaseService – EY lock (assertNotReleased)", () => {
  let service: ReleaseService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let personId: string;

  beforeAll(async () => {
    const ts = Date.now() + 1;

    const school = await prisma.school.create({
      data: { name: `EYLock-${ts}`, slug: `ey-lock-${ts}` } as never,
    });
    schoolId = school.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: `Nursery-${ts}`, order: 0, isEarlyYears: true },
    });

    const klass = await prisma.class.create({
      data: { schoolId, name: `Nursery Lock-${ts}`, classLevelId: level.id },
    });
    classId = klass.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2025/2026-lock-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    const person = await prisma.person.create({ data: {} });
    personId = person.id;

    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `EYL-${ts}`,
        firstName: "Lock",
        lastName: "Test",
        gender: "MALE",
        dateOfBirth: new Date("2020-01-01"),
      },
    });
    await prisma.enrollment.create({ data: { classId, termId, studentId: student.id } });

    service = new ReleaseService(prisma as unknown as PrismaService);
  });

  it("assertNotReleased throws ForbiddenException after EY release", async () => {
    // Release the EY class
    await TenantContext.run({ schoolId, userId: null }, async () =>
      service.release(classId, termId, personId),
    );

    // Now assertNotReleased must throw ForbiddenException
    await expect(assertNotReleased(prisma, classId, termId)).rejects.toThrow(ForbiddenException);
    await expect(assertNotReleased(prisma, classId, termId)).rejects.toThrow("Results released — locked.");
  });

  it("duplicate EY release throws ConflictException", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, async () =>
        service.release(classId, termId, personId),
      ),
    ).rejects.toThrow(ConflictException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: Standard numeric class release – ResultSheets ARE created (regression)
// ──────────────────────────────────────────────────────────────────────────────
describe("ReleaseService – standard numeric class release (regression)", () => {
  let service: ReleaseService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let personId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now() + 2;

    const school = await prisma.school.create({
      data: { name: `NumRelease-${ts}`, slug: `num-rel-${ts}` } as never,
    });
    schoolId = school.id;

    // Standard level (isEarlyYears defaults to false)
    const level = await prisma.classLevel.create({
      data: { schoolId, name: `JSS1-${ts}`, order: 0 },
    });

    const klass = await prisma.class.create({
      data: { schoolId, name: `JSS 1A-${ts}`, classLevelId: level.id },
    });
    classId = klass.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2025/2026-num-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    // Subject
    const subject = await prisma.subject.create({
      data: { schoolId, name: `Maths-${ts}`, code: `MTH-${ts}` },
    });

    // Staff (required by SubjectAssignment)
    const staff = await prisma.staff.create({
      data: {
        schoolId,
        staffNo: `NUM-ST-${ts}`,
        firstName: "Test",
        lastName: "Teacher",
        email: `num-teacher-${ts}@test.com`,
        phone: `0800${ts}`.slice(0, 11),
        hiredAt: new Date("2024-01-01"),
      },
    });

    // SubjectAssignment
    await prisma.subjectAssignment.create({
      data: { schoolId, classId, subjectId: subject.id, staffId: staff.id, academicYearId: year.id },
    });

    // AssessmentType (school-level default, classLevelId null)
    const caType = await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 40, order: 1, classLevelId: null },
    });
    const examType = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 60, order: 2, classLevelId: null },
    });

    // GradeBoundary (school-level default)
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", order: 1, classLevelId: null },
    });
    await prisma.gradeBoundary.create({
      data: { schoolId, grade: "C", minScore: 0, remark: "Fair", order: 2, classLevelId: null },
    });

    // Person (for releasedBy + recordedBy)
    const person = await prisma.person.create({ data: {} });
    personId = person.id;

    // Student + enrollment
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `NUM-${ts}`,
        firstName: "Num",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    });
    studentId = student.id;

    await prisma.enrollment.create({ data: { classId, termId, studentId } });

    // Scores
    await prisma.score.create({
      data: {
        schoolId, classId, termId, studentId,
        subjectId: subject.id,
        assessmentTypeId: caType.id,
        value: 35,
        recordedBy: person.id,
      },
    });
    await prisma.score.create({
      data: {
        schoolId, classId, termId, studentId,
        subjectId: subject.id,
        assessmentTypeId: examType.id,
        value: 55,
        recordedBy: person.id,
      },
    });

    service = new ReleaseService(prisma as unknown as PrismaService);
  });

  it("creates ResultSheet rows for a standard numeric class", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.release(classId, termId, personId),
    );

    // released count equals enrolled student count (1)
    expect(result.released).toBe(1);

    // ResultSheet row exists
    const sheetCount = await prisma.resultSheet.count({ where: { classId, termId, schoolId } });
    expect(sheetCount).toBe(1);

    // Release row exists
    const releaseCount = await prisma.release.count({ where: { classId, termId, schoolId } });
    expect(releaseCount).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4: getStatus – EY class appears in status, shows released after release
// ──────────────────────────────────────────────────────────────────────────────
describe("ReleaseService – getStatus for EY class", () => {
  let service: ReleaseService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let personId: string;

  beforeAll(async () => {
    const ts = Date.now() + 3;

    const school = await prisma.school.create({
      data: { name: `EYStatus-${ts}`, slug: `ey-status-${ts}` } as never,
    });
    schoolId = school.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: `Reception-${ts}`, order: 0, isEarlyYears: true },
    });

    const klass = await prisma.class.create({
      data: { schoolId, name: `Reception A-${ts}`, classLevelId: level.id },
    });
    classId = klass.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2025/2026-status-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    const person = await prisma.person.create({ data: {} });
    personId = person.id;

    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `EYS-${ts}`,
        firstName: "Status",
        lastName: "EY",
        gender: "FEMALE",
        dateOfBirth: new Date("2020-01-01"),
      },
    });
    await prisma.enrollment.create({ data: { classId, termId, studentId: student.id } });

    service = new ReleaseService(prisma as unknown as PrismaService);
  });

  it("getStatus shows EY class as not-yet-released before release", async () => {
    const statuses = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.getStatus(termId),
    );

    const entry = statuses.find((s) => s.classId === classId);
    expect(entry).toBeDefined();
    expect(entry!.released).toBe(false);
    expect(entry!.releasedAt).toBeNull();
  });

  it("getStatus shows EY class as released after release", async () => {
    await TenantContext.run({ schoolId, userId: null }, async () =>
      service.release(classId, termId, personId),
    );

    const statuses = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.getStatus(termId),
    );

    const entry = statuses.find((s) => s.classId === classId);
    expect(entry).toBeDefined();
    expect(entry!.released).toBe(true);
    expect(entry!.releasedAt).not.toBeNull();
  });
});
