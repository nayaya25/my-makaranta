import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ReportCardConfigService } from "./report-card-config.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("ReportCardConfigService – get-or-create + update", () => {
  let service: ReportCardConfigService;
  let schoolId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `RCCTest-${ts}`, slug: `rcc-${ts}` } as never,
    });
    schoolId = school.id;

    service = new ReportCardConfigService(prisma as unknown as PrismaService);
  });

  it("GET creates config with defaults when none exists", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getOrCreate(),
    );

    expect(result.schoolId).toBe(schoolId);
    expect(result.layout).toBe("classic");
    expect(result.showSkills).toBe(true);
    expect(result.showAttendance).toBe(true);
    expect(result.showRemarks).toBe(true);
    expect(result.showGradingKey).toBe(true);
    expect(result.showPosition).toBe(true);
    expect(result.nextTermBegins).toBeNull();
  });

  it("GET is idempotent — second call returns same row (no duplicate)", async () => {
    const first = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getOrCreate(),
    );
    const second = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getOrCreate(),
    );

    expect(first.id).toBe(second.id);
  });

  it("PUT updates flags and a valid layout", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.update({ layout: "modern", showSkills: false, showAttendance: false }),
    );

    expect(result.layout).toBe("modern");
    expect(result.showSkills).toBe(false);
    expect(result.showAttendance).toBe(false);
    // untouched fields remain true
    expect(result.showRemarks).toBe(true);
    expect(result.showGradingKey).toBe(true);
    expect(result.showPosition).toBe(true);
  });

  it("PUT with invalid layout → BadRequestException", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.update({ layout: "invalid-layout" }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("PUT with nextTermBegins sets the date", async () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.update({ nextTermBegins: date }),
    );

    expect(result.nextTermBegins).toEqual(date);
  });
});
