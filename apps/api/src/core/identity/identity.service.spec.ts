// apps/api/src/core/identity/identity.service.spec.ts
import { IdentityService } from "./identity.service";
import { PrismaClient } from "@prisma/client";
import { seedSystemRoles } from "../../../prisma/seed-roles";

const prisma = new PrismaClient();
const svc = new IdentityService(prisma as never);

describe("IdentityService", () => {
  afterAll(() => prisma.$disconnect());

  it("resolves by email and derives authz from roles", async () => {
    await seedSystemRoles(prisma);
    const school = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
    const teacher = await prisma.role.findFirstOrThrow({ where: { schoolId: null, key: "teacher" } });
    const email = `t-${Date.now()}@s.io`;
    const person = await prisma.person.create({ data: { email } });
    const m = await prisma.membership.create({
      data: { personId: person.id, schoolId: school.id, roles: { create: { roleId: teacher.id } } },
    });

    const r = await svc.resolvePerson(school.id, email);
    expect(r?.membership.id).toBe(m.id);

    const authz = await svc.deriveAuthz(m.id);
    expect(authz.roles).toContain("teacher");
    expect(authz.perms).toContain("students.view");
  });

  it("resolves a student by Student ID within the school only", async () => {
    const school = await prisma.school.create({ data: { name: "S2", slug: `s2-${Date.now()}` } as never });
    const person = await prisma.person.create({ data: {} });
    const m = await prisma.membership.create({ data: { personId: person.id, schoolId: school.id } });
    const sid = `STU-${Date.now()}`;
    await prisma.studentProfile.create({
      data: { membershipId: m.id, schoolId: school.id, admissionNo: sid, studentId: sid },
    });
    const r = await svc.resolvePerson(school.id, sid);
    expect(r?.person.id).toBe(person.id);
    // Wrong school → no match
    const other = await prisma.school.create({ data: { name: "S3", slug: `s3-${Date.now()}` } as never });
    expect(await svc.resolvePerson(other.id, sid)).toBeNull();
  });
});
