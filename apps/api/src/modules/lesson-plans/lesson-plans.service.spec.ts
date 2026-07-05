import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PrismaService } from "../../core/prisma/prisma.service";
import { LessonPlansService } from "./lesson-plans.service";

// Use the raw PrismaClient for seeding (avoids middleware complications in tests)
const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────────
// Shared seed state
// ──────────────────────────────────────────────────────────────────────────────
let schoolId: string;
let otherSchoolId: string;

let academicYearId: string;
let otherAcademicYearId: string; // different year, same school (for cross-year test)

let classId: string;

let staffId: string; // owner of the main assignment
let staff2Id: string; // a different staff (non-owner)

let userId: string; // User row for staffId (identityType STAFF)
let user2Id: string; // User row for staff2Id (identityType STAFF)

let subjectAssignmentId: string; // owned by staffId, in academicYearId
let crossYearAssignmentId: string; // owned by staffId, in otherAcademicYearId

let termId: string; // belongs to academicYearId
let crossYearTermId: string; // belongs to otherAcademicYearId

// Other-school entities (for IDOR tests)
let otherSchoolAssignmentId: string;
let otherSchoolTermId: string;

const TS = Date.now();

function withUser<T>(sid: string, uid: string | null, fn: (svc: LessonPlansService) => Promise<T>): Promise<T> {
  const svc = new LessonPlansService(prisma as unknown as PrismaService);
  return TenantContext.run({ schoolId: sid, userId: uid }, () => fn(svc));
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed + teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const school = await prisma.school.create({
    data: { name: "LessonPlansSvc School", slug: `lesson-plans-svc-test-${TS}` } as never,
  });
  schoolId = school.id;

  const otherSchool = await prisma.school.create({
    data: { name: "LessonPlansSvc Other School", slug: `lesson-plans-svc-test-${TS}-other` } as never,
  });
  otherSchoolId = otherSchool.id;

  const classLevel = await prisma.classLevel.create({
    data: { schoolId, name: "JSS 1", order: 1 },
  });
  const klass = await prisma.class.create({
    data: { schoolId, classLevelId: classLevel.id, name: "JSS 1A" },
  });
  classId = klass.id;

  const ay = await prisma.academicYear.create({
    data: {
      schoolId,
      name: `${TS}/2026`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
    },
  });
  academicYearId = ay.id;

  const ay2 = await prisma.academicYear.create({
    data: {
      schoolId,
      name: `${TS}/2027`,
      startDate: new Date("2027-09-01"),
      endDate: new Date("2028-07-31"),
    },
  });
  otherAcademicYearId = ay2.id;

  // Term for the main academic year — 4 weeks (28 days) so weeksInTerm = 4
  const term = await prisma.term.create({
    data: {
      schoolId,
      academicYearId,
      number: 1,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-29"), // 28 days -> ceil(28/7) = 4 weeks
    },
  });
  termId = term.id;

  // Term for the other academic year (cross-year mismatch test)
  const crossYearTerm = await prisma.term.create({
    data: {
      schoolId,
      academicYearId: otherAcademicYearId,
      number: 1,
      startDate: new Date("2027-09-01"),
      endDate: new Date("2027-12-15"),
    },
  });
  crossYearTermId = crossYearTerm.id;

  const subject = await prisma.subject.create({
    data: { schoolId, name: "Mathematics", code: `MATH-${TS}` },
  });

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

  const user = await prisma.user.create({
    data: {
      schoolId,
      identityType: "STAFF",
      identityId: staffId,
      phone: `072${TS.toString().slice(-8)}`,
    },
  });
  userId = user.id;

  const user2 = await prisma.user.create({
    data: {
      schoolId,
      identityType: "STAFF",
      identityId: staff2Id,
      phone: `073${TS.toString().slice(-8)}`,
    },
  });
  user2Id = user2.id;

  const subjectAssignment = await prisma.subjectAssignment.create({
    data: { schoolId, subjectId: subject.id, classId, staffId, academicYearId },
  });
  subjectAssignmentId = subjectAssignment.id;

  // A second subject assignment (same staff, other academic year) for the cross-year test
  const subject2 = await prisma.subject.create({
    data: { schoolId, name: "English", code: `ENG-${TS}` },
  });
  const crossYearAssignment = await prisma.subjectAssignment.create({
    data: { schoolId, subjectId: subject2.id, classId, staffId, academicYearId: otherAcademicYearId },
  });
  crossYearAssignmentId = crossYearAssignment.id;

  // ── Other school entities (for IDOR / cross-tenant tests) ──────────────────
  const otherClassLevel = await prisma.classLevel.create({
    data: { schoolId: otherSchoolId, name: "JSS 1", order: 1 },
  });
  const otherClass = await prisma.class.create({
    data: { schoolId: otherSchoolId, classLevelId: otherClassLevel.id, name: "JSS 1A" },
  });

  const otherAy = await prisma.academicYear.create({
    data: {
      schoolId: otherSchoolId,
      name: `${TS}/2026`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
    },
  });

  const otherTerm = await prisma.term.create({
    data: {
      schoolId: otherSchoolId,
      academicYearId: otherAy.id,
      number: 1,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
    },
  });
  otherSchoolTermId = otherTerm.id;

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
      phone: `074${TS.toString().slice(-8)}`,
    },
  });

  const otherAssignment = await prisma.subjectAssignment.create({
    data: {
      schoolId: otherSchoolId,
      subjectId: otherSubject.id,
      classId: otherClass.id,
      staffId: otherStaff.id,
      academicYearId: otherAy.id,
    },
  });
  otherSchoolAssignmentId = otherAssignment.id;
});

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "lesson-plans-svc-test-" } },
    select: { id: true },
  });
  const ids = testSchools.map((s) => s.id);

  await prisma.lessonPlan.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.subjectAssignment.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.term.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.subject.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.user.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.staff.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.class.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.school.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// ──────────────────────────────────────────────────────────────────────────────
