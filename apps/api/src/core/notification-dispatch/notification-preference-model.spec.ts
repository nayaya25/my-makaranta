import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "notif-pref-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.notificationPreference.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.parent.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("NotificationPreference model", () => {
  let schoolId: string;
  let parentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Notif Pref School 1", slug: `notif-pref-test-${ts}-1` } as never,
    });
    schoolId = school.id;

    const parent = await prisma.parent.create({
      data: {
        schoolId,
        phone: `080${ts}`,
        firstName: "Test",
        lastName: "Parent",
      },
    });
    parentId = parent.id;
  });

  it("creates a NotificationPreference with default empty arrays", async () => {
    const pref = await prisma.notificationPreference.create({
      data: { schoolId, parentId },
    });

    expect(pref.id).toBeDefined();
    expect(pref.mutedChannels).toEqual([]);
    expect(pref.mutedCategories).toEqual([]);
    expect(pref.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a second NotificationPreference for the same parent — @@unique(parentId)", async () => {
    await expect(
      prisma.notificationPreference.create({
        data: { schoolId, parentId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades delete when the parent is deleted", async () => {
    const ts = Date.now();
    const parent2 = await prisma.parent.create({
      data: {
        schoolId,
        phone: `081${ts}`,
        firstName: "Cascade",
        lastName: "Parent",
      },
    });

    const pref2 = await prisma.notificationPreference.create({
      data: { schoolId, parentId: parent2.id, mutedChannels: ["SMS"], mutedCategories: ["ANNOUNCEMENT"] },
    });
    expect(pref2.mutedChannels).toEqual(["SMS"]);
    expect(pref2.mutedCategories).toEqual(["ANNOUNCEMENT"]);

    await prisma.parent.delete({ where: { id: parent2.id } });

    const found = await prisma.notificationPreference.findUnique({ where: { id: pref2.id } });
    expect(found).toBeNull();
  });
});
