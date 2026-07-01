import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { assertNotReleased } from "./release-lock.util";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("assertNotReleased", () => {
  it("resolves when no Release row exists for (classId, termId)", async () => {
    const school = await prisma.school.create({ data: { name: "LockTest", slug: `lt-${Date.now()}` } as never });
    const level = await prisma.classLevel.create({ data: { schoolId: school.id, name: "JS1", order: 0 } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "JSS 1A", classLevelId: level.id } });
    const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2024/2025", startDate: new Date(), endDate: new Date() } });
    const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() } });

    await expect(assertNotReleased(prisma, klass.id, term.id)).resolves.toBeUndefined();
  });

  it("throws ForbiddenException when a Release row exists", async () => {
    const school = await prisma.school.create({ data: { name: "LockTest2", slug: `lt2-${Date.now()}` } as never });
    const level = await prisma.classLevel.create({ data: { schoolId: school.id, name: "JS1", order: 0 } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "JSS 1A", classLevelId: level.id } });
    const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2024/2025", startDate: new Date(), endDate: new Date() } });
    const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() } });

    const person = await prisma.person.create({ data: {} });
    await prisma.release.create({ data: { schoolId: school.id, classId: klass.id, termId: term.id, releasedBy: person.id } });

    await expect(assertNotReleased(prisma, klass.id, term.id)).rejects.toThrow(ForbiddenException);
    await expect(assertNotReleased(prisma, klass.id, term.id)).rejects.toThrow("Results released — locked.");
  });

  it("does not throw when a Release exists for a different (classId, termId) pair", async () => {
    const school = await prisma.school.create({ data: { name: "LockTest3", slug: `lt3-${Date.now()}` } as never });
    const level = await prisma.classLevel.create({ data: { schoolId: school.id, name: "JS1", order: 0 } });
    const klass1 = await prisma.class.create({ data: { schoolId: school.id, name: "JSS 1A", classLevelId: level.id } });
    const klass2 = await prisma.class.create({ data: { schoolId: school.id, name: "JSS 1B", classLevelId: level.id } });
    const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2024/2025", startDate: new Date(), endDate: new Date() } });
    const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() } });

    const person = await prisma.person.create({ data: {} });
    await prisma.release.create({ data: { schoolId: school.id, classId: klass1.id, termId: term.id, releasedBy: person.id } });

    // klass2 + same term → no release row → should resolve
    await expect(assertNotReleased(prisma, klass2.id, term.id)).resolves.toBeUndefined();
  });
});
