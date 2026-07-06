import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "notifications-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.notificationLog.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.notificationSettings.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.announcement.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("Notification models", () => {
  let schoolId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Notifications School 1", slug: `notifications-test-${ts}-1` } as never,
    });
    schoolId = school.id;
  });

  it("creates NotificationSettings with defaults (reminderOffsetDays=[-3,0,3], channels=[SMS,EMAIL])", async () => {
    const settings = await prisma.notificationSettings.create({
      data: { schoolId },
    });

    expect(settings.id).toBeDefined();
    expect(settings.feeRemindersEnabled).toBe(true);
    expect(settings.reminderOffsetDays).toEqual([-3, 0, 3]);
    expect(settings.resultsReadyEnabled).toBe(true);
    expect(settings.channels).toEqual(["SMS", "EMAIL"]);
  });

  it("rejects a second NotificationSettings for the same school — @@unique([schoolId])", async () => {
    await expect(
      prisma.notificationSettings.create({
        data: { schoolId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("creates a NotificationLog", async () => {
    const log = await prisma.notificationLog.create({
      data: {
        schoolId,
        kind: "FEE_REMINDER",
        dedupeKey: "FEE_REMINDER:inst_1:-3:2026-07-10",
      },
    });

    expect(log.id).toBeDefined();
    expect(log.recipientCount).toBe(0);
    expect(log.channels).toBe("");
  });

  it("rejects a duplicate (schoolId, dedupeKey) — @@unique([schoolId,dedupeKey])", async () => {
    await expect(
      prisma.notificationLog.create({
        data: {
          schoolId,
          kind: "FEE_REMINDER",
          dedupeKey: "FEE_REMINDER:inst_1:-3:2026-07-10",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows the same dedupeKey for a different school (scoped uniqueness)", async () => {
    const ts = Date.now();
    const school2 = await prisma.school.create({
      data: { name: "Notifications School 2", slug: `notifications-test-${ts}-2` } as never,
    });

    const log = await prisma.notificationLog.create({
      data: {
        schoolId: school2.id,
        kind: "FEE_REMINDER",
        dedupeKey: "FEE_REMINDER:inst_1:-3:2026-07-10",
      },
    });
    expect(log.id).toBeDefined();

    // cleanup this ad-hoc school explicitly (not caught by the -test- slug prefix filter above is fine, but keep clean)
    await prisma.notificationLog.deleteMany({ where: { schoolId: school2.id } });
    await prisma.school.delete({ where: { id: school2.id } });
  });

  it("an existing Announcement reads status=\"SENT\" by default", async () => {
    const announcement = await prisma.announcement.create({
      data: {
        schoolId,
        authorId: "staff_1",
        title: "Test announcement",
        body: "Hello parents",
        audienceType: "ALL",
        audienceIds: [],
        channels: ["IN_APP"],
      },
    });

    expect(announcement.status).toBe("SENT");
    expect(announcement.scheduledFor).toBeNull();
  });
});
