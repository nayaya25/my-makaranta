/**
 * Engagement EN-3a Task 5 — collections reminders respect NotificationSettings.channels + NotificationPreference
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest collections-preferences --runInBand
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../../core/email/log.adapter";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { NotificationDispatchService } from "../../core/notification-dispatch/notification-dispatch.service";
import { NotificationSettingsService } from "../notifications/notification-settings.service";
import { CollectionsService } from "./collections.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

type Fixture = {
  schoolId: string;
  classLevelId: string;
  termId: string;
};

async function seedSchool(suffix: string): Promise<Fixture> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const school = await rawPrisma.school.create({
    data: { name: `CP-${suffix}-${ts}`, slug: `cp-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  const classLevel = await rawPrisma.classLevel.create({
    data: { schoolId: school.id, name: "JSS 1", order: 1 },
  });
  const academicYear = await rawPrisma.academicYear.create({
    data: { schoolId: school.id, name: `${ts}/YR`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31") },
  });
  const term = await rawPrisma.term.create({
    data: { schoolId: school.id, academicYearId: academicYear.id, number: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
  });
  return { schoolId: school.id, classLevelId: classLevel.id, termId: term.id };
}

async function makeInvoiceWithGuardian(fx: Fixture, admissionNo: string, phone: string, email: string | null) {
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
  const parent = await rawPrisma.parent.create({
    data: { schoolId: fx.schoolId, phone, email: email ?? undefined, firstName: "Parent", lastName: "Guardian" },
  });
  await rawPrisma.guardian.create({
    data: { studentId: student.id, parentId: parent.id, relationship: "FATHER", isPrimary: true },
  });
  const invoice = await rawPrisma.invoice.create({
    data: { schoolId: fx.schoolId, studentId: student.id, termId: fx.termId, classLevelId: fx.classLevelId, totalKobo: 100000, paidKobo: 0 },
  });
  return { studentId: student.id, parentId: parent.id, invoiceId: invoice.id };
}

async function cleanupFixture(fx: Fixture) {
  await rawPrisma.feeReminder.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.notificationSettings.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.invoice.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.guardian.deleteMany({ where: { student: { schoolId: fx.schoolId } } }).catch(() => undefined);
  await rawPrisma.notificationPreference.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.parent.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.student.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
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
let service: CollectionsService;
const fixtures: Fixture[] = [];
const actor = { id: "tester-staff-id" } as RequestUser;

beforeAll(() => {
  sms = new SmsService();
  whatsapp = new WhatsAppService();
  emailAdapter = new LogEmailAdapter();
  settingsService = new NotificationSettingsService(prisma);
  preferences = new PreferenceService(prisma);
  dispatch = new NotificationDispatchService(sms, emailAdapter, whatsapp);
  service = new CollectionsService(prisma, settingsService, preferences, dispatch);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const fx of fixtures) await cleanupFixture(fx);
  await rawPrisma.$disconnect();
});

describe("CollectionsService.sendReminder — respects NotificationSettings.channels + NotificationPreference", () => {
  it("sends on SMS + EMAIL + WHATSAPP when settings.channels includes all three", async () => {
    const fx = await seedSchool("all-channels");
    fixtures.push(fx);
    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL", "WHATSAPP"] });

    const { invoiceId } = await makeInvoiceWithGuardian(fx, `CP-ALL-${Date.now()}`, "+2348040000001", "cp-all@example.com");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    await TenantContext.run({ schoolId: fx.schoolId, userId: null }, async () => {
      const result = await service.sendReminder(invoiceId, actor);
      expect(result.recipientCount).toBe(1);
    });

    expect(smsSpy).toHaveBeenCalledWith("+2348040000001", expect.any(String));
    expect(whatsappSpy).toHaveBeenCalledWith("+2348040000001", expect.any(String));
    expect(emailAdapter.sent.some((m) => m.to === "cp-all@example.com")).toBe(true);

    const reminder = await rawPrisma.feeReminder.findFirst({ where: { schoolId: fx.schoolId, invoiceId } });
    expect(reminder?.channels).toContain("SMS");
    expect(reminder?.channels).toContain("EMAIL");
    expect(reminder?.channels).toContain("WHATSAPP");
  });

  it("a guardian-parent who muted SMS gets EMAIL/WHATSAPP only", async () => {
    const fx = await seedSchool("mute-sms");
    fixtures.push(fx);
    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL", "WHATSAPP"] });

    const { parentId, invoiceId } = await makeInvoiceWithGuardian(fx, `CP-MUTESMS-${Date.now()}`, "+2348040000002", "cp-mutesms@example.com");
    await rawPrisma.notificationPreference.create({
      data: { schoolId: fx.schoolId, parentId, mutedChannels: ["SMS"] },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    await TenantContext.run({ schoolId: fx.schoolId, userId: null }, async () => {
      const result = await service.sendReminder(invoiceId, actor);
      expect(result.recipientCount).toBe(1);
    });

    expect(smsSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).toHaveBeenCalledWith("+2348040000002", expect.any(String));
    expect(emailAdapter.sent.some((m) => m.to === "cp-mutesms@example.com")).toBe(true);

    const reminder = await rawPrisma.feeReminder.findFirst({ where: { schoolId: fx.schoolId, invoiceId } });
    expect(reminder?.channels).not.toContain("SMS");
    expect(reminder?.channels).toContain("EMAIL");
    expect(reminder?.channels).toContain("WHATSAPP");
  });

  it("a parent who muted FEE_REMINDER is skipped entirely; recipientCount counts only delivered", async () => {
    const fx = await seedSchool("mute-category");
    fixtures.push(fx);
    await settingsService.update(fx.schoolId, { channels: ["SMS", "EMAIL", "WHATSAPP"] });

    const { parentId, invoiceId } = await makeInvoiceWithGuardian(fx, `CP-MUTECAT-${Date.now()}`, "+2348040000003", "cp-mutecat@example.com");
    await rawPrisma.notificationPreference.create({
      data: { schoolId: fx.schoolId, parentId, mutedCategories: ["FEE_REMINDER"] },
    });

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);
    const emailCountBefore = emailAdapter.sent.length;

    let result!: { recipientCount: number };
    await TenantContext.run({ schoolId: fx.schoolId, userId: null }, async () => {
      result = await service.sendReminder(invoiceId, actor);
    });

    expect(result.recipientCount).toBe(0);
    expect(smsSpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
    expect(emailAdapter.sent.length).toBe(emailCountBefore);

    const reminder = await rawPrisma.feeReminder.findFirst({ where: { schoolId: fx.schoolId, invoiceId } });
    expect(reminder?.recipientCount).toBe(0);
    expect(reminder?.channels).toBe("");
  });
});