// putDraft
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.putDraft", () => {
  it("creates then updates the same (assignment, term, week) — one row", async () => {
    const created = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 1,
        topic: "Introduction to Algebra",
      }),
    );
    expect(created.id).toBeDefined();
    expect(created.status).toBe("DRAFT");
    expect(created.topic).toBe("Introduction to Algebra");

    const updated = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 1,
        topic: "Algebra Basics — updated",
      }),
    );
    expect(updated.id).toBe(created.id);
    expect(updated.topic).toBe("Algebra Basics — updated");

    const rows = await prisma.lessonPlan.findMany({
      where: { subjectAssignmentId, termId, weekNumber: 1 },
    });
    expect(rows).toHaveLength(1);
  });

  it("rejects when caller's staff id !== assignment.staffId (ForbiddenException)", async () => {
    await expect(
      withUser(schoolId, user2Id, (svc) =>
        svc.putDraft({
          subjectAssignmentId,
          termId,
          weekNumber: 2,
          topic: "Not my class",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a term whose academicYearId !== assignment's academicYearId (BadRequestException)", async () => {
    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId, // in academicYearId
          termId: crossYearTermId, // in otherAcademicYearId
          weekNumber: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects weekNumber > weeksInTerm(term) (BadRequestException)", async () => {
    // term spans 28 days -> weeksInTerm = 4; week 5 is out of range
    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId,
          termId,
          weekNumber: 5,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a foreign assignment id (NotFoundException)", async () => {
    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId: otherSchoolAssignmentId,
          termId,
          weekNumber: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a foreign term id (NotFoundException)", async () => {
    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId,
          termId: otherSchoolTermId,
          weekNumber: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects editing a plan that is SUBMITTED (BadRequestException)", async () => {
    const plan = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 3,
        topic: "Week 3",
      }),
    );
    await prisma.lessonPlan.update({ where: { id: plan.id }, data: { status: "SUBMITTED" } });

    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId,
          termId,
          weekNumber: 3,
          topic: "Trying to edit a submitted plan",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects editing a plan that is APPROVED (BadRequestException)", async () => {
    const plan = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 4,
        topic: "Week 4",
      }),
    );
    await prisma.lessonPlan.update({ where: { id: plan.id }, data: { status: "APPROVED" } });

    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({
          subjectAssignmentId,
          termId,
          weekNumber: 4,
          topic: "Trying to edit an approved plan",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("editing a RETURNED plan flips status back to DRAFT", async () => {
    // Use the cross-year assignment/term pairing so we don't collide with week numbers above.
    const plan = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId: crossYearAssignmentId,
        termId: crossYearTermId,
        weekNumber: 1,
        topic: "Returned plan week",
      }),
    );
    await prisma.lessonPlan.update({ where: { id: plan.id }, data: { status: "RETURNED" } });

    const edited = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId: crossYearAssignmentId,
        termId: crossYearTermId,
        weekNumber: 1,
        topic: "Re-edited after return",
      }),
    );
    expect(edited.status).toBe("DRAFT");
    expect(edited.topic).toBe("Re-edited after return");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getForAssignment
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.getForAssignment", () => {
  it("returns only that assignment+term's plans, scoped to school", async () => {
    const plans = await withUser(schoolId, userId, (svc) =>
      svc.getForAssignment(subjectAssignmentId, termId),
    );
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(p.subjectAssignmentId).toBe(subjectAssignmentId);
      expect(p.termId).toBe(termId);
      expect(p.schoolId).toBe(schoolId);
    }
    // ordered by weekNumber asc
    const weekNumbers = plans.map((p) => p.weekNumber);
    expect(weekNumbers).toEqual([...weekNumbers].sort((a, b) => a - b));
  });

  it("does not leak another school's plans", async () => {
    // Seed a plan directly in the other school for the same "shape" of query
    await expect(
      withUser(otherSchoolId, null, (svc) =>
        svc.getForAssignment(subjectAssignmentId, termId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a non-owner teacher (no review) reading another teacher's assignment", async () => {
    await expect(
      withUser(schoolId, user2Id, (svc) => svc.getForAssignment(subjectAssignmentId, termId)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a reviewer (canReviewAll=true) to read any assignment's plans", async () => {
    const plans = await withUser(schoolId, user2Id, (svc) =>
      svc.getForAssignment(subjectAssignmentId, termId, true),
    );
    expect(Array.isArray(plans)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getOne
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.getOne", () => {
  it("returns a plan scoped to the school", async () => {
    const created = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 2,
        topic: "Week 2",
      }),
    );
    const fetched = await withUser(schoolId, userId, (svc) => svc.getOne(created.id));
    expect(fetched.id).toBe(created.id);
  });

  it("throws NotFoundException for a foreign-school plan id", async () => {
    const created = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({
        subjectAssignmentId,
        termId,
        weekNumber: 2,
      }),
    );
    await expect(
      withUser(otherSchoolId, null, (svc) => svc.getOne(created.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a non-owner teacher (no review) reading another teacher's plan", async () => {
    const created = await prisma.lessonPlan.create({
      data: { schoolId, subjectAssignmentId, termId, weekNumber: 18, topic: "W18" },
    });
    await expect(
      withUser(schoolId, user2Id, (svc) => svc.getOne(created.id)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a reviewer (canReviewAll=true) to read any plan", async () => {
    const created = await prisma.lessonPlan.create({
      data: { schoolId, subjectAssignmentId, termId, weekNumber: 19, topic: "W19" },
    });
    const fetched = await withUser(schoolId, user2Id, (svc) => svc.getOne(created.id, true));
    expect(fetched.id).toBe(created.id);
  });
});
