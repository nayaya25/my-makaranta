/**
 * Integration tests for SubjectCategoriesService + subject categoryId validation.
 * Runs against the local test DB.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { SubjectCategoriesService } from "./subject-categories.service";
import { SubjectsService } from "./subjects.service";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";

const prisma = new PrismaClient();

function makeCatService(): SubjectCategoriesService {
  return new SubjectCategoriesService(prisma as unknown as PrismaService);
}

function makeSubjectService(catService: SubjectCategoriesService): SubjectsService {
  return new SubjectsService(prisma as unknown as PrismaService, catService);
}

/** Run fn inside a TenantContext with the given schoolId. */
function withSchool<T>(schoolId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ schoolId, userId: null }, fn);
}

describe("SubjectCategoriesService", () => {
  let schoolId: string;
  const svc = makeCatService();

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: "Cat Test School", slug: `cat-test-${Date.now()}` } as never,
    });
    schoolId = school.id;
  });

  afterAll(async () => {
    await prisma.subject.deleteMany({ where: { schoolId } });
    await prisma.subjectCategory.deleteMany({ where: { schoolId } });
    await prisma.school.delete({ where: { id: schoolId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("list() lazy-seeds and returns 6 default categories", async () => {
    const cats = await withSchool(schoolId, () => svc.list());
    expect(cats).toHaveLength(6);
    expect(cats.at(0)?.name).toBe("General");
    expect(cats.at(5)?.name).toBe("Religious");
    expect(cats.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("list() is idempotent — second call returns same 6", async () => {
    const cats = await withSchool(schoolId, () => svc.list());
    expect(cats).toHaveLength(6);
  });

  it("create() adds a new category", async () => {
    const cat = await withSchool(schoolId, () => svc.create({ name: "Tech", order: 7 }));
    expect(cat.name).toBe("Tech");
    expect(cat.order).toBe(7);
    expect(cat.schoolId).toBe(schoolId);
  });

  it("update() patches an existing category", async () => {
    const cats = await withSchool(schoolId, () => svc.list());
    const first = cats.at(0)!;
    const updated = await withSchool(schoolId, () =>
      svc.update(first.id, { name: "General (Updated)" }),
    );
    expect(updated.name).toBe("General (Updated)");
    // Restore
    await withSchool(schoolId, () => svc.update(first.id, { name: "General" }));
  });

  it("update() throws NotFoundException for a foreign-school id", async () => {
    await expect(
      withSchool(schoolId, () => svc.update("non-existent-id", { name: "X" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("remove() deletes a category", async () => {
    const cat = await withSchool(schoolId, () => svc.create({ name: "ToDelete" }));
    await withSchool(schoolId, () => svc.remove(cat.id));
    const cats = await withSchool(schoolId, () => svc.list());
    expect(cats.find((c) => c.id === cat.id)).toBeUndefined();
  });

  it("remove() throws NotFoundException for unknown id", async () => {
    await expect(
      withSchool(schoolId, () => svc.remove("unknown-id")),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("SubjectsService — categoryId validation", () => {
  let schoolAId: string;
  let schoolBId: string;
  let catInSchoolA: { id: string };
  const catSvc = makeCatService();
  const subjectSvc = makeSubjectService(catSvc);

  beforeAll(async () => {
    const ts = Date.now();
    const schoolA = await prisma.school.create({
      data: { name: "SubjA", slug: `subj-a-${ts}` } as never,
    });
    const schoolB = await prisma.school.create({
      data: { name: "SubjB", slug: `subj-b-${ts}` } as never,
    });
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    catInSchoolA = await prisma.subjectCategory.create({
      data: { schoolId: schoolAId, name: "Sciences", order: 1 },
    });
  });

  afterAll(async () => {
    await prisma.subject.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
    await prisma.subjectCategory.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
  });

  it("creates a subject with a valid categoryId", async () => {
    const subject = await withSchool(schoolAId, () =>
      subjectSvc.create({ name: "Physics", code: "PHY", categoryId: catInSchoolA.id }),
    );
    expect(subject.categoryId).toBe(catInSchoolA.id);
  });

  it("rejects a categoryId that belongs to a different school", async () => {
    await expect(
      withSchool(schoolBId, () =>
        subjectSvc.create({ name: "Maths", code: "MTH", categoryId: catInSchoolA.id }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a subject without categoryId (null)", async () => {
    const subject = await withSchool(schoolAId, () =>
      subjectSvc.create({ name: "History", code: "HIS" }),
    );
    expect(subject.categoryId).toBeNull();
  });
});
