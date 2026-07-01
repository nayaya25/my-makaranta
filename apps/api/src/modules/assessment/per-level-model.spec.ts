/**
 * Integration test: per-level assessment formats + SubjectCategory (AC-2 Task 1)
 *
 * Run:
 *   DATABASE_URL=<set in env or .env.test> pnpm exec jest per-level-model --runInBand
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("per-level assessment formats schema (AC-2)", () => {
  let schoolId: string;
  let levelId: string;
  let categoryId: string;

  const createdAssessmentTypeIds: string[] = [];
  const createdGradeBoundaryIds: string[] = [];
  const createdSubjectIds: string[] = [];

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `AC2-Test-${ts}`, slug: `ac2-test-${ts}` } as never,
    });
    schoolId = school.id;

    const level = await prisma.classLevel.create({
      data: { schoolId, name: `JSS1-${ts}`, order: 1 },
    });
    levelId = level.id;
  });

  afterAll(async () => {
    try {
      if (createdSubjectIds.length > 0) {
        await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
      }
      if (categoryId) {
        await prisma.subjectCategory.delete({ where: { id: categoryId } }).catch(() => undefined);
      }
      if (createdAssessmentTypeIds.length > 0) {
        await prisma.assessmentType.deleteMany({ where: { id: { in: createdAssessmentTypeIds } } });
      }
      if (createdGradeBoundaryIds.length > 0) {
        await prisma.gradeBoundary.deleteMany({ where: { id: { in: createdGradeBoundaryIds } } });
      }
      if (levelId) {
        await prisma.classLevel.delete({ where: { id: levelId } }).catch(() => undefined);
      }
      if (schoolId) {
        await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ── AssessmentType partial-index tests ──────────────────────────────────────

  it("creates a default AssessmentType (classLevelId null)", async () => {
    const at = await prisma.assessmentType.create({
      data: { schoolId, name: "CA1", maxScore: 30, classLevelId: null },
    });
    createdAssessmentTypeIds.push(at.id);
    expect(at.classLevelId).toBeNull();
  });

  it("creates a level-override AssessmentType with same name (coexists)", async () => {
    const at = await prisma.assessmentType.create({
      data: { schoolId, name: "CA1", maxScore: 25, classLevelId: levelId },
    });
    createdAssessmentTypeIds.push(at.id);
    expect(at.classLevelId).toBe(levelId);
  });

  it("rejects a second default AssessmentType with same name (partial index violation)", async () => {
    await expect(
      prisma.assessmentType.create({
        data: { schoolId, name: "CA1", maxScore: 30, classLevelId: null },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second override AssessmentType for the same level+name (@@unique violation)", async () => {
    await expect(
      prisma.assessmentType.create({
        data: { schoolId, name: "CA1", maxScore: 20, classLevelId: levelId },
      }),
    ).rejects.toThrow();
  });

  // ── GradeBoundary partial-index tests ───────────────────────────────────────

  it("creates a default GradeBoundary (classLevelId null)", async () => {
    const gb = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 75, remark: "Excellent", classLevelId: null },
    });
    createdGradeBoundaryIds.push(gb.id);
    expect(gb.classLevelId).toBeNull();
  });

  it("creates a level-override GradeBoundary with same grade (coexists)", async () => {
    const gb = await prisma.gradeBoundary.create({
      data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", classLevelId: levelId },
    });
    createdGradeBoundaryIds.push(gb.id);
    expect(gb.classLevelId).toBe(levelId);
  });

  it("rejects a second default GradeBoundary with same grade (partial index violation)", async () => {
    await expect(
      prisma.gradeBoundary.create({
        data: { schoolId, grade: "A", minScore: 75, remark: "Excellent", classLevelId: null },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second override GradeBoundary for the same level+grade (@@unique violation)", async () => {
    await expect(
      prisma.gradeBoundary.create({
        data: { schoolId, grade: "A", minScore: 70, remark: "Excellent", classLevelId: levelId },
      }),
    ).rejects.toThrow();
  });

  // ── SubjectCategory + Subject.categoryId tests ──────────────────────────────

  it("creates a SubjectCategory", async () => {
    const cat = await prisma.subjectCategory.create({
      data: { schoolId, name: "Sciences", order: 1 },
    });
    categoryId = cat.id;
    expect(cat.id).toBeDefined();
    expect(cat.name).toBe("Sciences");
  });

  it("creates a Subject linked to the SubjectCategory and includes category in query", async () => {
    const ts = Date.now();
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        name: "Biology",
        code: `BIO-${ts}`,
        categoryId,
      },
      include: { category: true },
    });
    createdSubjectIds.push(subject.id);

    expect(subject.categoryId).toBe(categoryId);
    expect(subject.category).not.toBeNull();
    expect(subject.category!.name).toBe("Sciences");
  });
});
