// apps/api/src/core/identity/identity-model.spec.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("identity core schema", () => {
  const createdIds: {
    membershipId?: string;
    roleId?: string;
    personId?: string;
    schoolId?: string;
  } = {};

  afterAll(async () => {
    // Best-effort teardown — delete in FK dependency order
    try {
      if (createdIds.membershipId) {
        await prisma.roleAssignment.deleteMany({
          where: { membershipId: createdIds.membershipId },
        });
        await prisma.membership.delete({ where: { id: createdIds.membershipId } });
      }
      if (createdIds.roleId)
        await prisma.role.delete({ where: { id: createdIds.roleId } }).catch(() => undefined);
      if (createdIds.personId)
        await prisma.person.delete({ where: { id: createdIds.personId } }).catch(() => undefined);
      if (createdIds.schoolId)
        await prisma.school.delete({ where: { id: createdIds.schoolId } }).catch(() => undefined);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates a Person with a Membership and a Role assignment", async () => {
    const school = await prisma.school.create({
      data: { name: "T", slug: `t-${Date.now()}` } as never,
    });
    createdIds.schoolId = school.id;

    const role = await prisma.role.create({
      data: { key: "teacher", name: "Teacher", isPreset: true },
    });
    createdIds.roleId = role.id;

    const person = await prisma.person.create({
      data: { email: `p-${Date.now()}@t.io` },
    });
    createdIds.personId = person.id;

    const m = await prisma.membership.create({
      data: {
        personId: person.id,
        schoolId: school.id,
        roles: { create: { roleId: role.id } },
      },
      include: { roles: true },
    });
    createdIds.membershipId = m.id;

    expect(m.roles).toHaveLength(1);
  });
});
