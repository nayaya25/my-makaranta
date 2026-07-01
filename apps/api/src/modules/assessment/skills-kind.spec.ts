/**
 * AC-3 Task 3 — kind param on skills config / grid / ratings
 *
 * Tests:
 *   1. listConfig("conduct") returns only conduct domains + conduct scale
 *   2. listConfig("early_years") returns only EY areas + EY scale
 *   3. getGrid(class, term, "early_years") returns EY domains + EY scale
 *   4. saveRatings persists an EY rating; isolated from conduct ratings
 *   5. saveRatings with an EY item rejected when kind="conduct" (cross-kind IDOR)
 *   6. saveRatings with a conduct item rejected when kind="early_years" (cross-kind IDOR)
 */

import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SkillsService } from "./skills.service";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";
import { seedEarlyYearsDefaults, EY_AREAS } from "./early-years-defaults";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("AC-3 Task 3 — kind isolation in config / grid / ratings", () => {
  let service: SkillsService;
  let schoolId: string;
  let classId: string;
  let termId: string;
  let studentId: string;
  const recordedBy = "test-teacher";

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `KindTest-${ts}`, slug: `kind-${ts}`, skillScaleMax: 5 } as never,
    });
    schoolId = school.id;

    // Seed both conduct (AC-1) AND early_years (AC-3) defaults
    await seedSkillDefaults(prisma, schoolId);
    await seedEarlyYearsDefaults(prisma, schoolId);

    // Academic year + term
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2024/2025", startDate: new Date(), endDate: new Date() },
    });
    const term = await prisma.term.create({
      data: { schoolId, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() },
    });
    termId = term.id;

    // Class level + class
    const level = await prisma.classLevel.create({ data: { schoolId, name: "Nursery 1", order: 0 } });
    const klass = await prisma.class.create({ data: { schoolId, name: "NRS 1A", classLevelId: level.id } });
    classId = klass.id;

    // 1 student enrolled
    const s = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `EY-${ts}`,
        firstName: "Amina",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2019-03-01"),
      },
    });
    studentId = s.id;
    await prisma.enrollment.create({ data: { studentId, classId, termId } });

    service = new SkillsService(prisma as unknown as PrismaService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. listConfig isolation
  // ──────────────────────────────────────────────────────────────────────────

  it("listConfig('conduct') returns only 2 conduct domains and 5-point conduct scale", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.listConfig("conduct"),
    );

    // Only conduct domains (not EY areas)
    expect(result.domains).toHaveLength(2);
    expect(result.domains.map((d: { name: string }) => d.name)).toEqual(
      expect.arrayContaining(["Affective", "Psychomotor"]),
    );
    // 5-point conduct scale
    expect(result.scale).toHaveLength(5);
    expect(result.scale[0]).toMatchObject({ value: 5, label: "Excellent" });

    // Must not contain any EY area names
    const eyNames = EY_AREAS.map((a) => a.name);
    for (const d of result.domains) {
      expect(eyNames).not.toContain(d.name);
    }
  });

  it("listConfig('early_years') returns only 7 EY areas and 3-point EY scale", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.listConfig("early_years"),
    );

    // 7 EY areas
    expect(result.domains).toHaveLength(EY_AREAS.length); // 7
    expect(result.domains.map((d: { name: string }) => d.name)).toEqual(
      expect.arrayContaining(EY_AREAS.map((a) => a.name)),
    );

    // 3-point EY scale
    expect(result.scale).toHaveLength(3);
    expect(result.scale).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 3, label: "Secure" }),
        expect.objectContaining({ value: 2, label: "Developing" }),
        expect.objectContaining({ value: 1, label: "Beginning" }),
      ]),
    );

    // Must not contain Affective/Psychomotor
    for (const d of result.domains) {
      expect(["Affective", "Psychomotor"]).not.toContain(d.name);
    }
  });

  it("listConfig defaults to 'conduct' when no kind supplied", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.listConfig(),
    );
    expect(result.domains).toHaveLength(2);
    expect(result.scale).toHaveLength(5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. getGrid isolation
  // ──────────────────────────────────────────────────────────────────────────

  it("getGrid(class, term, 'early_years') returns 7 EY domains + 3-point EY scale", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGrid(classId, termId, "early_years"),
    );

    expect(result.domains).toHaveLength(EY_AREAS.length);
    expect(result.scale).toHaveLength(3);
    expect(result.scale).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 3, label: "Secure" }),
        expect.objectContaining({ value: 1, label: "Beginning" }),
      ]),
    );

    // No Affective/Psychomotor leak
    for (const d of result.domains) {
      expect(["Affective", "Psychomotor"]).not.toContain(d.name);
    }
  });

  it("getGrid(class, term, 'conduct') returns 2 conduct domains + 5-point scale (default kind)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getGrid(classId, termId, "conduct"),
    );

    expect(result.domains).toHaveLength(2);
    expect(result.scale).toHaveLength(5);

    // No EY area names leak
    const eyNames = EY_AREAS.map((a) => a.name);
    for (const d of result.domains) {
      expect(eyNames).not.toContain(d.name);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. saveRatings isolation
  // ──────────────────────────────────────────────────────────────────────────

  it("saveRatings persists EY rating and is isolated from conduct ratings", async () => {
    // Get an EY skill item
    const eyDomain = await prisma.skillDomain.findFirst({
      where: { schoolId, kind: "early_years" },
      include: { items: true },
    });
    const eyItemId = eyDomain!.items[0]!.id;

    // Get a conduct skill item
    const conductDomain = await prisma.skillDomain.findFirst({
      where: { schoolId, kind: "conduct" },
      include: { items: true },
    });
    const conductItemId = conductDomain!.items[0]!.id;

    // Save an EY rating
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.saveRatings(
        { classId, termId, kind: "early_years", ratings: [{ studentId, skillItemId: eyItemId, value: 3 }] },
        recordedBy,
      ),
    );
    expect(result).toEqual({ saved: 1 });

    // Verify EY rating persisted
    const saved = await prisma.skillRating.findUnique({
      where: { studentId_termId_skillItemId: { studentId, termId, skillItemId: eyItemId } },
    });
    expect(saved?.value).toBe(3);

    // Conduct rating for same student must not exist
    const conductRating = await prisma.skillRating.findUnique({
      where: { studentId_termId_skillItemId: { studentId, termId, skillItemId: conductItemId } },
    });
    expect(conductRating).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Cross-kind IDOR guards
  // ──────────────────────────────────────────────────────────────────────────

  it("saveRatings with EY item and kind='conduct' → ForbiddenException (cross-kind IDOR)", async () => {
    const eyDomain = await prisma.skillDomain.findFirst({
      where: { schoolId, kind: "early_years" },
      include: { items: true },
    });
    const eyItemId = eyDomain!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, kind: "conduct", ratings: [{ studentId, skillItemId: eyItemId, value: 3 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("saveRatings with conduct item and kind='early_years' → ForbiddenException (cross-kind IDOR)", async () => {
    const conductDomain = await prisma.skillDomain.findFirst({
      where: { schoolId, kind: "conduct" },
      include: { items: true },
    });
    const conductItemId = conductDomain!.items[0]!.id;

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.saveRatings(
          { classId, termId, kind: "early_years", ratings: [{ studentId, skillItemId: conductItemId, value: 2 }] },
          recordedBy,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
