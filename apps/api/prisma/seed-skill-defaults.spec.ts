import { PrismaClient } from "@prisma/client";
import { seedSkillDefaults, DEFAULT_DOMAINS } from "../src/modules/assessment/skill-defaults";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

it("seeds default domains/items + 5-point scale idempotently", async () => {
  const s = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
  await seedSkillDefaults(prisma, s.id);
  await seedSkillDefaults(prisma, s.id); // idempotent
  const domains = await prisma.skillDomain.findMany({ where: { schoolId: s.id } });
  expect(domains.map((d) => d.name).sort()).toEqual(DEFAULT_DOMAINS.map((d) => d.name).sort());
  const scale = await prisma.skillScalePoint.findMany({ where: { schoolId: s.id } });
  expect(scale).toHaveLength(5);
});
