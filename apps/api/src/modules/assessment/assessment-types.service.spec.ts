/**
 * Integration test: AssessmentTypesService per-level CRUD + apply (AC-2 Task 4)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest assessment-types.service --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AssessmentTypesService } from "./assessment-types.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

function withSchool<T>(schoolId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ schoolId, userId: null }, fn);
}

/** Creates a school + seeds default assessment types + levels. Returns cleanup ids. */
async function seedSchool(suffix: string) {
  const ts = Date.now();
  const school = await rawPrisma.school.create({
    data: { name: `AT-${suffix}-${ts}`, slug: `at-${suffix}-${ts}` } as never,
  });
  const L1 = await rawPrisma.classLevel.create({ data: { schoolId: school.id, name: `L1-${ts}`, order: 1 } });
  const L2 = await rawPrisma.classLevel.create({ data: { schoolId: school.id, name: `L2-${ts}`, order: 2 } });

  // Defaults (classLevelId = null)
  await rawPrisma.assessmentType.create({ data: { schoolId: school.id, name: "CA1", maxScore: 20, order: 1, classLevelId: null } });
  await rawPrisma.assessmentType.create({ data: { schoolId: school.id, name: "Exam", maxScore: 80, order: 2, classLevelId: null } });

  // L1 overrides
  await rawPrisma.assessmentType.create({ data: { schoolId: school.id, name: "CA1", maxScore: 40, order: 1, classLevelId: L1.id } });
  await rawPrisma.assessmentType.create({ data: { schoolId: school.id, name: "Exam", maxScore: 60, order: 2, classLevelId: L1.id } });

  return { schoolId: school.id, L1: L1.id, L2: L2.id };
}

async function cleanupSchool(schoolId: string) {
  await rawPrisma.assessmentType.deleteMany({ where: { schoolId } }).catch(() => undefined);
  const levels = await rawPrisma.classLevel.findMany({ where: { schoolId } });
  for (const l of levels) await rawPrisma.classLevel.delete({ where: { id: l.id } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
}

let service: AssessmentTypesService;
let foreignSchoolId: string;
let foreignLevelId: string;

beforeAll(async () => {
  service = new AssessmentTypesService(prisma);
  const ts = Date.now();
  const foreign = await rawPrisma.school.create({
    data: { name: `AT-Foreign-${ts}`, slug: `at-foreign-${ts}` } as never,
  });
  foreignSchoolId = foreign.id;
  const fl = await rawPrisma.classLevel.create({ data: { schoolId: foreignSchoolId, name: `FL-${ts}`, order: 1 } });
  foreignLevelId = fl.id;
});

afterAll(async () => {
  await cleanupSchool(foreignSchoolId).catch(() => undefined);
  await rawPrisma.$disconnect();
});

// ── create ──────────────────────────────────────────────────────────────────

describe("AssessmentTypesService.create", () => {
  let schoolId: string;
  let L1: string;

  beforeAll(async () => {
    const seed = await seedSchool("create");
    schoolId = seed.schoolId;
    L1 = seed.L1;
  });
  afterAll(() => cleanupSchool(schoolId));

  it("persists a new type without classLevelId (default)", async () => {
    const ts = Date.now();
    const result = await withSchool(schoolId, () =>
      service.create({ name: `NewCA-${ts}`, maxScore: 10, order: 5 }),
    );
    expect(result.schoolId).toBe(schoolId);
    expect(result.classLevelId).toBeNull();
  });

  it("persists a new type with a valid classLevelId belonging to school", async () => {
    const ts = Date.now();
    const result = await withSchool(schoolId, () =>
      service.create({ name: `L1Only-${ts}`, maxScore: 15, order: 3, classLevelId: L1 }),
    );
    expect(result.classLevelId).toBe(L1);
  });

  it("throws BadRequestException when classLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.create({ name: "ForeignType", maxScore: 10, order: 1, classLevelId: foreignLevelId }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when classLevelId does not exist", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.create({ name: "GhostType", maxScore: 10, order: 1, classLevelId: "nonexistent-id" }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

// ── list ─────────────────────────────────────────────────────────────────────

describe("AssessmentTypesService.list", () => {
  let schoolId: string;
  let L1: string;
  let L2: string; // L2 has no overrides

  beforeAll(async () => {
    const seed = await seedSchool("list");
    schoolId = seed.schoolId;
    L1 = seed.L1;
    L2 = seed.L2;
  });
  afterAll(() => cleanupSchool(schoolId));

  it("list(classLevelId=L1): returns override rows with isDefault=false", async () => {
    const rows = await withSchool(schoolId, () => service.list(L1));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.isDefault === false)).toBe(true);
    expect(rows.every((r) => r.classLevelId === L1)).toBe(true);
  });

  it("list(classLevelId=L2): returns defaults with isDefault=true (no overrides on L2)", async () => {
    const rows = await withSchool(schoolId, () => service.list(L2));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.isDefault === true)).toBe(true);
    expect(rows.every((r) => r.classLevelId === null)).toBe(true);
  });

  it("list() no classLevelId → returns defaults with isDefault=true", async () => {
    const rows = await withSchool(schoolId, () => service.list());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.isDefault === true)).toBe(true);
    expect(rows.every((r) => r.classLevelId === null)).toBe(true);
  });

  it("throws BadRequestException when classLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () => service.list(foreignLevelId)),
    ).rejects.toThrow(BadRequestException);
  });
});

