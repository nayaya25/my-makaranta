import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(() => prisma.$disconnect());

describe("AC-3 T1 — isEarlyYears + kind discriminators + widened uniques", () => {
  let schoolId: string;

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: `EY-T1-${Date.now()}`, slug: `ey-t1-${Date.now()}` } as never,
    });
    schoolId = school.id;
  });

  it("allows conduct value=1 and early_years value=1 for the same school (widened unique)", async () => {
    const conduct = await prisma.skillScalePoint.create({
      data: { schoolId, kind: "conduct", value: 1, label: "Needs Improvement", order: 0 },
    });
    const ey = await prisma.skillScalePoint.create({
      data: { schoolId, kind: "early_years", value: 1, label: "Beginning", order: 0 },
    });
    expect(conduct.kind).toBe("conduct");
    expect(ey.kind).toBe("early_years");
    expect(conduct.value).toBe(1);
    expect(ey.value).toBe(1);
  });

  it("allows conduct domain 'X' and early_years domain 'X' for the same school to coexist", async () => {
    const conductDomain = await prisma.skillDomain.create({
      data: { schoolId, kind: "conduct", name: "Character X", order: 0 },
    });
    const eyDomain = await prisma.skillDomain.create({
      data: { schoolId, kind: "early_years", name: "Character X", order: 0 },
    });
    expect(conductDomain.kind).toBe("conduct");
    expect(eyDomain.kind).toBe("early_years");
    expect(conductDomain.name).toBe("Character X");
    expect(eyDomain.name).toBe("Character X");
  });

  it("ClassLevel.isEarlyYears toggles and persists", async () => {
    const level = await prisma.classLevel.create({
      data: { schoolId, name: `Nursery-${Date.now()}`, order: 0 },
    });
    expect(level.isEarlyYears).toBe(false);

    const updated = await prisma.classLevel.update({
      where: { id: level.id },
      data: { isEarlyYears: true },
    });
    expect(updated.isEarlyYears).toBe(true);

    const toggled = await prisma.classLevel.update({
      where: { id: level.id },
      data: { isEarlyYears: false },
    });
    expect(toggled.isEarlyYears).toBe(false);
  });
});
