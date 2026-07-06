/**
 * MF-2 Task 3 — InstallmentScheduleService: schedule get/set
 *
 * Tests:
 *   1. setSchedule validates classLevelId+termId belong to school (foreign -> NotFound)
 *   2. setSchedule rejects percentBps outside 1-10000
 *   3. setSchedule rejects non-empty rows whose Σ percentBps !== 10000 (9000, 11000)
 *   4. setSchedule accepts Σ === 10000, replaces existing rows (delete-all + recreate, no dupes)
 *   5. setSchedule with [] clears the schedule
 *   6. getSchedule returns ordered rows scoped to school
 *   7. getSchedule / setSchedule IDOR: foreign classLevelId/termId -> NotFound
 *   8. tenant scoping: cross-school schedules do not leak
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { InstallmentScheduleService } from "./installment-schedule.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("InstallmentScheduleService", () => {
  let service: InstallmentScheduleService;
  let schoolId: string;
  let otherSchoolId: string;
  let classLevelId: string;
  let termId: string;
  let otherClassLevelId: string;
  let otherTermId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `SchedSvc-${ts}`, slug: `sched-svc-${ts}` } as never,
    });
    schoolId = school.id;

    const otherSchool = await prisma.school.create({
      data: { name: `SchedSvcOther-${ts}`, slug: `sched-svc-other-${ts}` } as never,
    });
    otherSchoolId = otherSchool.id;

    const classLevel = await prisma.classLevel.create({
      data: { schoolId, name: "JSS 1", order: 1 },
    });
    classLevelId = classLevel.id;

    const academicYear = await prisma.academicYear.create({
      data: { schoolId, name: `${ts}/2026`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
    });

    const term = await prisma.term.create({
      data: { schoolId, academicYearId: academicYear.id, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    });
    termId = term.id;

    const otherClassLevel = await prisma.classLevel.create({
      data: { schoolId: otherSchoolId, name: "JSS 1", order: 1 },
    });
    otherClassLevelId = otherClassLevel.id;

    const otherAcademicYear = await prisma.academicYear.create({
      data: { schoolId: otherSchoolId, name: `${ts}/2026`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
    });

    const otherTerm = await prisma.term.create({
      data: { schoolId: otherSchoolId, academicYearId: otherAcademicYear.id, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    });
    otherTermId = otherTerm.id;

    service = new InstallmentScheduleService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.scheduleInstallment.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.classLevel.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolId, otherSchoolId] } } });
  });

  const asSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId: null }, fn);
  const asOtherSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: otherSchoolId, userId: null }, fn);

  // ────────────────────────────────────────────────────────────────────────
  // setSchedule — foreign level/term
  // ────────────────────────────────────────────────────────────────────────

  it("setSchedule rejects a foreign classLevelId -> NotFound", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(otherClassLevelId, termId, [
          { order: 1, percentBps: 10000, dueDate: "2026-10-01" },
        ]),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("setSchedule rejects a foreign termId -> NotFound", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(classLevelId, otherTermId, [
          { order: 1, percentBps: 10000, dueDate: "2026-10-01" },
        ]),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // setSchedule — percentBps range
  // ────────────────────────────────────────────────────────────────────────

  it("setSchedule rejects percentBps < 1", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(classLevelId, termId, [
          { order: 1, percentBps: 0, dueDate: "2026-10-01" },
        ]),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("setSchedule rejects percentBps > 10000", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(classLevelId, termId, [
          { order: 1, percentBps: 10001, dueDate: "2026-10-01" },
        ]),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // setSchedule — Σ percentBps === 10000
  // ────────────────────────────────────────────────────────────────────────

  it("setSchedule rejects rows summing to 9000 (under 100%)", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(classLevelId, termId, [
          { order: 1, percentBps: 5000, dueDate: "2026-10-01" },
          { order: 2, percentBps: 4000, dueDate: "2026-11-01" },
        ]),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("setSchedule rejects rows summing to 11000 (over 100%)", async () => {
    await expect(
      asSchool(() =>
        service.setSchedule(classLevelId, termId, [
          { order: 1, percentBps: 6000, dueDate: "2026-10-01" },
          { order: 2, percentBps: 5000, dueDate: "2026-11-01" },
        ]),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // setSchedule — happy path + replace + clear
  // ────────────────────────────────────────────────────────────────────────

  it("setSchedule accepts rows summing to exactly 10000 and returns saved rows", async () => {
    const rows = await asSchool(() =>
      service.setSchedule(classLevelId, termId, [
        { order: 1, label: "First", percentBps: 5000, dueDate: "2026-10-01" },
        { order: 2, label: "Second", percentBps: 2500, dueDate: "2026-11-01" },
        { order: 3, label: "Third", percentBps: 2500, dueDate: "2026-12-01" },
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3]);
    expect(rows.reduce((s, r) => s + r.percentBps, 0)).toBe(10000);
  });

  it("getSchedule returns ordered rows scoped to school", async () => {
    const rows = await asSchool(() => service.getSchedule(classLevelId, termId));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3]);
    expect(rows[0]!.label).toBe("First");
    expect(rows.every((r) => r.schoolId === schoolId)).toBe(true);
  });

  it("setSchedule replaces existing rows without dupes (delete-all + recreate)", async () => {
    const rows = await asSchool(() =>
      service.setSchedule(classLevelId, termId, [
        { order: 1, label: "Only", percentBps: 10000, dueDate: "2026-12-31" },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Only");

    const fetched = await asSchool(() => service.getSchedule(classLevelId, termId));
    expect(fetched).toHaveLength(1);
  });

  it("setSchedule with an empty array clears the schedule", async () => {
    const rows = await asSchool(() => service.setSchedule(classLevelId, termId, []));
    expect(rows).toHaveLength(0);

    const fetched = await asSchool(() => service.getSchedule(classLevelId, termId));
    expect(fetched).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // getSchedule — IDOR + tenant scoping
  // ────────────────────────────────────────────────────────────────────────

  it("getSchedule rejects a foreign classLevelId -> NotFound", async () => {
    await expect(asSchool(() => service.getSchedule(otherClassLevelId, termId))).rejects.toThrow(NotFoundException);
  });

  it("getSchedule rejects a foreign termId -> NotFound", async () => {
    await expect(asSchool(() => service.getSchedule(classLevelId, otherTermId))).rejects.toThrow(NotFoundException);
  });

  it("does not leak schedules across tenants", async () => {
    await asOtherSchool(() =>
      service.setSchedule(otherClassLevelId, otherTermId, [
        { order: 1, percentBps: 10000, dueDate: "2026-10-01" },
      ]),
    );

    const mine = await asSchool(() => service.getSchedule(classLevelId, termId));
    expect(mine).toHaveLength(0);

    const theirs = await asOtherSchool(() => service.getSchedule(otherClassLevelId, otherTermId));
    expect(theirs).toHaveLength(1);
    expect(theirs.every((r) => r.schoolId === otherSchoolId)).toBe(true);
  });
});
