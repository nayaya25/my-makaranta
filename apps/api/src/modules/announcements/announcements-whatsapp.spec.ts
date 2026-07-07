/**
 * Engagement EN-2 Task 3 — Wire WhatsApp into announcements
 *
 * Tests:
 *   1. create() with channels incl WHATSAPP -> whatsapp.send invoked per contact + whatsappSent=true.
 *   2. create() with EMAIL-only channels -> whatsapp.send NOT called (regression).
 *   3. getRecipients(id) returns whatsappCount matching the number with whatsappSent.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { AnnouncementsService } from "./announcements.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const prisma = new PrismaClient();

describe("AnnouncementsService — WhatsApp channel (EN-2 Task 3)", () => {
  let service: AnnouncementsService;
  let sms: SmsService;
  let whatsapp: WhatsAppService;
  let email: LogEmailAdapter;
  let schoolId: string;
  let classLevelId: string;
  let classId: string;
  let termId: string;
  let authorUser: RequestUser;

  const testSchoolIds: string[] = [];

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `WaAnn-${ts}`, slug: `wa-ann-${ts}` } as never,
    });
    schoolId = school.id;
    testSchoolIds.push(schoolId);

    const classLevel = await prisma.classLevel.create({ data: { schoolId, name: "JSS 1", order: 1 } });
    classLevelId = classLevel.id;

    const klass = await prisma.class.create({ data: { schoolId, classLevelId, name: "JSS 1A" } });
    classId = klass.id;

    const academicYear = await prisma.academicYear.create({
      data: { schoolId, name: `${ts}/2027`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
    });

    const term = await prisma.term.create({
      data: { schoolId, academicYearId: academicYear.id, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15"), isCurrent: true },
    });
    termId = term.id;

    sms = new SmsService();
    whatsapp = new WhatsAppService();
    email = new LogEmailAdapter();
    service = new AnnouncementsService(prisma as unknown as PrismaService, sms, whatsapp, email);

    authorUser = { id: `user-author-${ts}`, schoolId, identityType: "STAFF" };
  });

  afterAll(async () => {
    await prisma.announcementRecipient.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.announcement.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.guardian.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.enrollment.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.parent.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.class.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
    await prisma.$disconnect();
  });

  const asSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId: null }, fn);

  async function makeParentWithChild(phone: string, admissionNo: string): Promise<string> {
    const student = await prisma.student.create({
      data: { schoolId, admissionNo, firstName: "Test", lastName: "Student", gender: "FEMALE", dateOfBirth: new Date("2015-01-01") },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, classId, termId } });
    const parent = await prisma.parent.create({
      data: { schoolId, phone, email: `${phone}@example.com`, firstName: "Parent", lastName: phone, preferredLang: "EN" },
    });
    await prisma.guardian.create({ data: { studentId: student.id, parentId: parent.id, relationship: "MOTHER", isPrimary: true } });
    return parent.id;
  }

  it("create() with channels incl WHATSAPP invokes whatsapp.send per contact and sets whatsappSent=true", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0910${ts}`.slice(0, 14), `WA-INCL-${ts}`);

    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "WhatsApp Notice", body: "Sent via WhatsApp.", audienceType: "ALL", channels: ["SMS", "WHATSAPP"] },
        authorUser,
      ),
    );

    expect(result.recipientCount).toBeGreaterThan(0);
    expect(whatsappSpy).toHaveBeenCalled();

    const recipients = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: result.id } });
    expect(recipients.length).toBeGreaterThan(0);
    for (const r of recipients) expect(r.whatsappSent).toBe(true);

    const ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.channels).toContain("WHATSAPP");

    whatsappSpy.mockRestore();
  });

  it("create() with EMAIL-only channels does NOT call whatsapp.send (regression)", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0911${ts}`.slice(0, 14), `WA-EMAILONLY-${ts}`);

    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "Email Only Notice", body: "Email channel only.", audienceType: "ALL", channels: ["EMAIL"] },
        authorUser,
      ),
    );

    expect(whatsappSpy).not.toHaveBeenCalled();

    const recipients = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: result.id } });
    expect(recipients.length).toBeGreaterThan(0);
    for (const r of recipients) expect(r.whatsappSent).toBe(false);

    whatsappSpy.mockRestore();
  });

  it("getRecipients(id) returns whatsappCount matching the number of recipients with whatsappSent", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0912${ts}`.slice(0, 14), `WA-COUNT-${ts}`);

    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "Count Notice", body: "Checking whatsappCount.", audienceType: "ALL", channels: ["WHATSAPP"] },
        authorUser,
      ),
    );

    const detail = await asSchool(() => service.getRecipients(result.id));

    const expectedCount = detail.recipients.filter((r) => r.whatsappSent).length;
    expect(detail.aggregates.whatsappCount).toBe(expectedCount);
    expect(detail.aggregates.whatsappCount).toBeGreaterThan(0);

    whatsappSpy.mockRestore();
  });
});
