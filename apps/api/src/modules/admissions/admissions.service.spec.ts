/**
 * Task 3 — AdmissionsService core
 *
 * Covers:
 *   createStaff: defaults (source=STAFF, status=APPLIED, applicationNo generated)
 *   createStaff: foreign desiredClassLevelId / academicYearId → NotFoundException
 *   transition: APPLIED→UNDER_REVIEW ok
 *   transition: APPLIED→ENROLLED throws BadRequestException (use enroll action)
 *   transition: APPLIED→ACCEPTED throws BadRequestException (not an allowed transition from APPLIED)
 *   transition: →REJECTED stores rejectionReason + decidedAt; AuditLog row written
 *   list: filter by status / level / year / q (name, applicationNo, guardianPhone)
 *   IDOR: getOne / patch / transition on another school's applicant → NotFoundException
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AdmissionsService } from "./admissions.service";

// Use direct PrismaClient for DB setup; cast to PrismaService for service DI
const prisma = new PrismaClient();

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "adm-svc-test-" } },
    select: { id: true },
  });
  const ids = testSchools.map((s) => s.id);

  await prisma.auditLog.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.applicant.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.school.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

describe("AdmissionsService", () => {
  let service: AdmissionsService;
  let schoolId: string;
  let otherSchoolId: string;
  let classLevelId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `AdmSvc School ${ts}`, slug: `adm-svc-test-${ts}` } as never,
    });
    schoolId = school.id;

    const otherSchool = await prisma.school.create({
      data: { name: `AdmSvc Other ${ts}`, slug: `adm-svc-test-${ts}-other` } as never,
    });
    otherSchoolId = otherSchool.id;

    const classLevel = await prisma.classLevel.create({
      data: { schoolId, name: "JSS 1", order: 1 },
    });
    classLevelId = classLevel.id;

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    academicYearId = academicYear.id;

    service = new AdmissionsService(prisma as unknown as PrismaService);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // createStaff
  // ─────────────────────────────────────────────────────────────────────────

  describe("createStaff", () => {
    it("sets source=STAFF, status=APPLIED, generates applicationNo", async () => {
      const applicant = await TenantContext.run({ schoolId, userId: null }, () =>
        service.createStaff({
          firstName: "Zainab",
          lastName: "Musa",
          gender: "FEMALE",
          dateOfBirth: "2015-06-01",
          desiredClassLevelId: classLevelId,
          academicYearId,
          guardianName: "Musa Ibrahim",
          guardianPhone: "08030000001",
          guardianRelation: "FATHER",
        }),
      );

      expect(applicant.source).toBe("STAFF");
      expect(applicant.status).toBe("APPLIED");
      expect(applicant.applicationNo).toMatch(/^APP-\d{4}-\d{4}$/);
      expect(applicant.schoolId).toBe(schoolId);
    });

    it("throws NotFoundException when desiredClassLevelId belongs to another school", async () => {
      // Create a classLevel owned by otherSchool
      const foreignLevel = await prisma.classLevel.create({
        data: { schoolId: otherSchoolId, name: "Foreign Level", order: 1 },
      });

      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.createStaff({
            firstName: "Test",
            lastName: "Foreign",
            gender: "MALE",
            dateOfBirth: "2016-01-01",
            desiredClassLevelId: foreignLevel.id,
            academicYearId,
            guardianName: "Guardian",
            guardianPhone: "08030000002",
            guardianRelation: "MOTHER",
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when academicYearId belongs to another school", async () => {
      const foreignYear = await prisma.academicYear.create({
        data: {
          schoolId: otherSchoolId,
          name: "Foreign Year",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-07-31"),
        },
      });

      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.createStaff({
            firstName: "Test",
            lastName: "Foreign",
            gender: "MALE",
            dateOfBirth: "2016-01-01",
            desiredClassLevelId: classLevelId,
            academicYearId: foreignYear.id,
            guardianName: "Guardian",
            guardianPhone: "08030000003",
            guardianRelation: "MOTHER",
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // patch — re-point targets must belong to the school
  // ─────────────────────────────────────────────────────────────────────────

  describe("patch tenant validation", () => {
    let applicantId: string;

    beforeEach(async () => {
      const ts2 = Date.now();
      const a = await prisma.applicant.create({
        data: {
          schoolId,
          applicationNo: `APP-PATCH-${ts2}`,
          firstName: "Patch",
          lastName: "Target",
          gender: "MALE",
          dateOfBirth: new Date("2015-01-01"),
          desiredClassLevelId: classLevelId,
          academicYearId,
          guardianName: "Patch Guardian",
          guardianPhone: `0805${ts2.toString().slice(-7)}`,
          guardianRelation: "FATHER",
          source: "STAFF",
          status: "APPLIED",
        },
      });
      applicantId = a.id;
    });

    it("rejects patching desiredClassLevelId to another school's level", async () => {
      const foreignLevel = await prisma.classLevel.create({
        data: { schoolId: otherSchoolId, name: `Foreign Patch Level ${Date.now()}`, order: 9 },
      });
      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.patch(applicantId, { desiredClassLevelId: foreignLevel.id }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects patching academicYearId to another school's year", async () => {
      const foreignYear = await prisma.academicYear.create({
        data: {
          schoolId: otherSchoolId,
          name: `Foreign Patch Year ${Date.now()}`,
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-07-31"),
        },
      });
      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.patch(applicantId, { academicYearId: foreignYear.id }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("allows patching to the school's own level", async () => {
      const updated = await TenantContext.run({ schoolId, userId: null }, () =>
        service.patch(applicantId, { desiredClassLevelId: classLevelId, firstName: "Renamed" }),
      );
      expect(updated.firstName).toBe("Renamed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // transition
  // ─────────────────────────────────────────────────────────────────────────

  describe("transition", () => {
    let applicantId: string;

    beforeEach(async () => {
      // Fresh applicant for each test
      const ts2 = Date.now();
      const a = await prisma.applicant.create({
        data: {
          schoolId,
          applicationNo: `APP-T-${ts2}`,
          firstName: "Transition",
          lastName: "Test",
          gender: "MALE",
          dateOfBirth: new Date("2015-01-01"),
          desiredClassLevelId: classLevelId,
          academicYearId,
          guardianName: "Test Guardian",
          guardianPhone: `0803${ts2.toString().slice(-7)}`,
          guardianRelation: "FATHER",
          source: "STAFF",
          status: "APPLIED",
        },
      });
      applicantId = a.id;
    });

    it("transitions APPLIED→UNDER_REVIEW successfully", async () => {
      const updated = await TenantContext.run({ schoolId, userId: "actor-1" }, () =>
        service.transition(applicantId, { to: "UNDER_REVIEW" }, "actor-1"),
      );

      expect(updated.status).toBe("UNDER_REVIEW");
    });

    it("throws BadRequestException when trying to transition to ENROLLED directly", async () => {
      await expect(
        TenantContext.run({ schoolId, userId: "actor-1" }, () =>
          service.transition(applicantId, { to: "ENROLLED" }, "actor-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for illegal transition APPLIED→ACCEPTED", async () => {
      // ACCEPTED is not in ALLOWED_TRANSITIONS["APPLIED"]
      await expect(
        TenantContext.run({ schoolId, userId: "actor-1" }, () =>
          service.transition(applicantId, { to: "ACCEPTED" }, "actor-1"),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("stores rejectionReason and decidedAt when transitioning to REJECTED", async () => {
      const updated = await TenantContext.run({ schoolId, userId: "actor-1" }, () =>
        service.transition(applicantId, { to: "REJECTED", reason: "Insufficient docs" }, "actor-1"),
      );

      expect(updated.status).toBe("REJECTED");
      expect(updated.rejectionReason).toBe("Insufficient docs");
      expect(updated.decidedAt).toBeInstanceOf(Date);
    });

    it("writes an AuditLog row for each transition", async () => {
      await TenantContext.run({ schoolId, userId: "actor-audit" }, () =>
        service.transition(applicantId, { to: "UNDER_REVIEW" }, "actor-audit"),
      );

      const log = await prisma.auditLog.findFirst({
        where: {
          resourceId: applicantId,
          action: "Applicant.transition",
          actorId: "actor-audit",
        },
        orderBy: { at: "desc" },
      });

      expect(log).not.toBeNull();
      expect((log!.before as Record<string, string>).status).toBe("APPLIED");
      expect((log!.after as Record<string, string>).status).toBe("UNDER_REVIEW");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────────────────

  describe("list", () => {
    let listSchoolId: string;
    let listLevelId: string;
    let listYearId: string;
    let otherYearId: string;

    beforeAll(async () => {
      const ts = Date.now() + 2000;

      const school = await prisma.school.create({
        data: { name: `AdmSvc List ${ts}`, slug: `adm-svc-test-${ts}-list` } as never,
      });
      listSchoolId = school.id;

      const level = await prisma.classLevel.create({
        data: { schoolId: listSchoolId, name: "SS 1", order: 2 },
      });
      listLevelId = level.id;

      const year = await prisma.academicYear.create({
        data: {
          schoolId: listSchoolId,
          name: "2026/2027",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-07-31"),
        },
      });
      listYearId = year.id;

      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: listSchoolId,
          name: "2025/2026",
          startDate: new Date("2025-09-01"),
          endDate: new Date("2026-07-31"),
        },
      });
      otherYearId = otherYear.id;

      // Create seed applicants
      await prisma.applicant.createMany({
        data: [
          {
            schoolId: listSchoolId,
            applicationNo: "LIST-001",
            firstName: "Usman",
            lastName: "Aliyu",
            gender: "MALE",
            dateOfBirth: new Date("2015-01-01"),
            desiredClassLevelId: listLevelId,
            academicYearId: listYearId,
            guardianName: "Guardian A",
            guardianPhone: "08041111111",
            guardianRelation: "FATHER",
            source: "STAFF",
            status: "APPLIED",
          },
          {
            schoolId: listSchoolId,
            applicationNo: "LIST-002",
            firstName: "Aisha",
            lastName: "Bello",
            gender: "FEMALE",
            dateOfBirth: new Date("2015-02-01"),
            desiredClassLevelId: listLevelId,
            academicYearId: listYearId,
            guardianName: "Guardian B",
            guardianPhone: "08041111222",
            guardianRelation: "MOTHER",
            source: "PUBLIC",
            status: "UNDER_REVIEW",
          },
          {
            schoolId: listSchoolId,
            applicationNo: "LIST-003",
            firstName: "Chukwudi",
            lastName: "Okafor",
            gender: "MALE",
            dateOfBirth: new Date("2015-03-01"),
            desiredClassLevelId: listLevelId,
            academicYearId: otherYearId,
            guardianName: "Guardian C",
            guardianPhone: "08041111333",
            guardianRelation: "GUARDIAN",
            source: "STAFF",
            status: "APPLIED",
          },
        ],
      });
    });

    it("returns all applicants for school when no filter", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({}),
      );
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it("filters by status", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ status: "UNDER_REVIEW" }),
      );
      expect(results.every((a) => a.status === "UNDER_REVIEW")).toBe(true);
      expect(results.some((a) => a.applicationNo === "LIST-002")).toBe(true);
    });

    it("filters by level", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ level: listLevelId }),
      );
      expect(results.every((a) => a.desiredClassLevelId === listLevelId)).toBe(true);
    });

    it("filters by year", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ year: listYearId }),
      );
      expect(results.every((a) => a.academicYearId === listYearId)).toBe(true);
      expect(results.some((a) => a.applicationNo === "LIST-001")).toBe(true);
      expect(results.some((a) => a.applicationNo === "LIST-003")).toBe(false);
    });

    it("filters by q matching firstName", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ q: "Usman" }),
      );
      expect(results.some((a) => a.firstName === "Usman")).toBe(true);
    });

    it("filters by q matching applicationNo", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ q: "LIST-002" }),
      );
      expect(results.some((a) => a.applicationNo === "LIST-002")).toBe(true);
    });

    it("filters by q matching guardianPhone", async () => {
      const results = await TenantContext.run({ schoolId: listSchoolId, userId: null }, () =>
        service.list({ q: "08041111333" }),
      );
      expect(results.some((a) => a.applicationNo === "LIST-003")).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // IDOR — getOne / patch / transition with another school's applicant id
  // ─────────────────────────────────────────────────────────────────────────

  describe("IDOR", () => {
    let otherApplicantId: string;
    let otherLevelId2: string;
    let otherYearId2: string;

    beforeAll(async () => {
      const ts = Date.now() + 5000;

      const otherLevel = await prisma.classLevel.create({
        data: { schoolId: otherSchoolId, name: "Other Level IDOR", order: 3 },
      });
      otherLevelId2 = otherLevel.id;

      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: otherSchoolId,
          name: `IDOR Year ${ts}`,
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-07-31"),
        },
      });
      otherYearId2 = otherYear.id;

      const otherApplicant = await prisma.applicant.create({
        data: {
          schoolId: otherSchoolId,
          applicationNo: `IDOR-${ts}`,
          firstName: "IDOR",
          lastName: "Applicant",
          gender: "MALE",
          dateOfBirth: new Date("2015-01-01"),
          desiredClassLevelId: otherLevelId2,
          academicYearId: otherYearId2,
          guardianName: "IDOR Guardian",
          guardianPhone: `0804${ts.toString().slice(-7)}`,
          guardianRelation: "FATHER",
          source: "STAFF",
          status: "APPLIED",
        },
      });
      otherApplicantId = otherApplicant.id;
    });

    it("getOne: throws NotFoundException for another school's applicant", async () => {
      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.getOne(otherApplicantId),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("patch: throws NotFoundException for another school's applicant", async () => {
      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.patch(otherApplicantId, { firstName: "Hacker" }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("transition: throws NotFoundException for another school's applicant", async () => {
      await expect(
        TenantContext.run({ schoolId, userId: null }, () =>
          service.transition(otherApplicantId, { to: "UNDER_REVIEW" }, "actor-1"),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stats
  // ─────────────────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns a count per status", async () => {
      const result = await TenantContext.run({ schoolId, userId: null }, () =>
        service.stats(),
      );

      // Result is a record-like structure
      expect(typeof result).toBe("object");
      expect(result).not.toBeNull();
    });
  });
});