// ── apply ─────────────────────────────────────────────────────────────────────

describe("AssessmentTypesService.apply", () => {
  let schoolId: string;
  let L1: string;
  let L2: string;
  let applyTarget: string;

  beforeAll(async () => {
    const seed = await seedSchool("apply");
    schoolId = seed.schoolId;
    L1 = seed.L1;
    L2 = seed.L2;
    // Fresh target level (no overrides)
    const ts = Date.now();
    const tgt = await rawPrisma.classLevel.create({ data: { schoolId, name: `ApplyTarget-${ts}`, order: 50 } });
    applyTarget = tgt.id;
  });
  afterAll(() => cleanupSchool(schoolId));

  it("clones defaults onto a target level (sourceClassLevelId=null)", async () => {
    await withSchool(schoolId, () =>
      service.apply({ sourceClassLevelId: null, targetClassLevelIds: [applyTarget] }),
    );
    const rows = await withSchool(schoolId, () => service.list(applyTarget));
    expect(rows.every((r) => r.isDefault === false)).toBe(true);
    expect(rows.every((r) => r.classLevelId === applyTarget)).toBe(true);
    // Defaults are CA1=20, Exam=80 ordered by order asc
    expect(rows.map((r) => r.maxScore)).toEqual([20, 80]);
  });

  it("re-applying replaces (no duplicate rows)", async () => {
    await withSchool(schoolId, () =>
      service.apply({ sourceClassLevelId: null, targetClassLevelIds: [applyTarget] }),
    );
    const rows = await withSchool(schoolId, () => service.list(applyTarget));
    // Should still be exactly 2 rows, not 4
    expect(rows.length).toBe(2);
  });

  it("throws BadRequestException when a targetClassLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.apply({ sourceClassLevelId: null, targetClassLevelIds: [foreignLevelId] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when sourceClassLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.apply({ sourceClassLevelId: foreignLevelId, targetClassLevelIds: [applyTarget] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("can clone from a level override (sourceClassLevelId=L1) to another level", async () => {
    await withSchool(schoolId, () =>
      service.apply({ sourceClassLevelId: L1, targetClassLevelIds: [applyTarget] }),
    );
    const rows = await withSchool(schoolId, () => service.list(applyTarget));
    // L1 overrides have maxScores [40, 60] ordered by order asc
    expect(rows.map((r) => r.maxScore)).toEqual([40, 60]);
    expect(rows.every((r) => r.isDefault === false)).toBe(true);
  });

  it("subsequent list(applyTarget) returns non-default rows matching the source", async () => {
    // Verify by listing L2 (still no overrides) vs applyTarget (has overrides from L1)
    const l2rows = await withSchool(schoolId, () => service.list(L2));
    const targetRows = await withSchool(schoolId, () => service.list(applyTarget));
    expect(l2rows.every((r) => r.isDefault === true)).toBe(true);
    expect(targetRows.every((r) => r.isDefault === false)).toBe(true);
  });
});
