/**
 * AC-3 Task 4 — ClassLevel.isEarlyYears flag + seed EY defaults on flag
 *
 * Tests:
 *   1. PATCH with isEarlyYears: true → persists flag AND seeds 7 EY domains + 3 scale points
 *   2. PATCH with isEarlyYears: true again (already true) → idempotent; EY defaults still exist
 *   3. PATCH with isEarlyYears: false → persists false; EY defaults still exist (not deleted)
 *   4. PATCH on level belonging to different school → NotFoundException
 */

import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ClassLevelsService } from "./class-levels.service";
import { EY_AREAS } from "../assessment/early-years-defaults";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("AC-3 Task 4 — ClassLevelsService.updateLevel (isEarlyYears)", () => {
  let service: ClassLevelsService;
  let schoolId: string;
  let levelId: string;
  let otherSchoolId: string;
  let otherLevelId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `EYFlagTest-${ts}`, slug: `ey-flag-${ts}` } as never,
    });
    schoolId = school.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: "Nursery 1", order: 0 },
    });
    levelId = level.id;

    const otherSchool = await prisma.school.create({
      data: { name: `OtherSchool-${ts}`, slug: `other-school-${ts}` } as never,
    });
    otherSchoolId = otherSchool.id;

    const otherLevel = await prisma.classLevel.create({
      data: { schoolId: otherSchoolId, name: "KG 1", order: 0 },
    });
    otherLevelId = otherLevel.id;

    service = new ClassLevelsService(prisma as unknown as PrismaService);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Set isEarlyYears: true → persists flag AND seeds EY defaults
  // ────────────────────────────────────────────────────────────────────────────

  it("sets isEarlyYears: true AND seeds 7 EY domains + 3 EY scale points", async () => {
    await TenantContext.run({ schoolId, userId: null }, () =>
      service.updateLevel(levelId, { isEarlyYears: true }),
    );

    // Flag persisted
    const row = await prisma.classLevel.findUnique({ where: { id: levelId } });
    expect(row?.isEarlyYears).toBe(true);

    // 7 EY skill domains seeded
    const eyDomains = await prisma.skillDomain.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyDomains).toBe(EY_AREAS.length); // 7

    // 3 EY scale points seeded
    const eyScale = await prisma.skillScalePoint.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyScale).toBe(3);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Set isEarlyYears: true again → idempotent; still 7 domains + 3 scale
  // ────────────────────────────────────────────────────────────────────────────

  it("second PATCH with isEarlyYears: true is idempotent (no duplicate EY defaults)", async () => {
    await TenantContext.run({ schoolId, userId: null }, () =>
      service.updateLevel(levelId, { isEarlyYears: true }),
    );

    const eyDomains = await prisma.skillDomain.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyDomains).toBe(EY_AREAS.length); // still 7, not 14

    const eyScale = await prisma.skillScalePoint.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyScale).toBe(3); // still 3, not 6
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Set isEarlyYears: false → persists false; EY defaults remain
  // ────────────────────────────────────────────────────────────────────────────

  it("sets isEarlyYears: false but leaves EY defaults intact", async () => {
    await TenantContext.run({ schoolId, userId: null }, () =>
      service.updateLevel(levelId, { isEarlyYears: false }),
    );

    // Flag updated to false
    const row = await prisma.classLevel.findUnique({ where: { id: levelId } });
    expect(row?.isEarlyYears).toBe(false);

    // EY defaults still exist (no unseed)
    const eyDomains = await prisma.skillDomain.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyDomains).toBe(EY_AREAS.length);

    const eyScale = await prisma.skillScalePoint.count({
      where: { schoolId, kind: "early_years" },
    });
    expect(eyScale).toBe(3);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. PATCH on a level from a different school → NotFoundException
  // ────────────────────────────────────────────────────────────────────────────

  it("throws NotFoundException when level belongs to a different school (tenant IDOR)", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        // otherLevelId belongs to otherSchool, but TenantContext has schoolId
        service.updateLevel(otherLevelId, { isEarlyYears: true }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
