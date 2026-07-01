import type { PrismaClient } from "@prisma/client";

export const DEFAULT_SUBJECT_CATEGORIES = [
  "General",
  "Languages",
  "Sciences",
  "Arts",
  "Vocational",
  "Religious",
];

export async function seedSubjectCategories(prisma: PrismaClient, schoolId: string): Promise<void> {
  for (const [i, name] of DEFAULT_SUBJECT_CATEGORIES.entries()) {
    const existing = await prisma.subjectCategory.findFirst({ where: { schoolId, name } });
    if (!existing) {
      await prisma.subjectCategory.create({
        data: { schoolId, name, order: i + 1 },
      });
    }
  }
}
