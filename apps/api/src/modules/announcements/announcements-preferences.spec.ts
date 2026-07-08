/**
 * Engagement EN-3a Task 4 — announcements respect parent NotificationPreference
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest announcements-preferences --runInBand
 *
 * Tests:
 *   1. A parent muting ANNOUNCEMENT -> not delivered to them (no smsSent/emailSent/whatsappSent),
 *      but delivered to another parent AND to STAFF (staff never filtered).
 *   2. A parent muting WHATSAPP still gets SMS/EMAIL.
 *   3. getRecipients() aggregate counts reflect actual sends (post-filtering).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { NotificationDispatchService } from "../../core/notification-dispatch/notification-dispatch.service";
import { AnnouncementsService } from "./announcements.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const prisma = new PrismaClient();

describe("AnnouncementsService — notification preferences (EN-3a Task 4)", () => {
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
      data: { name: `PrefAnn-${ts}`, slug: `pref-ann-${ts}` } as never,
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
    const preferences = new PreferenceService(prisma as unknown as PrismaService);
    const dispatch = new NotificationDispatchService(sms, email, whatsapp);
    service = new AnnouncementsService(prisma as unknown as PrismaService, sms, whatsapp, email, preferences, dispatch);

    authorUser = { id: `user-author-${ts}`, schoolId, identityType: "STAFF" };
  });

  afterAll(async () => {
    await prisma.announcementRecipient.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.announcement.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.notificationPreference.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.guardian.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.enrollment.deleteMany({ where: { student: { schoolId: { in: testSchoolIds } } } });
    await prisma.staff.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.parent.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.class.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  async function makeStaff(phone: string): Promise<string> {
    const staff = await prisma.staff.create({
      data: { schoolId, staffNo: `ST-${phone}`, phone, email: `${phone}@example.com`, firstName: "Staff", lastName: phone },
    });
    return staff.id;
  }

  it("a parent muting ANNOUNCEMENT is not delivered to, but another parent and STAFF still are", async () => {
    const ts = Date.now();
    const mutedPhone = `0920${ts}`.slice(0, 14);
    const okPhone = `0921${ts}`.slice(0, 14);
    const mutedParentId = await makeParentWithChild(mutedPhone, `PREF-MUTED-${ts}`);
    await makeParentWithChild(okPhone, `PREF-OK-${ts}`);
    const staffId = await makeStaff(`0922${ts}`.slice(0, 14));

    await prisma.notificationPreference.create({
      data: { schoolId, parentId: mutedParentId, mutedCategories: ["ANNOUNCEMENT"] },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "Muted Notice", body: "Should skip muted parent.", audienceType: "ALL", roles: ["PARENT", "STAFF"], channels: ["SMS", "EMAIL"] },
        authorUser,
      ),
    );

    expect(result.recipientCount).toBeGreaterThan(0);

    const calledPhones = smsSpy.mock.calls.map((c) => c[0]);
    expect(calledPhones).not.toContain(mutedPhone);
    expect(calledPhones).toContain(okPhone);

    const recipients = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: result.id } });
    const mutedRow = recipients.find((r) => r.recipientType === "PARENT" && r.recipientId === mutedParentId);
    expect(mutedRow).toBeDefined();
    expect(mutedRow!.smsSent).toBe(false);
    expect(mutedRow!.emailSent).toBe(false);
    expect(mutedRow!.whatsappSent).toBe(false);

    const okRow = recipients.find((r) => r.recipientType === "PARENT" && r.recipientId !== mutedParentId);
    expect(okRow).toBeDefined();
    expect(okRow!.smsSent).toBe(true);

    const staffRow = recipients.find((r) => r.recipientType === "STAFF" && r.recipientId === staffId);
    expect(staffRow).toBeDefined();
    expect(staffRow!.smsSent).toBe(true);
  });

  it("a parent muting WHATSAPP still gets SMS/EMAIL", async () => {
    const ts = Date.now();
    const phone = `0923${ts}`.slice(0, 14);
    const parentId = await makeParentWithChild(phone, `PREF-WAMUTE-${ts}`);

    await prisma.notificationPreference.create({
      data: { schoolId, parentId, mutedChannels: ["WHATSAPP"] },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "WA Muted Notice", body: "Should still SMS/email.", audienceType: "ALL", channels: ["SMS", "EMAIL", "WHATSAPP"] },
        authorUser,
      ),
    );

    const calledPhones = smsSpy.mock.calls.map((c) => c[0]);
    expect(calledPhones).toContain(phone);
    expect(whatsappSpy.mock.calls.map((c) => c[0])).not.toContain(phone);

    const recipients = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: result.id } });
    const row = recipients.find((r) => r.recipientType === "PARENT" && r.recipientId === parentId);
    expect(row).toBeDefined();
    expect(row!.smsSent).toBe(true);
    expect(row!.emailSent).toBe(true);
    expect(row!.whatsappSent).toBe(false);
  });

  it("getRecipients() aggregate counts reflect actual sends after preference filtering", async () => {
    const ts = Date.now();
    const mutedPhone = `0924${ts}`.slice(0, 14);
    const okPhone = `0925${ts}`.slice(0, 14);
    const mutedParentId = await makeParentWithChild(mutedPhone, `PREF-COUNT-MUTED-${ts}`);
    await makeParentWithChild(okPhone, `PREF-COUNT-OK-${ts}`);

    await prisma.notificationPreference.create({
      data: { schoolId, parentId: mutedParentId, mutedCategories: ["ANNOUNCEMENT"] },
    });

    jest.spyOn(sms, "send").mockResolvedValue(undefined);

    const result = await asSchool(() =>
      service.create(
        { title: "Count Notice", body: "Checking aggregate counts.", audienceType: "ALL", channels: ["SMS"] },
        authorUser,
      ),
    );

    const detail = await asSchool(() => service.getRecipients(result.id));
    const expectedSmsCount = detail.recipients.filter((r) => r.smsSent).length;
    expect(detail.aggregates.smsCount).toBe(expectedSmsCount);
    expect(detail.aggregates.smsCount).toBeGreaterThan(0);
    // muted parent must not count toward smsCount
    const mutedDetailRow = detail.recipients.find((r) => r.recipientType === "PARENT" && r.recipientId === mutedParentId);
    expect(mutedDetailRow?.smsSent).toBe(false);
  });
});
