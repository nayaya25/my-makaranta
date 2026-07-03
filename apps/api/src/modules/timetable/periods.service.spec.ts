import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PeriodsService } from "./periods.service";
import { PrismaService } from "../../core/prisma/prisma.service";

// Use the raw PrismaClient for seeding (avoids middleware complications in tests)
const prisma = new PrismaClient();

let schoolAId: string;
let schoolBId: string;

// Helper: run a service call inside TenantContext for schoolA
function withSchoolA<T>(fn: (svc: PeriodsService) => Promise<T>): Promise<T> {
  const svc = new PeriodsService(prisma as unknown as PrismaService);
  return TenantContext.run({ schoolId: schoolAId, userId: null }, () => fn(svc));
}

function withSchoolB<T>(fn: (svc: PeriodsService) => Promise<T>): Promise<T> {
  const svc = new PeriodsService(prisma as unknown as PrismaService);
  return TenantContext.run({ schoolId: schoolBId, userId: null }, () => fn(svc));
}

beforeAll(async () => {
  const ts = Date.now();

  const schoolA = await prisma.school.create({
    data: { name: "Periods Svc School A", slug: `periods-svc-test-${ts}-a` } as never,
  });
  schoolAId = schoolA.id;

  const schoolB = await prisma.school.create({
    data: { name: "Periods Svc School B", slug: `periods-svc-test-${ts}-b` } as never,
  });
  schoolBId = schoolB.id;
});

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "periods-svc-test-" } },
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

// ─── create ──────────────────────────────────────────────────────────────────

