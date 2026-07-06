/**
 * Integration test: NotificationSettingsService (EN-1 Task 2)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest notification-settings.service --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { NotificationSettingsService } from "./notification-settings.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

async function seedSchool(suffix: string) {
  const ts = Date.now();
  const school = await rawPrisma.school.create({
    data: { name: `NS-${suffix}-${ts}`, slug: `ns-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  return school.id;
}

async function cleanupSchool(schoolId: string) {
  await rawPrisma.notificationSettings.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
}

let service: NotificationSettingsService;
const schoolIds: string[] = [];

beforeAll(() => {
  service = new NotificationSettingsService(prisma);
});

afterAll(async () => {
  for (const id of schoolIds) await cleanupSchool(id);
  await rawPrisma.$disconnect();
});

describe("NotificationSettingsService.get", () => {
  it("seeds and returns defaults for a fresh school", async () => {
    const schoolId = await seedSchool("get-fresh");
    schoolIds.push(schoolId);

    const settings = await service.get(schoolId);

    expect(settings.schoolId).toBe(schoolId);
    expect(settings.feeRemindersEnabled).toBe(true);
    expect(settings.reminderOffsetDays).toEqual([-3, 0, 3]);
    expect(settings.resultsReadyEnabled).toBe(true);
    expect(settings.channels).toEqual(["SMS", "EMAIL"]);
  });

  it("persists exactly one row, and a second get() returns the same row", async () => {
    const schoolId = await seedSchool("get-persist");
    schoolIds.push(schoolId);

    const first = await service.get(schoolId);
    const second = await service.get(schoolId);

    expect(second.id).toBe(first.id);

    const rows = await rawPrisma.notificationSettings.findMany({ where: { schoolId } });
    expect(rows).toHaveLength(1);
  });

  it("is scoped by the passed schoolId (does not leak another school's row)", async () => {
    const schoolA = await seedSchool("scope-a");
    const schoolB = await seedSchool("scope-b");
    schoolIds.push(schoolA, schoolB);

    const a = await service.get(schoolA);
    await service.update(schoolA, { feeRemindersEnabled: false });
    const b = await service.get(schoolB);

    expect(a.schoolId).toBe(schoolA);
    expect(b.schoolId).toBe(schoolB);
    expect(b.feeRemindersEnabled).toBe(true);
  });
});

describe("NotificationSettingsService.update", () => {
  it("sets fields and persists them", async () => {
    const schoolId = await seedSchool("update-fields");
    schoolIds.push(schoolId);

    await service.get(schoolId);
    const updated = await service.update(schoolId, {
      feeRemindersEnabled: false,
      reminderOffsetDays: [-7, -1],
      resultsReadyEnabled: false,
      channels: ["SMS"],
    });

    expect(updated.feeRemindersEnabled).toBe(false);
    expect(updated.reminderOffsetDays).toEqual([-7, -1]);
    expect(updated.resultsReadyEnabled).toBe(false);
    expect(updated.channels).toEqual(["SMS"]);

    const fetched = await service.get(schoolId);
    expect(fetched.reminderOffsetDays).toEqual([-7, -1]);
  });

  it("creates the row first if it does not yet exist", async () => {
    const schoolId = await seedSchool("update-no-row");
    schoolIds.push(schoolId);

    const updated = await service.update(schoolId, { feeRemindersEnabled: false });

    expect(updated.schoolId).toBe(schoolId);
    expect(updated.feeRemindersEnabled).toBe(false);
  });

  it("rejects an offset outside -30..30", async () => {
    const schoolId = await seedSchool("update-bad-offset");
    schoolIds.push(schoolId);

    await expect(service.update(schoolId, { reminderOffsetDays: [-31] })).rejects.toThrow(BadRequestException);
    await expect(service.update(schoolId, { reminderOffsetDays: [31] })).rejects.toThrow(BadRequestException);
  });

  it("rejects a non-integer offset", async () => {
    const schoolId = await seedSchool("update-noninteger-offset");
    schoolIds.push(schoolId);

    await expect(service.update(schoolId, { reminderOffsetDays: [1.5] })).rejects.toThrow(BadRequestException);
  });

  it("rejects a channel not in {SMS, EMAIL}", async () => {
    const schoolId = await seedSchool("update-bad-channel");
    schoolIds.push(schoolId);

    await expect(service.update(schoolId, { channels: ["SMS", "WHATSAPP"] })).rejects.toThrow(BadRequestException);
  });

  it("accepts boundary offsets -30 and 30", async () => {
    const schoolId = await seedSchool("update-boundary-offset");
    schoolIds.push(schoolId);

    const updated = await service.update(schoolId, { reminderOffsetDays: [-30, 0, 30] });
    expect(updated.reminderOffsetDays).toEqual([-30, 0, 30]);
  });
});
