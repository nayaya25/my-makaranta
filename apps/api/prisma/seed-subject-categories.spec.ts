import { PrismaClient } from "@prisma/client";
import { seedSubjectCategories, DEFAULT_SUBJECT_CATEGORIES } from "./seed-subject-categories";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

it("seeds 6 default subject categories idempotently", async () => {
  const school = await prisma.school.create({
    data: { name: "Cat Seed School", slug: `cat-seed-${Date.now()}` } as never,
  });

  await seedSubjectCategories(prisma, school.id);
  await seedSubjectCategories(prisma, school.id); // idempotent — no-op

  const categories = await prisma.subjectCategory.findMany({
    where: { schoolId: school.id },
    orderBy: { order: "asc" },
  });

  expect(categories).toHaveLength(DEFAULT_SUBJECT_CATEGORIES.length);
  expect(categories.map((c) => c.name)).toEqual(DEFAULT_SUBJECT_CATEGORIES);
  expect(categories.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]);

  // Cleanup
  await prisma.subjectCategory.deleteMany({ where: { schoolId: school.id } });
  await prisma.school.delete({ where: { id: school.id } });
});
