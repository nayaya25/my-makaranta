import type { PrismaClient } from "@prisma/client";

export const EY_AREAS = [
  { name: "Communication & Language", items: ["Listening & Attention", "Speaking", "Understanding"] },
  { name: "Number Work", items: ["Counting", "Number Recognition", "Shapes & Patterns"] },
  { name: "Physical Development", items: ["Gross Motor", "Fine Motor", "Health & Self-care"] },
  { name: "Personal, Social & Emotional", items: ["Confidence", "Relationships", "Behaviour"] },
  { name: "Understanding the World", items: ["People & Communities", "The World", "Technology"] },
  { name: "Creative & Expressive Arts", items: ["Art & Craft", "Music & Movement", "Imaginative Play"] },
  { name: "Moral / Religious", items: ["Values", "Rhymes & Recitation"] },
];

const EY_SCALE = [
  { value: 3, label: "Secure" },
  { value: 2, label: "Developing" },
  { value: 1, label: "Beginning" },
];

export async function seedEarlyYearsDefaults(prisma: PrismaClient, schoolId: string): Promise<void> {
  const has = await prisma.skillDomain.count({ where: { schoolId, kind: "early_years" } });
  if (has === 0) {
    for (const [di, a] of EY_AREAS.entries()) {
      const d = await prisma.skillDomain.create({ data: { schoolId, kind: "early_years", name: a.name, order: di } });
      await prisma.skillItem.createMany({ data: a.items.map((name, i) => ({ schoolId, domainId: d.id, name, order: i })) });
    }
  }
  const scale = await prisma.skillScalePoint.count({ where: { schoolId, kind: "early_years" } });
  if (scale === 0) {
    await prisma.skillScalePoint.createMany({
      data: EY_SCALE.map((p, i) => ({ schoolId, kind: "early_years", value: p.value, label: p.label, order: i })),
    });
  }
}
