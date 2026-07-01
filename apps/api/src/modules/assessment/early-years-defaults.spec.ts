import { PrismaClient } from "@prisma/client";
import { seedEarlyYearsDefaults, EY_AREAS } from "./early-years-defaults";

const prisma = new PrismaClient();

afterAll(() => prisma.$disconnect());

describe("seedEarlyYearsDefaults", () => {
  let schoolId: string;

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: `EY-Seeder-${Date.now()}`, slug: `ey-seeder-${Date.now()}` } as never,
    });
    schoolId = school.id;
  });

  it("creates 7 EY areas (kind='early_years') and 3 EY scale points on first call", async () => {
    await seedEarlyYearsDefaults(prisma, schoolId);

    const eyDomains = await prisma.skillDomain.count({ where: { schoolId, kind: "early_years" } });
    const eyScale = await prisma.skillScalePoint.count({ where: { schoolId, kind: "early_years" } });

    expect(eyDomains).toBe(EY_AREAS.length); // 7
    expect(eyScale).toBe(3);
  });

  it("is idempotent — second call does not duplicate rows", async () => {
    await seedEarlyYearsDefaults(prisma, schoolId);

    const eyDomains = await prisma.skillDomain.count({ where: { schoolId, kind: "early_years" } });
    const eyScale = await prisma.skillScalePoint.count({ where: { schoolId, kind: "early_years" } });

    expect(eyDomains).toBe(EY_AREAS.length); // still 7
    expect(eyScale).toBe(3);
  });

  it("does NOT create or touch any kind='conduct' rows", async () => {
    const conductDomains = await prisma.skillDomain.count({ where: { schoolId, kind: "conduct" } });
    const conductScale = await prisma.skillScalePoint.count({ where: { schoolId, kind: "conduct" } });

    expect(conductDomains).toBe(0);
    expect(conductScale).toBe(0);
  });
});
