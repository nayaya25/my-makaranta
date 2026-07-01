/**
 * Integration test: GradeBoundariesService per-level CRUD + apply (AC-2 Task 4)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest grade-boundaries.service --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { GradeBoundariesService } from "./grade-boundaries.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

function withSchool<T>(schoolId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ schoolId, userId: null }, fn);
}

/** Creates a school + seeds default grade boundaries + levels. */
async function seedSchool(suffix: string) {
  const ts = Date.now();
  const school = await rawPrisma.school.create({
    data: { name: `GB-${suffix}-${ts}`, slug: `gb-${suffix}-${ts}` } as never,
  });
  const L1 = await rawPrisma.classLevel.create({ data: { schoolId: school.id, name: `GL1-${ts}`, order: 1 } });
  const L2 = await rawPrisma.classLevel.create({ data: { schoolId: school.id, name: `GL2-${ts}`, order: 2 } });

  // Defaults (classLevelId = null): A=70, B=50, F=0
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "A", minScore: 70, remark: "Excellent", order: 1, classLevelId: null } });
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "B", minScore: 50, remark: "Good", order: 2, classLevelId: null } });
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "F", minScore: 0, remark: "Fail", order: 3, classLevelId: null } });

  // L1 overrides: A=80, B=65, F=0
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "A", minScore: 80, remark: "Excellent", order: 1, classLevelId: L1.id } });
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "B", minScore: 65, remark: "Good", order: 2, classLevelId: L1.id } });
  await rawPrisma.gradeBoundary.create({ data: { schoolId: school.id, grade: "F", minScore: 0, remark: "Fail", order: 3, classLevelId: L1.id } });

  return { schoolId: school.id, L1: L1.id, L2: L2.id };
}

async function cleanupSchool(schoolId: string) {
  await rawPrisma.gradeBoundary.deleteMany({ where: { schoolId } }).catch(() => undefined);
  const levels = await rawPrisma.classLevel.findMany({ where: { schoolId } });
  for (const l of levels) await rawPrisma.classLevel.delete({ where: { id: l.id } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
}

let service: GradeBoundariesService;
let foreignSchoolId: string;
let foreignLevelId: string;

beforeAll(async () => {
  service = new GradeBoundariesService(prisma);
  const ts = Date.now();
  const foreign = await rawPrisma.school.create({
    data: { name: `GB-Foreign-${ts}`, slug: `gb-foreign-${ts}` } as never,
  });
  foreignSchoolId = foreign.id;
  const fl = await rawPrisma.classLevel.create({ data: { schoolId: foreignSchoolId, name: `GFL-${ts}`, order: 1 } });
  foreignLevelId = fl.id;
});

afterAll(async () => {
  await cleanupSchool(foreignSchoolId).catch(() => undefined);
  await rawPrisma.$disconnect();
});

// ── create ──────────────────────────────────────────────────────────────────

describe("GradeBoundariesService.create", () => {
  let schoolId: string;
  let L1: string;

  beforeAll(async () => {
    const seed = await seedSchool("create");
    schoolId = seed.schoolId;
    L1 = seed.L1;
  });
  afterAll(() => cleanupSchool(schoolId));

  it("persists a new boundary without classLevelId (default)", async () => {
    const ts = Date.now();
    const result = await withSchool(schoolId, () =>
      service.create({ grade: `C-${ts}`, minScore: 40, remark: "Average", order: 4 }),
    );
    expect(result.schoolId).toBe(schoolId);
    expect(result.classLevelId).toBeNull();
  });

  it("persists a new boundary with a valid classLevelId belonging to school", async () => {
    const ts = Date.now();
    const result = await withSchool(schoolId, () =>
      service.create({ grade: `D-${ts}`, minScore: 35, remark: "Below Average", order: 5, classLevelId: L1 }),
    );
    expect(result.classLevelId).toBe(L1);
    expect(result.schoolId).toBe(schoolId);
  });

  it("throws BadRequestException when classLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.create({ grade: "Z", minScore: 10, remark: "Low", order: 9, classLevelId: foreignLevelId }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when classLevelId does not exist", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.create({ grade: "Z", minScore: 10, remark: "Low", order: 9, classLevelId: "nonexistent-id" }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

// ── list ─────────────────────────────────────────────────────────────────────

describe("GradeBoundariesService.list", () => {
  let schoolId: string;
  let L1: string;
  let L2: string;

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

describe("GradeBoundariesService.apply", () => {
  let schoolId: string;
  let L1: string;
  let L2: string;
  let applyTarget: string;

  beforeAll(async () => {
    const seed = await seedSchool("apply");
    schoolId = seed.schoolId;
    L1 = seed.L1;
    L2 = seed.L2;
    const ts = Date.now();
    const tgt = await rawPrisma.classLevel.create({ data: { schoolId, name: `GBApplyTarget-${ts}`, order: 50 } });
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
    // Defaults ordered desc by minScore: [70, 50, 0]
    expect(rows.map((r) => r.minScore)).toEqual([70, 50, 0]);
  });

  it("re-applying replaces (no duplicate rows)", async () => {
    await withSchool(schoolId, () =>
      service.apply({ sourceClassLevelId: null, targetClassLevelIds: [applyTarget] }),
    );
    const rows = await withSchool(schoolId, () => service.list(applyTarget));
    // Should be exactly 3 rows, not 6
    expect(rows.length).toBe(3);
  });

  it("throws BadRequestException when a targetClassLevelId belongs to a foreign school", async () => {
    await expect(
      withSchool(schoolId, () =>
        service.apply({ sourceClassLevelId: null, targetClassLevelIds: [foreignLevelId] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("can clone from a level override (sourceClassLevelId=L1) to another level", async () => {
    await withSchool(schoolId, () =>
      service.apply({ sourceClassLevelId: L1, targetClassLevelIds: [applyTarget] }),
    );
    const rows = await withSchool(schoolId, () => service.list(applyTarget));
    // L1 overrides ordered desc by minScore: [80, 65, 0]
    expect(rows.map((r) => r.minScore)).toEqual([80, 65, 0]);
    expect(rows.every((r) => r.isDefault === false)).toBe(true);
  });

  it("subsequent list(applyTarget) returns non-default rows; list(L2) still returns defaults", async () => {
    const l2rows = await withSchool(schoolId, () => service.list(L2));
    const targetRows = await withSchool(schoolId, () => service.list(applyTarget));
    expect(l2rows.every((r) => r.isDefault === true)).toBe(true);
    expect(targetRows.every((r) => r.isDefault === false)).toBe(true);
  });
});
