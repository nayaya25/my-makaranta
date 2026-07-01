/**
 * Task 6 — AdmissionsService public methods (createPublic + publicMeta)
 *
 * Covers:
 *   createPublic: valid slug + level/year → APPLIED, source=PUBLIC, returns applicationNo
 *   createPublic: level/year from different school → NotFoundException
 *   createPublic: unknown slug → NotFoundException
 *   publicMeta: returns only that school's classLevels and academicYears (not another school's)
 */

import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AdmissionsService } from "./admissions.service";

const prisma = new PrismaClient();

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "pub-adm-test-" } },
    select: { id: true },
  });
  const ids = testSchools.map((s) => s.id);

  await prisma.applicant.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.school.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("AdmissionsService — public methods", () => {
  let service: AdmissionsService;

  let schoolSlug: string;
  let schoolId: string;
  let classLevelId: string;
  let academicYearId: string;

  let otherSchoolSlug: string;
  let otherSchoolId: string;
  let otherClassLevelId: string;
  let otherAcademicYearId: string;

  beforeAll(async () => {
    const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    schoolSlug = `pub-adm-test-${ts}`;
    otherSchoolSlug = `pub-adm-test-${ts}-other`;

    const school = await prisma.school.create({
      data: { name: `Pub Adm School ${ts}`, slug: schoolSlug } as never,
    });
    schoolId = school.id;

    const otherSchool = await prisma.school.create({
      data: { name: `Pub Adm Other ${ts}`, slug: otherSchoolSlug } as never,
    });
    otherSchoolId = otherSchool.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: "JSS 1", order: 1 },
    });
    classLevelId = level.id;

    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `${ts}/2027`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    academicYearId = year.id;

    // Other school fixtures
    const otherLevel = await prisma.classLevel.create({
      data: { schoolId: otherSchoolId, name: "SS 1", order: 1 },
    });
    otherClassLevelId = otherLevel.id;

    const otherYear = await prisma.academicYear.create({
      data: {
        schoolId: otherSchoolId,
        name: `Other ${ts}/2027`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    otherAcademicYearId = otherYear.id;

    service = new AdmissionsService(prisma as unknown as PrismaService);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // createPublic
  // ─────────────────────────────────────────────────────────────────────────

  describe("createPublic", () => {
    it("creates an APPLIED/PUBLIC applicant and returns applicationNo", async () => {
      const result = await service.createPublic({
        schoolSlug,
        firstName: "Fatima",
        lastName: "Usman",
        gender: "FEMALE",
        dateOfBirth: "2015-03-15",
        desiredClassLevelId: classLevelId,
        academicYearId,
        guardianName: "Usman Ibrahim",
        guardianPhone: "08050000001",
        guardianRelation: "FATHER",
      });

      expect(result).toHaveProperty("applicationNo");
      expect(result.applicationNo).toMatch(/^APP-\d{4}-\d{4}$/);

      // Verify in DB
      const applicant = await prisma.applicant.findFirst({
        where: { applicationNo: result.applicationNo },
      });
      expect(applicant).not.toBeNull();
      expect(applicant!.status).toBe("APPLIED");
      expect(applicant!.source).toBe("PUBLIC");
      expect(applicant!.schoolId).toBe(schoolId);
    });

    it("throws NotFoundException when desiredClassLevelId belongs to another school", async () => {
      await expect(
        service.createPublic({
          schoolSlug,
          firstName: "Test",
          lastName: "Foreign",
          gender: "MALE",
          dateOfBirth: "2016-01-01",
          desiredClassLevelId: otherClassLevelId, // from different school
          academicYearId,
          guardianName: "Guardian",
          guardianPhone: "08050000002",
          guardianRelation: "MOTHER",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when academicYearId belongs to another school", async () => {
      await expect(
        service.createPublic({
          schoolSlug,
          firstName: "Test",
          lastName: "Foreign",
          gender: "MALE",
          dateOfBirth: "2016-01-01",
          desiredClassLevelId: classLevelId,
          academicYearId: otherAcademicYearId, // from different school
          guardianName: "Guardian",
          guardianPhone: "08050000003",
          guardianRelation: "MOTHER",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException for unknown schoolSlug", async () => {
      await expect(
        service.createPublic({
          schoolSlug: "slug-that-does-not-exist-xyz123",
          firstName: "Test",
          lastName: "Nobody",
          gender: "MALE",
          dateOfBirth: "2016-01-01",
          desiredClassLevelId: classLevelId,
          academicYearId,
          guardianName: "Guardian",
          guardianPhone: "08050000004",
          guardianRelation: "GUARDIAN",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // publicMeta
  // ─────────────────────────────────────────────────────────────────────────

  describe("publicMeta", () => {
    it("returns schoolName, classLevels and academicYears scoped to that school only", async () => {
      const meta = await service.publicMeta(schoolSlug);

      expect(meta.schoolName).toBeTruthy();

      // School's own level/year are present
      expect(meta.classLevels.some((l) => l.id === classLevelId)).toBe(true);
      expect(meta.academicYears.some((y) => y.id === academicYearId)).toBe(true);

      // Other school's level/year are NOT present
      expect(meta.classLevels.some((l) => l.id === otherClassLevelId)).toBe(false);
      expect(meta.academicYears.some((y) => y.id === otherAcademicYearId)).toBe(false);
    });

    it("throws NotFoundException for unknown slug", async () => {
      await expect(service.publicMeta("no-such-school-slug-abc")).rejects.toThrow(NotFoundException);
    });
  });
});