describe("PeriodsService.create", () => {
  it("persists a period and returns it", async () => {
    const period = await withSchoolA((svc) =>
      svc.create({ label: "Period 1", startTime: "08:00", endTime: "08:45", order: 1 }),
    );
    expect(period.id).toBeDefined();
    expect(period.schoolId).toBe(schoolAId);
    expect(period.label).toBe("Period 1");

    // Verify it actually exists in DB
    const found = await prisma.period.findFirst({ where: { id: period.id } });
    expect(found).not.toBeNull();
    expect(found?.schoolId).toBe(schoolAId);
  });

  it("throws BadRequestException for invalid startTime '25:00'", async () => {
    await expect(
      withSchoolA((svc) =>
        svc.create({ label: "Bad", startTime: "25:00", endTime: "09:00", order: 99 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException when startTime >= endTime ('09:00', '08:00')", async () => {
    await expect(
      withSchoolA((svc) =>
        svc.create({ label: "Bad Range", startTime: "09:00", endTime: "08:00", order: 98 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException on duplicate order (@@unique[schoolId,order])", async () => {
    // order 1 was already inserted in the first test
    await expect(
      withSchoolA((svc) =>
        svc.create({ label: "Period 1 Dup", startTime: "08:00", endTime: "08:45", order: 1 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe("PeriodsService.list", () => {
  it("returns periods ordered by order asc (insert order 3,1,2 → [1,2,3])", async () => {
    const ts = Date.now();
    // Seed directly to control school
    const school = await prisma.school.create({
      data: { name: "List School", slug: `periods-svc-test-${ts}-list` } as never,
    });
    const sid = school.id;

    await prisma.period.createMany({
      data: [
        { schoolId: sid, label: "P3", startTime: "10:00", endTime: "10:45", order: 3 },
        { schoolId: sid, label: "P1", startTime: "08:00", endTime: "08:45", order: 1 },
        { schoolId: sid, label: "P2", startTime: "09:00", endTime: "09:45", order: 2 },
      ],
    });

    const svc = new PeriodsService(prisma as unknown as PrismaService);
    const periods = await TenantContext.run({ schoolId: sid, userId: null }, () => svc.list());

    expect(periods.map((p) => p.order)).toEqual([1, 2, 3]);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe("PeriodsService.update", () => {
  let periodId: string;

  beforeAll(async () => {
    const p = await prisma.period.create({
      data: { schoolId: schoolAId, label: "Upd Period", startTime: "10:00", endTime: "10:45", order: 10 },
    });
    periodId = p.id;
  });

  it("changes label, times, isBreak", async () => {
    const updated = await withSchoolA((svc) =>
      svc.update(periodId, { label: "Break Time", startTime: "10:00", endTime: "10:30", isBreak: true }),
    );
    expect(updated.label).toBe("Break Time");
    expect(updated.isBreak).toBe(true);
    expect(updated.endTime).toBe("10:30");
  });

  it("throws NotFoundException for foreign period id (different school)", async () => {
    // schoolB tries to update schoolA's period
    await expect(withSchoolB((svc) => svc.update(periodId, { label: "Hack" }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe("PeriodsService.remove", () => {
  let freePeriodId: string;
  let usedPeriodId: string;

  beforeAll(async () => {
    const ts = Date.now();

    // Create a school + minimal prerequisites so we can create a TimetableEntry
    const school = await prisma.school.create({
      data: { name: "Remove School", slug: `periods-svc-test-${ts}-remove` } as never,
    });
    const sid = school.id;

    const freePeriod = await prisma.period.create({
      data: { schoolId: sid, label: "Free Period", startTime: "11:00", endTime: "11:45", order: 1 },
    });
    freePeriodId = freePeriod.id;

    const usedPeriod = await prisma.period.create({
      data: { schoolId: sid, label: "Used Period", startTime: "12:00", endTime: "12:45", order: 2 },
    });
    usedPeriodId = usedPeriod.id;

    // Seed enough to create a TimetableEntry referencing usedPeriod
    const classLevel = await prisma.classLevel.create({
      data: { schoolId: sid, name: "JSS 1", order: 1 },
    });
    const klass = await prisma.class.create({
      data: { schoolId: sid, classLevelId: classLevel.id, name: "JSS 1A" },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: sid,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    const subject = await prisma.subject.create({
      data: { schoolId: sid, name: "Maths", code: `M-${ts}` },
    });
    const staff = await prisma.staff.create({
      data: {
        schoolId: sid,
        staffNo: `ST-${ts}`,
        firstName: "Ade",
        lastName: "Ola",
        email: `ade.${ts}@school.com`,
        phone: `070${ts.toString().slice(-8)}`,
      },
    });
    const sa = await prisma.subjectAssignment.create({
      data: {
        schoolId: sid,
        subjectId: subject.id,
        classId: klass.id,
        staffId: staff.id,
        academicYearId: academicYear.id,
      },
    });
    await prisma.timetableEntry.create({
      data: {
        schoolId: sid,
        academicYearId: academicYear.id,
        classId: klass.id,
        dayOfWeek: 1,
        periodId: usedPeriodId,
        subjectAssignmentId: sa.id,
      },
    });

    // Store sid so we can run service in that tenant context
    // We'll use a closure variable
    (freePeriod as any)._schoolId = sid;
    (usedPeriod as any)._schoolId = sid;
  });

  it("throws BadRequestException when period is referenced by a TimetableEntry", async () => {
    // Look up the school for usedPeriodId
    const p = await prisma.period.findFirst({ where: { id: usedPeriodId } });
    const sid = p!.schoolId;

    const svc = new PeriodsService(prisma as unknown as PrismaService);
    await expect(
      TenantContext.run({ schoolId: sid, userId: null }, () => svc.remove(usedPeriodId)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes an unreferenced period successfully", async () => {
    const p = await prisma.period.findFirst({ where: { id: freePeriodId } });
    const sid = p!.schoolId;

    const svc = new PeriodsService(prisma as unknown as PrismaService);
    await TenantContext.run({ schoolId: sid, userId: null }, () => svc.remove(freePeriodId));

    const gone = await prisma.period.findFirst({ where: { id: freePeriodId } });
    expect(gone).toBeNull();
  });

  it("throws NotFoundException for foreign period id (different school)", async () => {
    // schoolB tries to remove schoolA's period (periodId from the update describe block)
    // We'll use schoolAId's first period from the create tests
    const aPeriod = await prisma.period.findFirst({ where: { schoolId: schoolAId } });
    expect(aPeriod).not.toBeNull();

    await expect(
      withSchoolB((svc) => svc.remove(aPeriod!.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
