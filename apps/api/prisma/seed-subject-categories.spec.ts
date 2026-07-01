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

it("fills in missing categories when a school already has some defaults", async () => {
  const school = await prisma.school.create({
    data: { name: "Partial Cat School", slug: `partial-cat-${Date.now()}` } as never,
  });

  // Pre-seed only the first 3 default categories
  const firstThree = DEFAULT_SUBJECT_CATEGORIES.slice(0, 3);
  await prisma.subjectCategory.createMany({
    data: firstThree.map((name, i) => ({ schoolId: school.id, name, order: i + 1 })),
  });

  // seedSubjectCategories should create the remaining 3
  await seedSubjectCategories(prisma, school.id);

  const categories = await prisma.subjectCategory.findMany({
    where: { schoolId: school.id },
  });

  expect(categories).toHaveLength(DEFAULT_SUBJECT_CATEGORIES.length);
  const names = categories.map((c) => c.name).sort();
  expect(names).toEqual([...DEFAULT_SUBJECT_CATEGORIES].sort());

  // Cleanup
  await prisma.subjectCategory.deleteMany({ where: { schoolId: school.id } });
  await prisma.school.delete({ where: { id: school.id } });
});
