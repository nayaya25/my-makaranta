/**
 * Integration test: NotificationsService.notifyResultsReady + release hook (EN-1 Task 4)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest results-ready --runInBand
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
import { ReleaseService } from "../assessment/release.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

type Fixture = {
  schoolId: string;
  classLevelId: string;
  classId: string;
  academicYearId: string;
  termId: string;
};

async function seedSchool(suffix: string, isEarlyYears = false): Promise<Fixture> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const school = await rawPrisma.school.create({
    data: { name: `RR-${suffix}-${ts}`, slug: `rr-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  const classLevel = await rawPrisma.classLevel.create({
    data: { schoolId: school.id, name: `Level-${ts}`, order: 1, isEarlyYears },
  });
  const klass = await rawPrisma.class.create({
    data: { schoolId: school.id, classLevelId: classLevel.id, name: `Class-${ts}` },
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
  await rawPrisma.verification.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.resultSheetEntry.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.resultSheet.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
  await rawPrisma.release.deleteMany({ where: { schoolId: fx.schoolId } }).catch(() => undefined);
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
  const preferences = new PreferenceService(prisma);
  const dispatch = new NotificationDispatchService(sms, emailAdapter, whatsapp);
  service = new NotificationsService(prisma, sms, whatsapp, emailAdapter, settingsService, preferences, dispatch, new MessageTemplateService(prisma));
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const fx of fixtures) await cleanupFixture(fx);
  await rawPrisma.$disconnect();
});

describe("NotificationsService.notifyResultsReady", () => {
  it("notifies each enrolled student's guardians once", async () => {
    const fx = await seedSchool("basic");
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `RR-BASIC-A-${Date.now()}`, "+2348020000001", "rrA@example.com");
    await makeStudentWithGuardian(fx, `RR-BASIC-B-${Date.now()}`, "+2348020000002", "rrB@example.com");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await service.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    const calledPhones = smsSpy.mock.calls.map((c) => c[0]);
    expect(calledPhones).toContain("+2348020000001");
    expect(calledPhones).toContain("+2348020000002");
    expect(emailAdapter.sent.some((m) => m.to === "rrA@example.com")).toBe(true);
    expect(emailAdapter.sent.some((m) => m.to === "rrB@example.com")).toBe(true);

    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "RESULTS_READY" } });
    expect(logs.length).toBe(2);
    expect(logs.every((l) => l.dedupeKey.startsWith(`RESULTS_READY:${release.id}:`))).toBe(true);
  });

  it("does not duplicate on a re-call (dedupe)", async () => {
    const fx = await seedSchool("dedupe");
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `RR-DEDUPE-${Date.now()}`, "+2348020000003", "rrdedupe@example.com");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await service.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);
    const firstCallCount = smsSpy.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    await service.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    expect(smsSpy.mock.calls.length).toBe(firstCallCount); // no additional sends
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "RESULTS_READY" } });
    expect(logs.length).toBe(1);
  });

  it("does nothing when resultsReadyEnabled=false", async () => {
    const fx = await seedSchool("disabled");
    fixtures.push(fx);

    await settingsService.update(fx.schoolId, { resultsReadyEnabled: false });
    await makeStudentWithGuardian(fx, `RR-DISABLED-${Date.now()}`, "+2348020000004", "rrdisabled@example.com");

    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const release = await rawPrisma.release.create({
      data: { schoolId: fx.schoolId, classId: fx.classId, termId: fx.termId, releasedBy: "tester" },
    });

    await service.notifyResultsReady(fx.schoolId, release.id, fx.classId, fx.termId);

    expect(smsSpy).not.toHaveBeenCalled();
    const logs = await rawPrisma.notificationLog.findMany({ where: { schoolId: fx.schoolId, kind: "RESULTS_READY" } });
    expect(logs.length).toBe(0);
  });
});

describe("ReleaseService — results-ready notification hook", () => {
  it("triggers notifyResultsReady after a successful release (EY path)", async () => {
    const fx = await seedSchool("hook-ey", true);
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `RR-HOOKEY-${Date.now()}`, "+2348020000005", "rrhookey@example.com");

    const notifySpy = jest.spyOn(service, "notifyResultsReady").mockResolvedValue(undefined);
    const releaseService = new ReleaseService(prisma, service);

    const result = await TenantContext.run({ schoolId: fx.schoolId, userId: null }, () =>
      releaseService.release(fx.classId, fx.termId, "tester"),
    );

    expect(notifySpy).toHaveBeenCalledWith(fx.schoolId, expect.any(String), fx.classId, fx.termId);
    const release = await rawPrisma.release.findFirst({ where: { classId: fx.classId, termId: fx.termId, schoolId: fx.schoolId } });
    expect(release).not.toBeNull();
    expect(result.classId).toBe(fx.classId);
  });

  it("a thrown notifyResultsReady does not roll back the Release row (non-fatal)", async () => {
    const fx = await seedSchool("hook-throws", true);
    fixtures.push(fx);

    await makeStudentWithGuardian(fx, `RR-HOOKTHROW-${Date.now()}`, "+2348020000006", "rrhookthrow@example.com");

    jest.spyOn(service, "notifyResultsReady").mockRejectedValue(new Error("boom"));
    const releaseService = new ReleaseService(prisma, service);

    await expect(
      TenantContext.run({ schoolId: fx.schoolId, userId: null }, () =>
        releaseService.release(fx.classId, fx.termId, "tester"),
      ),
    ).resolves.toBeDefined();

    const release = await rawPrisma.release.findFirst({ where: { classId: fx.classId, termId: fx.termId, schoolId: fx.schoolId } });
    expect(release).not.toBeNull();
  });
});
