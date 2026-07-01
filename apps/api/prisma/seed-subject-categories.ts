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
  const existing = await prisma.subjectCategory.count({ where: { schoolId } });
  if (existing === 0) {
    await prisma.subjectCategory.createMany({
      data: DEFAULT_SUBJECT_CATEGORIES.map((name, i) => ({
        schoolId,
        name,
        order: i + 1,
      })),
    });
  }
}
