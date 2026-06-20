// apps/api/src/core/identity/identity-model.spec.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("identity core schema", () => {
  afterAll(() => prisma.$disconnect());

  it("creates a Person with a Membership and a Role assignment", async () => {
    const school = await prisma.school.create({
      data: { name: "T", slug: `t-${Date.now()}` } as never,
    });
    const role = await prisma.role.create({
      data: { key: "teacher", name: "Teacher", isPreset: true },
    });
    const person = await prisma.person.create({
      data: { email: `p-${Date.now()}@t.io` },
    });
    const m = await prisma.membership.create({
      data: {
        personId: person.id,
        schoolId: school.id,
        roles: { create: { roleId: role.id } },
      },
      include: { roles: true },
    });
    expect(m.roles).toHaveLength(1);
  });
});
