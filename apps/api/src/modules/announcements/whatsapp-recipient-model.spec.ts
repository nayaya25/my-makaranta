/**
 * Engagement EN-2 Task 1 — AnnouncementRecipient.whatsappSent column
 *
 * Tests:
 *   1. A newly created AnnouncementRecipient defaults whatsappSent to false.
 *   2. whatsappSent can be set to true (delivery-tracking update).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("AnnouncementRecipient.whatsappSent (EN-2 Task 1)", () => {
  const testSchoolIds: string[] = [];

  afterAll(async () => {
    await prisma.announcementRecipient.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.announcement.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
    await prisma.$disconnect();
  });

  async function makeSchoolAndAnnouncement(ts: number) {
    const school = await prisma.school.create({
      data: { name: `WaRecip-${ts}`, slug: `wa-recip-${ts}` } as never,
    });
    testSchoolIds.push(school.id);

    const announcement = await prisma.announcement.create({
      data: {
        schoolId: school.id,
        authorId: `user-author-${ts}`,
        title: "WhatsApp Column Test",
        body: "Testing whatsappSent column.",
        audienceType: "ALL",
        audienceIds: [],
        channels: ["WHATSAPP"],
      },
    });

    return { schoolId: school.id, announcementId: announcement.id };
  }

  it("defaults whatsappSent to false on create", async () => {
    const ts = Date.now();
    const { schoolId, announcementId } = await makeSchoolAndAnnouncement(ts);

    const recipient = await prisma.announcementRecipient.create({
      data: {
        schoolId,
        announcementId,
        recipientType: "PARENT",
        recipientId: `parent-${ts}`,
      },
    });

    expect(recipient.whatsappSent).toBe(false);
  });

  it("can be set to true", async () => {
    const ts = Date.now() + 1;
    const { schoolId, announcementId } = await makeSchoolAndAnnouncement(ts);

    const recipient = await prisma.announcementRecipient.create({
      data: {
        schoolId,
        announcementId,
        recipientType: "PARENT",
        recipientId: `parent-${ts}`,
      },
    });

    const updated = await prisma.announcementRecipient.update({
      where: { id: recipient.id },
      data: { whatsappSent: true },
    });

    expect(updated.whatsappSent).toBe(true);
  });
});
