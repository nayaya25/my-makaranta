import { PrismaClient } from "@prisma/client";

export const PRESET_KEYS = [
  "proprietor",
  "director",
  "principal",
  "vice_principal",
  "ict_admin",
  "bursar",
  "exam_officer",
  "teacher",
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

const NAMES: Record<PresetKey, string> = {
  proprietor: "Proprietor",
  director: "Director",
  principal: "Principal",
  vice_principal: "Vice Principal",
  ict_admin: "ICT Admin",
  bursar: "Bursar",
  exam_officer: "Exam Officer",
  teacher: "Teacher",
};

// "*" means all permissions
const ALL = "*" as const;

const GRANTS: Record<PresetKey, string[] | typeof ALL> = {
  proprietor: ALL,
  director: ALL,
  principal: [
    "students.view",
    "students.create",
    "students.update",
    "staff.view",
    "classes.view",
    "classes.manage",
    "attendance.mark",
    "attendance.view",
    "attendance.audit",
    "results.record",
    "results.review",
    "results.release",
    "results.correct",
    "assessment.configure",
    "fees.view",
    "announcements.create",
    "announcements.view",
    "reports.view",
    "school.manage",
    "skills.record",
  ],
  vice_principal: [
    "students.view",
    "staff.view",
    "classes.view",
    "attendance.mark",
    "attendance.view",
    "attendance.audit",
    "results.review",
    "announcements.view",
    "reports.view",
  ],
  ict_admin: [
    "school.manage",
    "staff.view",
    "staff.manage",
    "students.view",
    "classes.view",
    "classes.manage",
    "announcements.view",
    "reports.view",
  ],
  bursar: [
    "students.view",
    "fees.view",
    "fees.manage",
    "reports.view",
    "announcements.view",
  ],
  exam_officer: [
    "students.view",
    "classes.view",
    "results.review",
    "results.release",
    "assessment.configure",
    "announcements.view",
  ],
  teacher: [
    "students.view",
    "classes.view",
    "attendance.mark",
    "attendance.view",
    "results.record",
    "announcements.view",
    "skills.record",
  ],
};

export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  // Fetch all permissions once upfront
  const allPermissions = await prisma.permission.findMany();
  const permByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  for (const key of PRESET_KEYS) {
    // Upsert the Role (cannot use upsert with schoolId: null in compound unique).
    // PostgreSQL UNIQUE(schoolId, key) treats NULL values as distinct, so duplicates
    // can accumulate across test runs. Find all matches, keep the first, delete extras.
    const allExisting = await prisma.role.findMany({
      where: { schoolId: null, key },
      orderBy: { id: "asc" },
    });

    if (allExisting.length > 1) {
      const [, ...extras] = allExisting;
      const extraIds = extras.map((r) => r.id);
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: extraIds } },
      });
      await prisma.roleAssignment.deleteMany({
        where: { roleId: { in: extraIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: extraIds } },
      });
    }

    const existing = allExisting[0] ?? null;

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: NAMES[key] },
        })
      : await prisma.role.create({
          data: {
            schoolId: null,
            key,
            name: NAMES[key],
            isPreset: true,
          },
        });

    // Determine permission ids for this preset
    const grants = GRANTS[key];
    const permissionIds: string[] =
      grants === ALL
        ? allPermissions.map((p) => p.id)
        : grants
            .map((k) => permByKey.get(k))
            .filter((id): id is string => id !== undefined);

    // Delete existing role permissions then recreate (idempotent)
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }
}
