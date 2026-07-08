/**
 * Engagement EN-1 Task 5 — Scheduled announcements
 *
 * Tests:
 *   1. create() with a future scheduledFor -> status SCHEDULED, NOT delivered now.
 *   2. dispatchScheduledAnnouncements(now >= scheduledFor) -> delivered + status SENT.
 *   3. A still-future scheduled announcement is untouched by dispatch.
 *   4. Normal create (no scheduledFor) delivers immediately + status SENT (regression).
 *   5. dispatchScheduledAnnouncements is idempotent (second run doesn't resend).
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

describe("AnnouncementsService — scheduled announcements (EN-1 Task 5)", () => {
  let service: AnnouncementsService;
  let sms: SmsService;
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
      data: { name: `SchedAnn-${ts}`, slug: `sched-ann-${ts}` } as never,
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
    email = new LogEmailAdapter();
    const whatsappSvc = new WhatsAppService();
    const preferences = new PreferenceService(prisma as unknown as PrismaService);
    const dispatch = new NotificationDispatchService(sms, email, whatsappSvc);
    service = new AnnouncementsService(prisma as unknown as PrismaService, sms, whatsappSvc, email, preferences, dispatch);

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

  it("create() with a future scheduledFor persists status SCHEDULED and does NOT deliver now", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0900${ts}`.slice(0, 14), `SA-FUT-${ts}`);

    const smsSpy = jest.spyOn(sms, "send");
    const emailCountBefore = email.sent.length;

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await asSchool(() =>
      service.create(
        { title: "Future Notice", body: "This is scheduled.", audienceType: "ALL", channels: ["SMS", "EMAIL"], scheduledFor: future },
        authorUser,
      ),
    );

    expect(result.recipientCount).toBeGreaterThan(0);

    const ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann).not.toBeNull();
    expect(ann!.status).toBe("SCHEDULED");
    expect(ann!.scheduledFor).not.toBeNull();

    expect(smsSpy).not.toHaveBeenCalled();
    expect(email.sent.length).toBe(emailCountBefore);

    smsSpy.mockRestore();
  });

  it("dispatchScheduledAnnouncements(now >= scheduledFor) delivers it and flips status to SENT", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0901${ts}`.slice(0, 14), `SA-DUE-${ts}`);

    const smsSpy = jest.spyOn(sms, "send");
    const emailCountBefore = email.sent.length;

    const nearFuture = new Date(Date.now() + 1000).toISOString();

    const result = await asSchool(() =>
      service.create(
        { title: "Due Notice", body: "This will be dispatched.", audienceType: "ALL", channels: ["SMS", "EMAIL"], scheduledFor: nearFuture },
        authorUser,
      ),
    );

    let ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SCHEDULED");
    expect(smsSpy).not.toHaveBeenCalled();

    // Dispatch with "now" past the scheduledFor time.
    const dispatchNow = new Date(Date.now() + 5000);
    await service.dispatchScheduledAnnouncements(dispatchNow);

    ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SENT");
    expect(smsSpy).toHaveBeenCalled();
    expect(email.sent.length).toBeGreaterThan(emailCountBefore);

    smsSpy.mockRestore();
  });

  it("a still-future scheduled announcement is untouched by dispatch", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0902${ts}`.slice(0, 14), `SA-STILLFUT-${ts}`);

    const smsSpy = jest.spyOn(sms, "send");

    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const result = await asSchool(() =>
      service.create(
        { title: "Far Future Notice", body: "Not yet.", audienceType: "ALL", channels: ["SMS"], scheduledFor: farFuture },
        authorUser,
      ),
    );

    await service.dispatchScheduledAnnouncements(new Date());

    const ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SCHEDULED");
    expect(smsSpy).not.toHaveBeenCalled();

    smsSpy.mockRestore();
  });

  it("normal create (no scheduledFor) delivers immediately and status stays SENT (regression)", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0903${ts}`.slice(0, 14), `SA-NOW-${ts}`);

    const smsSpy = jest.spyOn(sms, "send");
    const emailCountBefore = email.sent.length;

    const result = await asSchool(() =>
      service.create(
        { title: "Immediate Notice", body: "Sent right away.", audienceType: "ALL", channels: ["SMS", "EMAIL"] },
        authorUser,
      ),
    );

    const ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SENT");
    expect(ann!.scheduledFor).toBeNull();
    expect(smsSpy).toHaveBeenCalled();
    expect(email.sent.length).toBeGreaterThan(emailCountBefore);

    smsSpy.mockRestore();
  });

  it("dispatchScheduledAnnouncements is idempotent — a second run doesn't resend an already-SENT announcement", async () => {
    const ts = Date.now();
    await makeParentWithChild(`0904${ts}`.slice(0, 14), `SA-IDEMP-${ts}`);

    const smsSpy = jest.spyOn(sms, "send");

    const nearFuture = new Date(Date.now() + 1000).toISOString();

    const result = await asSchool(() =>
      service.create(
        { title: "Idempotent Notice", body: "Only once.", audienceType: "ALL", channels: ["SMS"], scheduledFor: nearFuture },
        authorUser,
      ),
    );

    const dispatchNow = new Date(Date.now() + 5000);
    await service.dispatchScheduledAnnouncements(dispatchNow);

    const callsAfterFirst = smsSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    let ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SENT");

    // Second run — this announcement is now SENT, must not match the SCHEDULED filter again.
    await service.dispatchScheduledAnnouncements(new Date(Date.now() + 10000));

    expect(smsSpy.mock.calls.length).toBe(callsAfterFirst);

    ann = await prisma.announcement.findUnique({ where: { id: result.id } });
    expect(ann!.status).toBe("SENT");

    smsSpy.mockRestore();
  });
});
