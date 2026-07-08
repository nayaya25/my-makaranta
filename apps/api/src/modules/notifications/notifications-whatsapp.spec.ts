/**
 * Engagement EN-2 Task 4 — Wire WhatsApp into notifications (reminders) + settings
 *
 * Tests:
 *   1. runFeeReminders(now) for a school with WHATSAPP in channels -> whatsapp.send invoked
 *      + NotificationLog.channels contains WHATSAPP.
 *   2. runFeeReminders(now) for a school without WHATSAPP -> whatsapp.send NOT called (regression).
 *   3. NotificationSettingsService.update accepts ["SMS","WHATSAPP"], rejects ["SMS","FOO"].
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest notifications-whatsapp --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
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
    data: { name: `WAN-${suffix}-${ts}`, slug: `wan-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
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

describe("NotificationsService.runFeeReminders — WhatsApp channel (EN-2 Task 4)", () => {
  it("invokes whatsapp.send and logs WHATSAPP in NotificationLog.channels when settings.channels includes WHATSAPP", async () => {
    const fx = await seedSchool("wa-enabled");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { channels: ["SMS", "WHATSAPP"] });

    const studentId = await makeStudentWithGuardian(fx, `WAN-ON-${Date.now()}`, "+2348020000001", "wa-parent1@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    await service.runFeeReminders(lagosToday(0));

    expect(whatsappSpy).toHaveBeenCalledWith("+2348020000001", expect.any(String));

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.channels).toContain("WHATSAPP");
  });

  it("does not call whatsapp.send when settings.channels omits WHATSAPP (regression)", async () => {
    const fx = await seedSchool("wa-disabled");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL"] });

    const studentId = await makeStudentWithGuardian(fx, `WAN-OFF-${Date.now()}`, "+2348020000002", "wa-parent2@example.com");
    const invoice = await rawPrisma.invoice.create({
      data: { schoolId: fx.schoolId, studentId, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
    });
    const dueDate = dueDateFor(3);
    await rawPrisma.installment.create({
      data: { schoolId: fx.schoolId, invoiceId: invoice.id, order: 0, label: "First", amountKobo: 100000, dueDate },
    });

    jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    await service.runFeeReminders(lagosToday(0));

    expect(whatsappSpy).not.toHaveBeenCalled();

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "FEE_REMINDER" } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.channels).not.toContain("WHATSAPP");
  });
});

describe("NotificationSettingsService.update — WHATSAPP validation (EN-2 Task 4)", () => {
  it("accepts channels:[\"SMS\",\"WHATSAPP\"]", async () => {
    const fx = await seedSchool("wa-settings-ok");
    fixtures.push(fx);

    const updated = await settingsService.update(fx.schoolId, { channels: ["SMS", "WHATSAPP"] });
    expect(updated.channels).toEqual(["SMS", "WHATSAPP"]);
  });

  it("rejects channels:[\"SMS\",\"FOO\"]", async () => {
    const fx = await seedSchool("wa-settings-bad");
    fixtures.push(fx);

    await expect(settingsService.update(fx.schoolId, { channels: ["SMS", "FOO"] })).rejects.toThrow(
      BadRequestException,
    );
  });
});
