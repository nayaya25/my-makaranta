import { Test, TestingModule } from "@nestjs/testing";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";

// Stub the service so we don't need DB
const mockService = {
  list: jest.fn().mockResolvedValue([]),
  createStaff: jest.fn().mockResolvedValue({ id: "app-1", applicationNo: "APP-001" }),
  getOne: jest.fn().mockResolvedValue({ id: "app-1" }),
  patch: jest.fn().mockResolvedValue({ id: "app-1" }),
  transition: jest.fn().mockResolvedValue({ id: "app-1", status: "REVIEWED" }),
  enroll: jest.fn().mockResolvedValue({ studentId: "stu-1", admissionNo: "ADM-001" }),
  stats: jest.fn().mockResolvedValue({ APPLIED: 3, ACCEPTED: 1 }),
};

// Bypass auth guards in unit tests
const noGuard = { canActivate: () => true };

describe("AdmissionsController", () => {
  let controller: AdmissionsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdmissionsController],
      providers: [{ provide: AdmissionsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(noGuard)
      .overrideGuard(PermissionGuard)
      .useValue(noGuard)
      .compile();

    controller = module.get<AdmissionsController>(AdmissionsController);
  });

  it("GET /applicants delegates to service.list", async () => {
    const result = await controller.list({});
    expect(mockService.list).toHaveBeenCalledWith({});
    expect(result).toEqual([]);
  });

  it("POST /applicants delegates to service.createStaff", async () => {
    const dto = {
      firstName: "Amina",
      lastName: "Yusuf",
      gender: "FEMALE" as const,
      dateOfBirth: "2010-01-01",
      desiredClassLevelId: "cl-1",
      academicYearId: "ay-1",
      guardianName: "Musa Yusuf",
      guardianPhone: "08012345678",
      guardianRelation: "FATHER" as const,
    };
    const result = await controller.create(dto as any);
    expect(mockService.createStaff).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: "app-1", applicationNo: "APP-001" });
  });

  it("GET /applicants/:id delegates to service.getOne", async () => {
    const result = await controller.getOne("app-1");
    expect(mockService.getOne).toHaveBeenCalledWith("app-1");
    expect(result).toEqual({ id: "app-1" });
  });

  it("PATCH /applicants/:id delegates to service.patch", async () => {
    const dto = { firstName: "Fatima" };
    const result = await controller.patch("app-1", dto as any);
    expect(mockService.patch).toHaveBeenCalledWith("app-1", dto);
    expect(result).toEqual({ id: "app-1" });
  });

  it("POST /applicants/:id/transition delegates to service.transition with actorId", async () => {
    const dto = { to: "REVIEWED" as const };
    // TenantContext.current() returns null in unit tests — controller falls back to "system"
    const result = await controller.transition("app-1", dto as any);
    expect(mockService.transition).toHaveBeenCalledWith("app-1", dto, expect.any(String));
    expect(result).toEqual({ id: "app-1", status: "REVIEWED" });
  });

  it("POST /applicants/:id/enroll delegates to service.enroll", async () => {
    const dto = { classId: "cls-1", termId: "trm-1" };
    const result = await controller.enroll("app-1", dto as any);
    expect(mockService.enroll).toHaveBeenCalledWith("app-1", dto);
    expect(result).toEqual({ studentId: "stu-1", admissionNo: "ADM-001" });
  });

  it("GET /stats delegates to service.stats", async () => {
    const result = await controller.stats();
    expect(mockService.stats).toHaveBeenCalled();
    expect(result).toEqual({ APPLIED: 3, ACCEPTED: 1 });
  });
});

describe("admissions.manage permission in seed-roles presets", () => {
  it("principal and ict_admin presets include admissions.manage", () => {
    // Inline assertion: these arrays are maintained manually in seed-roles.ts.
    // This test documents the expectation so any future removal fails fast.
    // We read the source file text to avoid importing from apps/api/prisma (build boundary).
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const seedRolesPath = path.resolve(
      __dirname,
      "../../../prisma/seed-roles.ts",
    );
    const src = fs.readFileSync(seedRolesPath, "utf8");
    // Verify both presets have "admissions.manage" in the GRANTS constant
    // We check the raw source to detect accidental removal.
    expect(src).toContain('"admissions.manage"');
    // More precise: count occurrences — must appear at least twice (principal + ict_admin)
    const matches = src.match(/"admissions\.manage"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
