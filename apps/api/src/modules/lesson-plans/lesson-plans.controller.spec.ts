import { Test, TestingModule } from "@nestjs/testing";
import { LessonPlansController } from "./lesson-plans.controller";
import { LessonPlansService } from "./lesson-plans.service";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";

// Stub the service so we don't need DB
const mockService = {
  putDraft: jest.fn().mockResolvedValue({ id: "plan-1", status: "DRAFT" }),
  getForAssignment: jest.fn().mockResolvedValue([{ id: "plan-1" }]),
  getOne: jest.fn().mockResolvedValue({ id: "plan-1" }),
  submit: jest.fn().mockResolvedValue({ id: "plan-1", status: "SUBMITTED" }),
  review: jest.fn().mockResolvedValue({ id: "plan-1", status: "APPROVED" }),
  reviewQueue: jest.fn().mockResolvedValue([{ id: "plan-1", status: "SUBMITTED" }]),
};

// Bypass auth guards in unit tests
const noGuard = { canActivate: () => true };

describe("LessonPlansController", () => {
  let controller: LessonPlansController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonPlansController],
      providers: [{ provide: LessonPlansService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(noGuard)
      .overrideGuard(PermissionGuard)
      .useValue(noGuard)
      .compile();

    controller = module.get<LessonPlansController>(LessonPlansController);
  });

  it("GET review-queue delegates to service.reviewQueue", async () => {
    const result = await controller.reviewQueue("term-1");
    expect(mockService.reviewQueue).toHaveBeenCalledWith("term-1");
    expect(result).toEqual([{ id: "plan-1", status: "SUBMITTED" }]);
  });

  it("GET review-queue with no termId delegates with undefined", async () => {
    const result = await controller.reviewQueue();
    expect(mockService.reviewQueue).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([{ id: "plan-1", status: "SUBMITTED" }]);
  });

  it("GET assignment/:assignmentId delegates to service.getForAssignment", async () => {
    const result = await controller.getForAssignment("assign-1", "term-1");
    expect(mockService.getForAssignment).toHaveBeenCalledWith("assign-1", "term-1");
    expect(result).toEqual([{ id: "plan-1" }]);
  });

  it("GET :id delegates to service.getOne", async () => {
    const result = await controller.getOne("plan-1");
    expect(mockService.getOne).toHaveBeenCalledWith("plan-1");
    expect(result).toEqual({ id: "plan-1" });
  });

  it("PUT / delegates to service.putDraft", async () => {
    const dto = {
      subjectAssignmentId: "assign-1",
      termId: "term-1",
      weekNumber: 1,
      topic: "Fractions",
    };
    const result = await controller.putDraft(dto as any);
    expect(mockService.putDraft).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: "plan-1", status: "DRAFT" });
  });

  it("POST :id/submit delegates to service.submit", async () => {
    const result = await controller.submit("plan-1");
    expect(mockService.submit).toHaveBeenCalledWith("plan-1");
    expect(result).toEqual({ id: "plan-1", status: "SUBMITTED" });
  });

  it("POST :id/review delegates to service.review", async () => {
    const dto = { decision: "APPROVED" as const };
    const result = await controller.review("plan-1", dto as any);
    expect(mockService.review).toHaveBeenCalledWith("plan-1", dto);
    expect(result).toEqual({ id: "plan-1", status: "APPROVED" });
  });
});

describe("lessonplans permissions in seed-roles presets", () => {
  it("teacher has lessonplans.record; principal and exam_officer have lessonplans.review", () => {
    // Inline assertion: these arrays are maintained manually in seed-roles.ts.
    // This test documents the expectation so any future removal fails fast.
    // We read the source file text to avoid importing from apps/api/prisma (build boundary).
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const seedRolesPath = path.resolve(__dirname, "../../../prisma/seed-roles.ts");
    const src = fs.readFileSync(seedRolesPath, "utf8");

    const teacherBlock = src.slice(src.indexOf("teacher: ["), src.indexOf("};", src.indexOf("teacher: [")));
    expect(teacherBlock).toContain('"lessonplans.record"');

    const principalBlock = src.slice(src.indexOf("principal: ["), src.indexOf("vice_principal: ["));
    expect(principalBlock).toContain('"lessonplans.review"');
    expect(principalBlock).toContain('"lessonplans.record"');

    const examOfficerBlock = src.slice(src.indexOf("exam_officer: ["), src.indexOf("teacher: ["));
    expect(examOfficerBlock).toContain('"lessonplans.review"');
  });

  it("seed.ts catalog includes lessonplans.record and lessonplans.review", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const seedPath = path.resolve(__dirname, "../../../prisma/seed.ts");
    const src = fs.readFileSync(seedPath, "utf8");
    expect(src).toContain('"lessonplans.record"');
    expect(src).toContain('"lessonplans.review"');
  });
});
