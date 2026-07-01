/**
 * Integration test: per-level format resolution util (AC-2 Task 2)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest format-resolution --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { resolveAssessmentTypes, resolveGradeBoundaries } from "./format-resolution";

const prisma = new PrismaClient();

describe("resolveAssessmentTypes / resolveGradeBoundaries (AC-2)", () => {
  let schoolId: string;
  let L1: string; // level with overrides
  let L2: string; // level with no overrides

  const cleanup = {
    assessmentTypeIds: [] as string[],
    gradeBoundaryIds: [] as string[],
    levelIds: [] as string[],
    schoolId: "",
  };

  beforeAll(async () => {
    const ts = Date.now();

    // Create a school
    const school = await prisma.school.create({
      data: { name: `FormatRes-${ts}`, slug: `format-res-${ts}` } as never,
    });
    schoolId = school.id;
    cleanup.schoolId = school.id;

    // Create two class levels
    const levelA = await prisma.classLevel.create({
      data: { schoolId, name: `L1-${ts}`, order: 1 },
    });
    L1 = levelA.id;
    cleanup.levelIds.push(L1);

    const levelB = await prisma.classLevel.create({
      data: { schoolId, name: `L2-${ts}`, order: 2 },
    });
    L2 = levelB.id;
    cleanup.levelIds.push(L2);

    // Seed default AssessmentTypes (classLevelId = null): CA1 max 20 (order 1), Exam max 80 (order 2)
    const defaultCA1 = await prisma.assessmentType.create({
      data: { schoolId, name: "CA1", maxScore: 20, order: 1, classLevelId: null },
    });
    cleanup.assessmentTypeIds.push(defaultCA1.id);

    const defaultExam = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 80, order: 2, classLevelId: null },
    });
    cleanup.assessmentTypeIds.push(defaultExam.id);

    // Seed L1 override AssessmentTypes: CA max 40 (order 1), Exam max 60 (order 2)
    const overrideCA = await prisma.assessmentType.create({
      data: { schoolId, name: "CA", maxScore: 40, order: 1, classLevelId: L1 },
    });
    cleanup.assessmentTypeIds.push(overrideCA.id);

    const overrideExam = await prisma.assessmentType.create({
      data: { schoolId, name: "Exam", maxScore: 60, order: 2, classLevelId: L1 },
    });
    cleanup.assessmentTypeIds.push(overrideExam.id);

    // Seed default GradeBoundaries: A minScore 70 (order 1), B minScore 50 (order 2)
    const defaultA = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", order: 1, classLevelId: null },
    });
    cleanup.gradeBoundaryIds.push(defaultA.id);

    const defaultB = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "B", minScore: 50, remark: "Good", order: 2, classLevelId: null },
    });
    cleanup.gradeBoundaryIds.push(defaultB.id);

    // Seed L1 override GradeBoundaries: A minScore 80 (order 1), B minScore 60 (order 2)
    const overrideA = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 80, remark: "Excellent", order: 1, classLevelId: L1 },
    });
    cleanup.gradeBoundaryIds.push(overrideA.id);

    const overrideB = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "B", minScore: 65, remark: "Good", order: 2, classLevelId: L1 },
    });
    cleanup.gradeBoundaryIds.push(overrideB.id);
  });

  afterAll(async () => {
    try {
      if (cleanup.assessmentTypeIds.length > 0) {
        await prisma.assessmentType.deleteMany({ where: { id: { in: cleanup.assessmentTypeIds } } });
      }
      if (cleanup.gradeBoundaryIds.length > 0) {
        await prisma.gradeBoundary.deleteMany({ where: { id: { in: cleanup.gradeBoundaryIds } } });
      }
      for (const id of cleanup.levelIds) {
        await prisma.classLevel.delete({ where: { id } }).catch(() => undefined);
      }
      if (cleanup.schoolId) {
        await prisma.school.delete({ where: { id: cleanup.schoolId } }).catch(() => undefined);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ── resolveAssessmentTypes ───────────────────────────────────────────────────

  it("returns level overrides when L1 has its own AssessmentTypes", async () => {
    const types = await resolveAssessmentTypes(prisma, schoolId, L1);
    expect(types.map((t) => t.maxScore)).toEqual([40, 60]);
  });

  it("returns school defaults when L2 has no AssessmentType overrides", async () => {
    const types = await resolveAssessmentTypes(prisma, schoolId, L2);
    expect(types.map((t) => t.maxScore)).toEqual([20, 80]);
  });

  it("returns results ordered by order ASC for both paths", async () => {
    const overrides = await resolveAssessmentTypes(prisma, schoolId, L1);
    const defaults = await resolveAssessmentTypes(prisma, schoolId, L2);

    const ordersOverrides = overrides.map((t) => t.order);
    const ordersDefaults = defaults.map((t) => t.order);

    expect(ordersOverrides).toEqual([...ordersOverrides].sort((a, b) => a - b));
    expect(ordersDefaults).toEqual([...ordersDefaults].sort((a, b) => a - b));
  });

  // ── resolveGradeBoundaries ───────────────────────────────────────────────────

  it("returns level override GradeBoundaries when L1 has overrides", async () => {
    const boundaries = await resolveGradeBoundaries(prisma, schoolId, L1);
    expect(boundaries.map((b) => b.minScore)).toEqual([80, 65]);
  });

  it("returns school default GradeBoundaries when L2 has no overrides", async () => {
    const boundaries = await resolveGradeBoundaries(prisma, schoolId, L2);
    expect(boundaries.map((b) => b.minScore)).toEqual([70, 50]);
  });

  it("GradeBoundary results ordered by order ASC for both paths", async () => {
    const overrides = await resolveGradeBoundaries(prisma, schoolId, L1);
    const defaults = await resolveGradeBoundaries(prisma, schoolId, L2);

    const ordersOverrides = overrides.map((b) => b.order);
    const ordersDefaults = defaults.map((b) => b.order);

    expect(ordersOverrides).toEqual([...ordersOverrides].sort((a, b) => a - b));
    expect(ordersDefaults).toEqual([...ordersDefaults].sort((a, b) => a - b));
  });
});
