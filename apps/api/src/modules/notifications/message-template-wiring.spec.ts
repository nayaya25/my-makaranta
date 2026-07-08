/**
 * Engagement EN-3b Task 3 — the 3 send sites render via MessageTemplateService
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest message-template-wiring --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { NotificationDispatchService } from "../../core/notification-dispatch/notification-dispatch.service";
import { MessageTemplateService } from "../../core/notification-dispatch/message-template.service";
import { NotificationSettingsService } from "./notification-settings.service";
import { NotificationsService } from "./notifications.service";
import { CollectionsService } from "../fees/collections.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

function lagosToday(offsetDays = 0): Date {
  const base = new Date();
  const lagos = new Date(base.getTime() + 60 * 60 * 1000);
  lagos.setUTCDate(lagos.getUTCDate() + offsetDays);
  lagos.setUTCHours(12, 0, 0, 0);
  return new Date(lagos.getTime() - 60 * 60 * 1000);
}

function dueDateFor(offsetDays: number): Date {
  const base = new Date();
  const lagos = new Date(base.getTime() + 60 * 60 * 1000);
  lagos.setUTCDate(lagos.getUTCDate() + offsetDays);
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 60 * 60 * 1000);
}

type Fixture = {
  schoolId: string;
  classLevelId: string;
  classId: string;
  academicYearId: string;
  termId: string;
};

async function seedSchool(suffix: string): Promise<Fixture> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const school = await rawPrisma.school.create({
    data: { name: `MTW-${suffix}-${ts}`, slug: `mtw-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  const classLevel = await rawPrisma.classLevel.create({
    data: { schoolId: school.id, name: "JSS 1", order: 1 },
  });
  const klass = await rawPrisma.class.create({
    data: { schoolId: school.id, classLevelId: classLevel.id, name: "JSS 1A" },
  });
  const academicYear = await rawPrisma.academicYear.create({
    data: { schoolId: school.id, name: `${ts}/YR`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
  });
  const term = await rawPrisma.term.create({
    data: { schoolId: school.id, academicYearId: academicYear.id, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
  });
  return { schoolId: school.id, classLevelId: classLevel.id, classId: klass.id, academicYearId: academicYear.id, termId: term.id };
}

async function makeStudentWithGuardian(fx: Fixture, admissionNo: string, phone: string, email: string | null) {
  const student = await rawPrisma.student.create({
    data: {
      schoolId: fx.schoolId,
      admissionNo,
      firstName: "Amina",
      lastName: "Bello",
      gender: "FEMALE",
      dateOfBirth: new Date("2015-01-01"),
    },
  });
  await rawPrisma.enrollment.create({ data: { studentId: student.id, classId: fx.classId, termId: fx.termId } });
  const parent = await rawPrisma.parent.create({
    data: { schoolId: fx.schoolId, phone, email: email ?? undefined, firstName: "Parent", lastName: "Guardian" },
  });
  await rawPrisma.guardian.create({
    data: { studentId: student.id, parentId: parent.id, relationship: "FATHER", isPrimary: true },
  });
  return student.id;
}

async function cleanupFixture(fx: Fixture) {
  await rawPrisma.notificationLog.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.notificationSettings.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.messageTemplate.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.feeReminder.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.installment.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.invoice.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.guardian.deleteMany({ where: { student: { schoolId: fx.schoolId } } }).catch(() => undefined);
  await rawPrisma.parent.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.enrollment.deleteMany({ where: { student: { schoolId: fx.schoolId } } }).catch(() => undefined);
  await rawPrisma.student.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.class.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.term.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.academicYear.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.classLevel.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: fx.schoolId } }).catch(() => undefined);
}

let sms: SmsService;
let whatsapp: WhatsAppService;
let emailAdapter: LogEmailAdapter;
let settingsService: NotificationSettingsService;
let preferences: PreferenceService;
let dispatch: NotificationDispatchService;
let templates: MessageTemplateService;
let notifications: NotificationsService;
let collections: CollectionsService;
const fixtures: Fixture[] = [];
const actor = { id: "tester-staff-id" } as RequestUser;

beforeAll(() => {
  sms = new SmsService();
  whatsapp = new WhatsAppService();
  emailAdapter = new LogEmailAdapter();
  settingsService = new NotificationSettingsService(prisma);
  preferences = new PreferenceService(prisma);
  dispatch = new NotificationDispatchService(sms, emailAdapter, whatsapp);
  templates = new MessageTemplateService(prisma);
  notifications = new NotificationsService(prisma, sms, whatsapp, emailAdapter, settingsService, preferences, dispatch, templates);
  collections = new CollectionsService(prisma, settingsService, preferences, dispatch, templates);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const fx of fixtures) await cleanupFixture(fx);
  await rawPrisma.$disconnect();
});

describe("message templates wired into the 3 send sites (EN-3b Task 3)", () => {
  it("fee installment reminder default text matches today's exact wording", async () => {
    const fx = await seedSchool("installment");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `MTW-INST-${Date.now()}`, "+2348050000001", "inst@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await notifications.runFeeReminders(lagosToday(0));

    const dueDateStr = dueDate.toISOString().slice(0, 10);
    expect(smsSpy).toHaveBeenCalledWith(
      "+2348050000001",
      `Dear Parent, Amina Bello's fees installment of ₦1,000 is due ${dueDateStr}. Kindly settle it. Thank you.`,
    );
  });

  it("the automated NO-SCHEDULE reminder now renders FEE_INSTALLMENT_REMINDER wording (not 'fees balance')", async () => {
    const fx = await seedSchool("noschedule");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `MTW-NOSCHED-${Date.now()}`, "+2348050000002", "nosched@example.com");
    const dueDate = dueDateFor(0);
    await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 50000, paidKobo: 0, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await notifications.runFeeReminders(lagosToday(0));

    expect(smsSpy).toHaveBeenCalledTimes(1);
    const [, sentMessage] = smsSpy.mock.calls[0]!;
    expect(sentMessage).toContain("fees installment");
    expect(sentMessage).toContain("is due");
    expect(sentMessage).not.toContain("fees balance");
  });

  it("results-ready default text matches today's exact wording", async () => {
    const fx = await seedSchool("results-default");
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `MTW-RR-${Date.now()}`, "+2348050000003", "rr@example.com");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await notifications.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    expect(smsSpy).toHaveBeenCalledWith(
      "+2348050000003",
      "Dear Parent, Amina Bello's results are now ready. Please log in to view the report card.",
    );

    await rawPrisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
  });

  it("a customized RESULTS_READY template changes the sent message", async () => {
    const fx = await seedSchool("results-custom");
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `MTW-RRCUSTOM-${Date.now()}`, "+2348050000004", "rrcustom@example.com");
    await templates.set(fx.schoolId, "RESULTS_READY", "Results out for {{studentName}}");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await notifications.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    expect(smsSpy).toHaveBeenCalledWith("+2348050000004", "Results out for Amina Bello");

    await rawPrisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
  });

  it("collections balance reminder default text matches today's exact wording", async () => {
    const fx = await seedSchool("collections");
    fixtures.push(fx);

    const student = await rawPrisma.student.create({
      data: {
        schoolId: fx.schoolId,
        admissionNo: `MTW-COLL-${Date.now()}`,
        firstName: "Amina",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2015-01-01"),
      },
    });
    const parent = await rawPrisma.parent.create({
      data: { schoolId: fx.schoolId, phone: "+2348050000005", email: "coll@example.com", firstName: "Parent", lastName: "Guardian" },
    });
    await rawPrisma.guardian.create({
      data: { studentId: student.id, parentId: parent.id, relationship: "FATHER", isPrimary: true },
    });
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId: student.id, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 40000 },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);

    await TenantContext.run({ schoolId: fx.schoolId, userId: null }, async () => {
      await collections.sendReminder(invoice.id, actor);
    });

    const term = await rawPrisma.term.findFirst({ where: { id: fx.termId }, include: { academicYear: { select: { name: true } } } });
    const termLabel = `${term!.academicYear.name} · Term ${term!.number}`;
    expect(smsSpy).toHaveBeenCalledWith(
      "+2348050000005",
      `Dear Parent, Amina Bello's ${termLabel} fees balance is ₦600. Kindly settle it. Thank you.`,
    );
  });
});
