/**
 * Engagement EN-3a Task 2 — PreferenceService
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest preference.service --runInBand
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PreferenceService } from "./preference.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

async function seedSchool(suffix: string): Promise<string> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const school = await rawPrisma.school.create({
    data: { name: `PS-${suffix}-${ts}`, slug: `ps-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  return school.id;
}

async function seedParent(schoolId: string, suffix: string): Promise<string> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const parent = await rawPrisma.parent.create({
    data: { schoolId, phone: `080${suffix}${ts}`, firstName: "Test", lastName: "Parent" },
  });
  return parent.id;
}

async function cleanupSchool(schoolId: string): Promise<void> {
  await rawPrisma.notificationPreference.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await rawPrisma.parent.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
}

let service: PreferenceService;
const schoolIds: string[] = [];

beforeAll(() => {
  service = new PreferenceService(prisma);
});

afterAll(async () => {
  for (const id of schoolIds) await cleanupSchool(id);
  await rawPrisma.$disconnect();
});

describe("PreferenceService.effectiveChannels", () => {
  it("no preference row -> receives all requested channels", () => {
    expect(service.effectiveChannels(undefined, "ANNOUNCEMENT", ["SMS", "EMAIL"])).toEqual(["SMS", "EMAIL"]);
  });

  it("muted channel is removed from the requested set", () => {
    const pref = { mutedChannels: ["SMS"], mutedCategories: [] };
    expect(service.effectiveChannels(pref, "FEE_REMINDER", ["SMS", "EMAIL", "WHATSAPP"])).toEqual([
      "EMAIL",
      "WHATSAPP",
    ]);
  });

  it("muted category suppresses every channel", () => {
    const pref = { mutedChannels: [], mutedCategories: ["ANNOUNCEMENT"] };
    expect(service.effectiveChannels(pref, "ANNOUNCEMENT", ["SMS"])).toEqual([]);
  });
});

describe("PreferenceService.setForParent / getForParent / loadPreferences", () => {
  it("rejects a channel not in NOTIFICATION_CHANNELS", async () => {
    const schoolId = await seedSchool("bad-channel");
    schoolIds.push(schoolId);
    const parentId = await seedParent(schoolId, "1");

    await expect(service.setForParent(schoolId, parentId, { mutedChannels: ["FOO"] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a category not in NOTIFICATION_CATEGORIES", async () => {
    const schoolId = await seedSchool("bad-category");
    schoolIds.push(schoolId);
    const parentId = await seedParent(schoolId, "1");

    await expect(service.setForParent(schoolId, parentId, { mutedCategories: ["FOO"] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a parent belonging to another school (NotFound)", async () => {
    const schoolA = await seedSchool("owner");
    const schoolB = await seedSchool("foreign");
    schoolIds.push(schoolA, schoolB);
    const parentInB = await seedParent(schoolB, "1");

    await expect(
      service.setForParent(schoolA, parentInB, { mutedChannels: ["SMS"] }),
    ).rejects.toThrow(NotFoundException);
  });

  it("upserts valid preferences and getForParent reflects them", async () => {
    const schoolId = await seedSchool("upsert");
    schoolIds.push(schoolId);
    const parentId = await seedParent(schoolId, "1");

    const saved = await service.setForParent(schoolId, parentId, {
      mutedChannels: ["SMS"],
      mutedCategories: ["ANNOUNCEMENT"],
    });
    expect(saved.mutedChannels).toEqual(["SMS"]);
    expect(saved.mutedCategories).toEqual(["ANNOUNCEMENT"]);

    const fetched = await service.getForParent(schoolId, parentId);
    expect(fetched.mutedChannels).toEqual(["SMS"]);
    expect(fetched.mutedCategories).toEqual(["ANNOUNCEMENT"]);

    // second call upserts (updates) rather than creating a duplicate row
    const updated = await service.setForParent(schoolId, parentId, { mutedChannels: [] });
    expect(updated.mutedChannels).toEqual([]);
    expect(updated.mutedCategories).toEqual([]);

    const rows = await rawPrisma.notificationPreference.findMany({ where: { schoolId, parentId } });
    expect(rows).toHaveLength(1);
  });

  it("getForParent defaults to empty arrays when no row exists", async () => {
    const schoolId = await seedSchool("defaults");
    schoolIds.push(schoolId);
    const parentId = await seedParent(schoolId, "1");

    const pref = await service.getForParent(schoolId, parentId);
    expect(pref).toEqual({ mutedChannels: [], mutedCategories: [] });
  });

  it("loadPreferences returns a map keyed by parentId for a batch of parents", async () => {
    const schoolId = await seedSchool("batch");
    schoolIds.push(schoolId);
    const parentA = await seedParent(schoolId, "a");
    const parentB = await seedParent(schoolId, "b");
    const parentC = await seedParent(schoolId, "c"); // no preference row

    await service.setForParent(schoolId, parentA, { mutedChannels: ["SMS"] });
    await service.setForParent(schoolId, parentB, { mutedCategories: ["FEE_REMINDER"] });

    const map = await service.loadPreferences(schoolId, [parentA, parentB, parentC]);

    expect(map.get(parentA)).toEqual({ mutedChannels: ["SMS"], mutedCategories: [] });
    expect(map.get(parentB)).toEqual({ mutedChannels: [], mutedCategories: ["FEE_REMINDER"] });
    expect(map.has(parentC)).toBe(false);
  });

  it("loadPreferences returns an empty map for an empty parentIds array", async () => {
    const map = await service.loadPreferences("any-school", []);
    expect(map.size).toBe(0);
  });
});
