/**
 * Engagement EN-3a Task 6 — Preferences API (parent self-serve + staff)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest parent-preferences parent --runInBand
 *
 * Coverage:
 *   1. Parent getNotificationPreferences/setNotificationPreferences operate on the caller's own
 *      parentId (identity.identityId), never a request-supplied id.
 *   2. A non-parent identity (STAFF) -> ForbiddenException.
 *   3. Staff (ParentsService) get/set are scoped to school -> a foreign-school parent -> NotFoundException.
 *   4. Validation (bad channel/category) is delegated to PreferenceService.setForParent -> BadRequestException.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { ParentService } from "./parent.service";
import { ParentsService } from "../sis/parents.service";
import type { RequestUser } from "../../core/auth/current-user.decorator";

const prisma = new PrismaClient();

describe("Notification preferences — parent self-serve + staff (EN-3a Task 6)", () => {
  let preferenceService: PreferenceService;
  let parentService: ParentService;
  let parentsService: ParentsService;

  let schoolAId: string;
  let schoolBId: string;
  let parentAId: string; // in school A
  let parentBId: string; // in school B (foreign, relative to school A)

  const testSchoolIds: string[] = [];

  beforeAll(async () => {
    const ts = Date.now();

    const schoolA = await prisma.school.create({ data: { name: `PrefsA-${ts}`, slug: `prefs-a-${ts}` } as never });
    schoolAId = schoolA.id;
    const schoolB = await prisma.school.create({ data: { name: `PrefsB-${ts}`, slug: `prefs-b-${ts}` } as never });
    schoolBId = schoolB.id;
    testSchoolIds.push(schoolAId, schoolBId);

    const parentA = await prisma.parent.create({
      data: { schoolId: schoolAId, phone: `0801${ts}`, firstName: "A", lastName: "Parent" },
    });
    parentAId = parentA.id;

    const parentB = await prisma.parent.create({
      data: { schoolId: schoolBId, phone: `0802${ts}`, firstName: "B", lastName: "Parent" },
    });
    parentBId = parentB.id;

    preferenceService = new PreferenceService(prisma as unknown as PrismaService);
    parentService = new ParentService(prisma as unknown as PrismaService, {} as never, preferenceService);
    parentsService = new ParentsService(prisma as unknown as PrismaService, preferenceService);
  });

  afterAll(async () => {
    await prisma.notificationPreference.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.parent.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
    await prisma.$disconnect();
  });

  const asSchoolA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolAId, userId: null }, fn);

  const parentUser: RequestUser = {
    id: "user-1",
    schoolId: null,
    identityType: "PARENT",
    identityId: "", // set per-test to parentAId
  };

  describe("Parent self-serve", () => {
    it("getNotificationPreferences returns defaults for the caller's own parentId", async () => {
      const user: RequestUser = { ...parentUser, identityId: parentAId };
      const result = await asSchoolA(() => parentService.getNotificationPreferences(user));
      expect(result).toEqual({ mutedChannels: [], mutedCategories: [] });
    });

    it("setNotificationPreferences persists against the caller's own parentId", async () => {
      const user: RequestUser = { ...parentUser, identityId: parentAId };
      const saved = await asSchoolA(() =>
        parentService.setNotificationPreferences(user, { mutedChannels: ["SMS"], mutedCategories: ["ANNOUNCEMENT"] }),
      );
      expect(saved).toEqual({ mutedChannels: ["SMS"], mutedCategories: ["ANNOUNCEMENT"] });

      const fetched = await asSchoolA(() => parentService.getNotificationPreferences(user));
      expect(fetched).toEqual({ mutedChannels: ["SMS"], mutedCategories: ["ANNOUNCEMENT"] });

      // Reset for subsequent tests.
      await asSchoolA(() => parentService.setNotificationPreferences(user, { mutedChannels: [], mutedCategories: [] }));
    });

    it("a non-parent identity is Forbidden on get", async () => {
      const staffUser: RequestUser = { id: "staff-1", schoolId: schoolAId, identityType: "STAFF", identityId: "staff-person-1" };
      await expect(asSchoolA(() => parentService.getNotificationPreferences(staffUser))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("a non-parent identity is Forbidden on set", async () => {
      const staffUser: RequestUser = { id: "staff-1", schoolId: schoolAId, identityType: "STAFF", identityId: "staff-person-1" };
      await expect(
        asSchoolA(() => parentService.setNotificationPreferences(staffUser, { mutedChannels: ["SMS"] })),
      ).rejects.toThrow(ForbiddenException);
    });

    it("an identity with no identityId is Forbidden", async () => {
      const noIdUser: RequestUser = { id: "user-2", schoolId: schoolAId, identityType: "PARENT" };
      await expect(asSchoolA(() => parentService.getNotificationPreferences(noIdUser))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("validation rejects a bad channel (delegated to setForParent)", async () => {
      const user: RequestUser = { ...parentUser, identityId: parentAId };
      await expect(
        asSchoolA(() => parentService.setNotificationPreferences(user, { mutedChannels: ["CARRIER_PIGEON"] })),
      ).rejects.toThrow(BadRequestException);
    });

    it("validation rejects a bad category (delegated to setForParent)", async () => {
      const user: RequestUser = { ...parentUser, identityId: parentAId };
      await expect(
        asSchoolA(() => parentService.setNotificationPreferences(user, { mutedCategories: ["BIRTHDAY"] })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Staff (ParentsService, v1/parents/:parentId/notification-preferences)", () => {
    it("gets a preference row for a parent in the caller's school", async () => {
      const result = await asSchoolA(() => parentsService.getNotificationPreferences(parentAId));
      expect(result).toEqual({ mutedChannels: [], mutedCategories: [] });
    });

    it("sets a preference row for a parent in the caller's school", async () => {
      const saved = await asSchoolA(() =>
        parentsService.setNotificationPreferences(parentAId, { mutedChannels: ["WHATSAPP"], mutedCategories: [] }),
      );
      expect(saved).toEqual({ mutedChannels: ["WHATSAPP"], mutedCategories: [] });

      const fetched = await asSchoolA(() => parentsService.getNotificationPreferences(parentAId));
      expect(fetched).toEqual({ mutedChannels: ["WHATSAPP"], mutedCategories: [] });

      await asSchoolA(() => parentsService.setNotificationPreferences(parentAId, { mutedChannels: [], mutedCategories: [] }));
    });

    it("a foreign-school parent -> NotFoundException on get", async () => {
      await expect(asSchoolA(() => parentsService.getNotificationPreferences(parentBId))).rejects.toThrow(
        NotFoundException,
      );
    });

    it("a foreign-school parent -> NotFoundException on set", async () => {
      await expect(
        asSchoolA(() => parentsService.setNotificationPreferences(parentBId, { mutedChannels: ["SMS"] })),
      ).rejects.toThrow(NotFoundException);
    });

    it("validation rejects a bad channel/category (delegated to setForParent)", async () => {
      await expect(
        asSchoolA(() => parentsService.setNotificationPreferences(parentAId, { mutedChannels: ["FAX"] })),
      ).rejects.toThrow(BadRequestException);
      await expect(
        asSchoolA(() => parentsService.setNotificationPreferences(parentAId, { mutedCategories: ["SPAM"] })),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
