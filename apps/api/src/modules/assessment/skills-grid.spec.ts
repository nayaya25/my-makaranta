import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SkillsService } from "./skills.service";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("SkillsService – skills grid + bulk ratings", () => {
  let service: SkillsService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let studentId1: string;
  let studentId2: string;
  const recordedBy = "test-user-id";

  beforeAll(async () => {
    const ts = Date.now();

    // School
    const school = await prisma.school.create({
      data: { name: `GridTest-${ts}`, slug: `grid-${ts}`, skillScaleMax: 5 } as never,
    });
    schoolId = school.id;

    // Seed skill defaults (2 domains, 5-point scale)
    await seedSkillDefaults(prisma, schoolId);

    // Academic year + term
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2024/2025", startDate: new Date(), endDate: new Date() },
    });
    const term = await prisma.term.create({
      data: { schoolId, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() },
    });
    termId = term.id;

    // Class level + class
    const level = await prisma.classLevel.create({ data: { schoolId, name: "JSS1", order: 0 } });
    const klass = await prisma.class.create({ data: { schoolId, name: "JSS 1A", classLevelId: level.id } });
    classId = klass.id;

    // 2 students enrolled
    const s1 = await prisma.student.create({
      data: { schoolId, admissionNo: `A1-${ts}`, firstName: "Alice", lastName: "Wonder", gender: "FEMALE", dateOfBirth: new Date("2010-01-01") },
    });
    const s2 = await prisma.student.create({
      data: { schoolId, admissionNo: `B1-${ts}`, firstName: "Bob", lastName: "Builder", gender: "MALE", dateOfBirth: new Date("2010-06-15") },
    });
    studentId1 = s1.id;
    studentId2 = s2.id;

    await prisma.enrollment.createMany({
      data: [
        { studentId: studentId1, classId, termId },
        { studentId: studentId2, classId, termId },
      ],
    });

    service = new SkillsService(prisma as unknown as PrismaService);
  });

  it("getGrid returns locked:false, scale, domains, students, ratings (empty) when no release", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGrid(classId, termId),
    );

    expect(result.locked).toBe(false);
    expect(result.scale.length).toBeGreaterThan(0);
    expect(result.scale[0]).toMatchObject({ value: expect.any(Number), label: expect.any(String) });

    expect(result.domains.length).toBeGreaterThanOrEqual(2);
    expect(result.domains[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), items: expect.any(Array) });
    expect(result.domains[0]!.items[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });

    expect(result.students).toHaveLength(2);
    expect(result.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: studentId1, name: "Alice Wonder" }),
        expect.objectContaining({ studentId: studentId2, name: "Bob Builder" }),
      ]),
    );

    expect(result.ratings).toEqual([]);
  });

  it("saveRatings upserts ratings; re-save updates value (no duplicates)", async () => {
    const domains = await prisma.skillDomain.findMany({
      where: { schoolId },
      include: { items: true },
      orderBy: { order: "asc" },
    });
    const skillItemId = domains[0]!.items[0]!.id;

    // First save
    const r1 = await TenantContext.run({ schoolId, userId: null }, () =>
      service.saveRatings(
        { classId, termId, ratings: [{ studentId: studentId1, skillItemId, value: 4 }] },
        recordedBy,
      ),
    );
    expect(r1).toEqual({ saved: 1 });

    // Verify upserted
    const first = await prisma.skillRating.findUnique({
      where: { studentId_termId_skillItemId: { studentId: studentId1, termId, skillItemId } },
    });
    expect(first?.value).toBe(4);

    // Re-save with updated value
    const r2 = await TenantContext.run({ schoolId, userId: null }, () =>
      service.saveRatings(
        { classId, termId, ratings: [{ studentId: studentId1, skillItemId, value: 3 }] },
        recordedBy,
      ),
    );
    expect(r2).toEqual({ saved: 1 });

    // Value updated, no duplicate rows
    const all = await prisma.skillRating.findMany({
      where: { studentId: studentId1, termId, skillItemId },
    });
    expect(all).toHaveLength(1);
    expect(all[0]!.value).toBe(3);
  });

  it("saveRatings with value > skillScaleMax (5) → BadRequestException", async () => {
    const domains = await prisma.skillDomain.findMany({
      where: { schoolId },
      include: { items: true },
      orderBy: { order: "asc" },
    });
    const skillItemId = domains[0]!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, ratings: [{ studentId: studentId1, skillItemId, value: 6 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("saveRatings with value < 1 → BadRequestException", async () => {
    const domains = await prisma.skillDomain.findMany({
      where: { schoolId },
      include: { items: true },
      orderBy: { order: "asc" },
    });
    const skillItemId = domains[0]!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, ratings: [{ studentId: studentId1, skillItemId, value: 0 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("saveRatings after Release created → ForbiddenException", async () => {
    // Create a release for a different class/term so the main class is still usable for other tests
    const level2 = await prisma.classLevel.create({ data: { schoolId, name: "JSS2", order: 1 } });
    const klass2 = await prisma.class.create({ data: { schoolId, name: "JSS 2A", classLevelId: level2.id } });
    const year2 = await prisma.academicYear.create({ data: { schoolId, name: "2025/2026", startDate: new Date(), endDate: new Date() } });
    const term2 = await prisma.term.create({ data: { schoolId, academicYearId: year2.id, number: 1, startDate: new Date(), endDate: new Date() } });

    const person = await prisma.person.create({ data: {} });
    await prisma.release.create({ data: { schoolId, classId: klass2.id, termId: term2.id, releasedBy: person.id } });

    const domains = await prisma.skillDomain.findMany({ where: { schoolId }, include: { items: true } });
    const skillItemId = domains[0]!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId: klass2.id, termId: term2.id, ratings: [{ studentId: studentId1, skillItemId, value: 3 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("saveRatings with a classId from a different school throws NotFoundException", async () => {
    // Create a second school and class
    const ts2 = Date.now();
    const school2 = await prisma.school.create({ data: { name: `OtherSchool-${ts2}`, slug: `other-${ts2}` } as never });
    const level2b = await prisma.classLevel.create({ data: { schoolId: school2.id, name: "JSS1", order: 0 } });
    const class2 = await prisma.class.create({ data: { schoolId: school2.id, name: "Other Class", classLevelId: level2b.id } });

    // TenantContext still pointing to school1 (schoolId)
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings({ classId: class2.id, termId, ratings: [] }, recordedBy),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("saveRatings with unenrolled studentId → ForbiddenException (IDOR)", async () => {
    const domains = await prisma.skillDomain.findMany({
      where: { schoolId },
      include: { items: true },
      orderBy: { order: "asc" },
    });
    const skillItemId = domains[0]!.items[0]!.id;

    // Create a student in the same school but NOT enrolled in (classId, termId)
    const ts3 = Date.now();
    const unenrolledStudent = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `UE-${ts3}`,
        firstName: "Charlie",
        lastName: "NotEnrolled",
        gender: "MALE",
        dateOfBirth: new Date("2011-03-01"),
      },
    });

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, ratings: [{ studentId: unenrolledStudent.id, skillItemId, value: 3 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("saveRatings with skillItemId from another school → ForbiddenException (IDOR)", async () => {
    // Create a second school with its own skill items
    const ts4 = Date.now();
    const school2 = await prisma.school.create({ data: { name: `OtherSchool2-${ts4}`, slug: `other2-${ts4}` } as never });
    await seedSkillDefaults(prisma, school2.id);

    const otherDomains = await prisma.skillDomain.findMany({
      where: { schoolId: school2.id },
      include: { items: true },
    });
    const foreignSkillItemId = otherDomains[0]!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, ratings: [{ studentId: studentId1, skillItemId: foreignSkillItemId, value: 3 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("getGrid with Release created → locked: true", async () => {
    // Create release for main classId/termId
    const person = await prisma.person.create({ data: {} });
    await prisma.release.create({ data: { schoolId, classId, termId, releasedBy: person.id } });

    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGrid(classId, termId),
    );

    expect(result.locked).toBe(true);
    // Ratings saved earlier should appear
    expect(result.ratings.length).toBeGreaterThan(0);
  });
});
