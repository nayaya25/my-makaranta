import type { PrismaClient } from "@prisma/client";

export const DEFAULT_DOMAINS = [
  { name: "Affective", items: ["Punctuality", "Neatness", "Politeness", "Honesty", "Attentiveness", "Cooperation"] },
  { name: "Psychomotor", items: ["Handwriting", "Drawing & Painting", "Sports", "Music", "Handling of Tools"] },
];

const DEFAULT_SCALE = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very Good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];

export async function seedSkillDefaults(prisma: PrismaClient, schoolId: string): Promise<void> {
  const existing = await prisma.skillDomain.count({ where: { schoolId, kind: "conduct" } });
  if (existing === 0) {
    for (const [di, d] of DEFAULT_DOMAINS.entries()) {
      const domain = await prisma.skillDomain.create({ data: { schoolId, kind: "conduct", name: d.name, order: di } });
      await prisma.skillItem.createMany({
        data: d.items.map((name, i) => ({ schoolId, domainId: domain.id, name, order: i })),
      });
    }
  }
  const scaleCount = await prisma.skillScalePoint.count({ where: { schoolId, kind: "conduct" } });
  if (scaleCount === 0) {
    await prisma.skillScalePoint.createMany({
      data: DEFAULT_SCALE.map((p, i) => ({ schoolId, kind: "conduct", value: p.value, label: p.label, order: i })),
    });
  }
}
