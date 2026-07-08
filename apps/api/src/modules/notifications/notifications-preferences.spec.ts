/**
 * Engagement EN-3a Task 3 — automated notifications respect parent NotificationPreference
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest notifications-preferences --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { NotificationDispatchService } from "../../core/notification-dispatch/notification-dispatch.service";
import { NotificationSettingsService } from "./notification-settings.service";
import { NotificationsService } from "./notifications.service";

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
    data: { name: `NP-${suffix}-${ts}`, slug: `np-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
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
  return { studentId: student.id, parentId: parent.id };
}

async function cleanupFixture(fx: Fixture) {
  await rawPrisma.notificationLog.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.notificationSettings.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.release.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.installment.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.invoice.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.guardian.deleteMany({ where: { student: { schoolId: fx.schoolId } } }).catch(() => undefined);
  await rawPrisma.notificationPreference.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
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
let service: NotificationsService;
const fixtures: Fixture[] = [];

beforeAll(() => {
  sms = new SmsService();
  whatsapp = new WhatsAppService();
  emailAdapter = new LogEmailAdapter();
  settingsService = new NotificationSettingsService(prisma);
  preferences = new PreferenceService(prisma);
  dispatch = new NotificationDispatchService(sms, emailAdapter, whatsapp);
  service = new NotificationsService(prisma, sms, whatsapp, emailAdapter, settingsService, preferences, dispatch);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const fx of fixtures) await cleanupFixture(fx);
  await rawPrisma.$disconnect();
});

describe("NotificationsService — fee reminders respect NotificationPreference", () => {
  it("a parent muting SMS gets the fee reminder on EMAIL/WHATSAPP only, and NotificationLog.channels excludes SMS", async () => {
    const fx = await seedSchool("mute-sms");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL", "WHATSAPP"] });

    const { parentId, studentId } = await makeStudentWithGuardian(
      fx,
      `NP-MUTESMS-${Date.now()}`,
      "+2348030000001",
      "np-mutesms@example.com",
    );
    await rawPrisma.notificationPreference.create({
      data: { schoolId: fx.schoolId, parentId, mutedChannels: ["SMS"] },
    });

    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).toHaveBeenCalledWith("+2348030000001", expect.any(String));
    expect(emailAdapter.sent.some((m) => m.to === "np-mutesms@example.com")).toBe(true);

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.channels).not.toContain("SMS");
    expect(logs[0]!.channels).toContain("EMAIL");
    expect(logs[0]!.channels).toContain("WHATSAPP");
  });

  it("a parent muting FEE_REMINDER category receives nothing", async () => {
    const fx = await seedSchool("mute-category");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL", "WHATSAPP"] });

    const { parentId, studentId } = await makeStudentWithGuardian(
      fx,
      `NP-MUTECAT-${Date.now()}`,
      "+2348030000002",
      "np-mutecat@example.com",
    );
    await rawPrisma.notificationPreference.create({
      data: { schoolId: fx.schoolId, parentId, mutedCategories: ["FEE_REMINDER"] },
    });

    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);
    const emailCountBefore = emailAdapter.sent.length;

    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
    expect(emailAdapter.sent.length).toBe(emailCountBefore);

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.recipientCount).toBe(0);
    expect(logs[0]!.channels).toBe("");
  });
});

describe("NotificationsService.notifyResultsReady respects RESULTS_READY mute", () => {
  it("a parent muting RESULTS_READY receives nothing while other guardians still do", async () => {
    const fx = await seedSchool("rr-mute");
    fixtures.push(fx);

    const muted = await makeStudentWithGuardian(fx, `NP-RRMUTE-${Date.now()}`, "+2348030000003", "np-rrmute@example.com");
    await makeStudentWithGuardian(fx, `NP-RROK-${Date.now()}`, "+2348030000004", "np-rrok@example.com");

    await rawPrisma.notificationPreference.create({
      data: { schoolId: fx.schoolId, parentId: muted.parentId, mutedCategories: ["RESULTS_READY"] },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await service.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    const calledPhones = smsSpy.mock.calls.map((c) => c[0]);
    expect(calledPhones).not.toContain("+2348030000003");
    expect(calledPhones).toContain("+2348030000004");
    expect(emailAdapter.sent.some((m) => m.to === "np-rrmute@example.com")).toBe(false);
    expect(emailAdapter.sent.some((m) => m.to === "np-rrok@example.com")).toBe(true);

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "RESULTS_READY" } });
    expect(logs.length).toBe(2);
    const mutedLog = logs.find((l) => l.dedupeKey === `RESULTS_READY:${release.id}:${muted.studentId}`);
    expect(mutedLog?.recipientCount).toBe(0);
  });
});
