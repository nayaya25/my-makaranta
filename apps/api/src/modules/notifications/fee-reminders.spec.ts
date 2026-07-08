/**
 * Integration test: NotificationsService.runFeeReminders (EN-1 Task 3)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest fee-reminders --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { EMAIL_SERVICE } from "../../core/email/email.types";
import { NotificationSettingsService } from "./notification-settings.service";
import { NotificationsService } from "./notifications.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

function lagosToday(offsetDays = 0): Date {
  // "now" such that lagosDateStr(now) === today (Lagos) + offsetDays.
  const base = new Date();
  const lagos = new Date(base.getTime() + 60 * 60 * 1000);
  lagos.setUTCDate(lagos.getUTCDate() + offsetDays);
  lagos.setUTCHours(12, 0, 0, 0); // safely mid-day so the +1h Lagos shift never rolls the date
  return new Date(lagos.getTime() - 60 * 60 * 1000);
}

function dueDateFor(offsetDays: number): Date {
  // A DateTime whose Lagos calendar date equals today+offsetDays (stored at Lagos midnight).
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
    data: { name: `FR-${suffix}-${ts}`, slug: `fr-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
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
let service: NotificationsService;
const fixtures: Fixture[] = [];

beforeAll(() => {
  sms = new SmsService();
  whatsapp = new WhatsAppService();
  emailAdapter = new LogEmailAdapter();
  settingsService = new NotificationSettingsService(prisma);
  service = new NotificationsService(prisma, sms, whatsapp, emailAdapter, settingsService);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const fx of fixtures) await cleanupFixture(fx);
  await rawPrisma.$disconnect();
});

describe("NotificationsService.runFeeReminders", () => {
  it("sends to guardians and logs when an installment is due at a configured offset (today+3)", async () => {
    const fx = await seedSchool("offset3");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `FR-OFF3-${Date.now()}`, "+2348010000001", "parent1@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const now = lagosToday(0);

    await service.runFeeReminders(now);

    expect(smsSpy).toHaveBeenCalledWith("+2348010000001", expect.any(String));
    expect(emailAdapter.sent.some((m) => m.to === "parent1@example.com")).toBe(true);

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.dedupeKey).toContain("FEE_REMINDER:");
    expect(logs[0]!.recipientCount).toBe(1);
  });

  it("does not send or log again on a second run the same day (dedupe)", async () => {
    const fx = await seedSchool("dedupe");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `FR-DEDUPE-${Date.now()}`, "+2348010000002", "parent2@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const now = lagosToday(0);

    await service.runFeeReminders(now);
    const firstCallCount = smsSpy.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    await service.runFeeReminders(now);

    expect(smsSpy.mock.calls.length).toBe(firstCallCount); // no additional sends
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
  });

  it("skips a zero-balance (fully paid) installment", async () => {
    const fx = await seedSchool("zerobal");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `FR-ZERO-${Date.now()}`, "+2348010000003", "parent3@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 100000 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).not.toHaveBeenCalled();
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(0);
  });

  it("does nothing when feeRemindersEnabled=false", async () => {
    const fx = await seedSchool("disabled");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { feeRemindersEnabled: false });

    const studentId = await makeStudentWithGuardian(fx, `FR-DIS-${Date.now()}`, "+2348010000004", "parent4@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).not.toHaveBeenCalled();
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(0);
  });

  it("sends only SMS (no email) when channels=[\"SMS\"]", async () => {
    const fx = await seedSchool("smsonly");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { channels: ["SMS"] });

    const studentId = await makeStudentWithGuardian(fx, `FR-SMSONLY-${Date.now()}`, "+2348010000005", "parent5@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const emailCountBefore = emailAdapter.sent.length;

    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).toHaveBeenCalledWith("+2348010000005", expect.any(String));
    expect(emailAdapter.sent.length).toBe(emailCountBefore); // no new email
  });

  it("reminds off the invoice dueDate when there are no installments", async () => {
    const fx = await seedSchool("noinst");
    fixtures.push(fx);

    const studentId = await makeStudentWithGuardian(fx, `FR-NOINST-${Date.now()}`, "+2348010000006", "parent6@example.com");
    const dueDate = dueDateFor(0);
    await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 50000, paidKobo: 0, dueDate },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await service.runFeeReminders(lagosToday(0));

    expect(smsSpy).toHaveBeenCalledWith("+2348010000006", expect.any(String));
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
  });

  it("cross-tenant: only the due school's guardians are contacted when both schools are processed", async () => {
    const fxA = await seedSchool("tenant-a");
    const fxB = await seedSchool("tenant-b");
    fixtures.push(fxA, fxB);

    const studentA = await makeStudentWithGuardian(fxA, `FR-TA-${Date.now()}`, "+2348010000007", "parentA@example.com");
    const invoiceA = await rawPrisma.invoice.create({
      data: { schoolId: fxA.schoolId, studentId: studentA, termId: fxA.termId, classLevelId: fxA.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    await rawPrisma.installment.create({
      data: { schoolId: fxA.schoolId, invoiceId: invoiceA.id, order: 0, label: "First", amountKobo: 100000, dueDate: dueDateFor(3) },
    });

    // School B: student due far in the future — must not be contacted today.
    const studentB = await makeStudentWithGuardian(fxB, `FR-TB-${Date.now()}`, "+2348010000008", "parentB@example.com");
    const invoiceB = await rawPrisma.invoice.create({
      data: { schoolId: fxB.schoolId, studentId: studentB, termId: fxB.termId, classLevelId: fxB.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    await rawPrisma.installment.create({
      data: { schoolId: fxB.schoolId, invoiceId: invoiceB.id, order: 0, label: "First", amountKobo: 100000, dueDate: dueDateFor(20) },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    await service.runFeeReminders(lagosToday(0));

    const calledPhones = smsSpy.mock.calls.map((c) => c[0]);
    expect(calledPhones).toContain("+2348010000007");
    expect(calledPhones).not.toContain("+2348010000008");

    const logsA = await rawPrisma.notificationLog.findMany({ where: { schoolId: fxA.schoolId, kind: "FEE_REMINDER" } });
    const logsB = await rawPrisma.notificationLog.findMany({ where: { schoolId: fxB.schoolId, kind: "FEE_REMINDER" } });
    expect(logsA.length).toBe(1);
    expect(logsB.length).toBe(0);
  });
});
