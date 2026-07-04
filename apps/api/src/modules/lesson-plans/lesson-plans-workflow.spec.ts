import { BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
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
let classId: string;

let staffId: string; // owner of the main assignment
let staff2Id: string; // a different staff (non-owner / reviewer)

let userId: string; // User row for staffId (identityType STAFF)
let user2Id: string; // User row for staff2Id (identityType STAFF)

let subjectAssignmentId: string; // owned by staffId, in academicYearId

let termId: string; // belongs to academicYearId

// Other-school entities (for IDOR tests)
let otherSchoolPlanId: string;

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
    data: { name: "LessonPlansWorkflow School", slug: `lesson-plans-wf-test-${TS}` } as never,
  });
  schoolId = school.id;

  const otherSchool = await prisma.school.create({
    data: { name: "LessonPlansWorkflow Other School", slug: `lesson-plans-wf-test-${TS}-other` } as never,
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

  // Term — 10 weeks (70 days) so weeksInTerm = 10, enough for all workflow test weeks
  const term = await prisma.term.create({
    data: {
      schoolId,
      academicYearId,
      number: 1,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-11-10"),
    },
  });
  termId = term.id;

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

  // ── Other school entities (for IDOR tests) ──────────────────
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

  const otherPlan = await prisma.lessonPlan.create({
    data: {
      schoolId: otherSchoolId,
      subjectAssignmentId: otherAssignment.id,
      termId: otherTerm.id,
      weekNumber: 1,
      topic: "Other school plan",
    },
  });
  otherSchoolPlanId = otherPlan.id;
});

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "lesson-plans-wf-test-" } },
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

// Helper to create a fresh DRAFT plan at a given week for the main assignment/term.
async function createDraft(week: number, topic: string) {
  return withUser(schoolId, userId, (svc) =>
    svc.putDraft({ subjectAssignmentId, termId, weekNumber: week, topic }),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// submit
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.submit", () => {
  it("owner: DRAFT -> SUBMITTED, sets submittedAt", async () => {
    const plan = await createDraft(1, "Week 1 draft");
    expect(plan.status).toBe("DRAFT");

    const submitted = await withUser(schoolId, userId, (svc) => svc.submit(plan.id));
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
  });

  it("owner: RETURNED -> SUBMITTED", async () => {
    const plan = await createDraft(2, "Week 2 draft");
    await prisma.lessonPlan.update({ where: { id: plan.id }, data: { status: "RETURNED" } });

    const submitted = await withUser(schoolId, userId, (svc) => svc.submit(plan.id));
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("non-owner submitting -> ForbiddenException", async () => {
    const plan = await createDraft(3, "Week 3 draft");
    await expect(withUser(schoolId, user2Id, (svc) => svc.submit(plan.id))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("submitting an APPROVED plan -> BadRequestException", async () => {
    const plan = await createDraft(4, "Week 4 draft");
    await prisma.lessonPlan.update({ where: { id: plan.id }, data: { status: "APPROVED" } });

    await expect(withUser(schoolId, userId, (svc) => svc.submit(plan.id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("IDOR: submitting another school's plan id -> NotFoundException", async () => {
    await expect(
      withUser(schoolId, userId, (svc) => svc.submit(otherSchoolPlanId)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// review
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.review", () => {
  it("APPROVED path: SUBMITTED -> APPROVED, sets reviewedAt + reviewedByStaffId; subsequent putDraft is locked", async () => {
    const plan = await createDraft(5, "Week 5 draft");
    await withUser(schoolId, userId, (svc) => svc.submit(plan.id));

    const reviewed = await withUser(schoolId, user2Id, (svc) =>
      svc.review(plan.id, { decision: "APPROVED" }),
    );
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    expect(reviewed.reviewedByStaffId).toBe(staff2Id);

    await expect(
      withUser(schoolId, userId, (svc) =>
        svc.putDraft({ subjectAssignmentId, termId, weekNumber: 5, topic: "Trying to edit approved" }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("RETURNED path requires a note (missing -> BadRequestException)", async () => {
    const plan = await createDraft(6, "Week 6 draft");
    await withUser(schoolId, userId, (svc) => svc.submit(plan.id));

    await expect(
      withUser(schoolId, user2Id, (svc) => svc.review(plan.id, { decision: "RETURNED" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("RETURNED path: sets reviewNote + reopens (putDraft succeeds, flips to DRAFT)", async () => {
    const plan = await createDraft(7, "Week 7 draft");
    await withUser(schoolId, userId, (svc) => svc.submit(plan.id));

    const reviewed = await withUser(schoolId, user2Id, (svc) =>
      svc.review(plan.id, { decision: "RETURNED", note: "Please add more detail on activities." }),
    );
    expect(reviewed.status).toBe("RETURNED");
    expect(reviewed.reviewNote).toBe("Please add more detail on activities.");
    expect(reviewed.reviewedByStaffId).toBe(staff2Id);

    const edited = await withUser(schoolId, userId, (svc) =>
      svc.putDraft({ subjectAssignmentId, termId, weekNumber: 7, topic: "Re-edited after return" }),
    );
    expect(edited.status).toBe("DRAFT");
  });

  it("review on a non-SUBMITTED plan -> BadRequestException", async () => {
    const plan = await createDraft(8, "Week 8 draft"); // still DRAFT
    await expect(
      withUser(schoolId, user2Id, (svc) => svc.review(plan.id, { decision: "APPROVED" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("IDOR: reviewing another school's plan id -> NotFoundException", async () => {
    await expect(
      withUser(schoolId, user2Id, (svc) => svc.review(otherSchoolPlanId, { decision: "APPROVED" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// reviewQueue
// ──────────────────────────────────────────────────────────────────────────────

describe("LessonPlansService.reviewQueue", () => {
  it("returns only SUBMITTED plans for the school, with subject/class/staff names, ordered by submittedAt asc", async () => {
    const planA = await createDraft(9, "Week 9 draft");
    const planB = await createDraft(10, "Week 10 draft");
    await withUser(schoolId, userId, (svc) => svc.submit(planA.id));
    await withUser(schoolId, userId, (svc) => svc.submit(planB.id));

    const queue = await withUser(schoolId, userId, (svc) => svc.reviewQueue());

    const ids = queue.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([planA.id, planB.id]));
    for (const p of queue) {
      expect(p.status).toBe("SUBMITTED");
      expect(p.schoolId).toBe(schoolId);
      expect(p.subjectAssignment.subject.name).toBeDefined();
      expect(p.subjectAssignment.class.name).toBeDefined();
      expect(p.subjectAssignment.staff.firstName).toBeDefined();
    }
    // ordered by submittedAt asc
    const submittedTimes = queue.map((p) => (p.submittedAt as Date).getTime());
    expect(submittedTimes).toEqual([...submittedTimes].sort((a, b) => a - b));

    // does not include the other school's plans
    expect(queue.every((p) => p.schoolId === schoolId)).toBe(true);
  });

  it("filters by termId when provided", async () => {
    const queue = await withUser(schoolId, userId, (svc) => svc.reviewQueue(termId));
    expect(queue.every((p) => p.termId === termId)).toBe(true);
  });
});
