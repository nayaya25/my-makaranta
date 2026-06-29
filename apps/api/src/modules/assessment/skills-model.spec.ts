import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());
it("creates a domain → item → rating chain", async () => {
  const school = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
  const d = await prisma.skillDomain.create({ data: { schoolId: school.id, name: "Affective" } });
  const item = await prisma.skillItem.create({ data: { schoolId: school.id, domainId: d.id, name: "Punctuality" } });
  expect(item.domainId).toBe(d.id);
  const cfg = await prisma.reportCardConfig.create({ data: { schoolId: school.id } });
  expect(cfg.layout).toBe("classic");
});
