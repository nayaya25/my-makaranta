// apps/api/src/core/auth/me.controller.spec.ts
import { PrismaClient } from "@prisma/client";
import { IdentityService } from "../identity/identity.service";
import { MeController } from "./me.controller";
import { seedSystemRoles } from "../../../prisma/seed-roles";

const prisma = new PrismaClient();
const identitySvc = new IdentityService(prisma as never);
const controller = new MeController(identitySvc);

describe("MeController.getMe", () => {
  afterAll(() => prisma.$disconnect());

  // ------------------------------------------------------------------
  // (a) staff membership → profile.isStaff = true
  // ------------------------------------------------------------------
  it("returns isStaff true when active membership has a staffProfile", async () => {
    await seedSystemRoles(prisma);
    const school = await prisma.school.create({ data: { name: "StaffSchool", slug: `staff-${Date.now()}` } as never });
    const person = await prisma.person.create({ data: { firstName: "Ada", lastName: "Lovelace" } });
    const m = await prisma.membership.create({ data: { personId: person.id, schoolId: school.id } });
    const staffNo = `SN-${Date.now()}`;
    await prisma.staffProfile.create({ data: { membershipId: m.id, schoolId: school.id, staffNo } });

    const result = await controller.getMe({ user: { personId: person.id, membershipId: m.id } } as never);

    expect(result).not.toHaveProperty("legacy");
    expect((result as any).profile.isStaff).toBe(true);
    expect((result as any).profile.isParent).toBe(false);
    expect((result as any).profile.isStudent).toBe(false);
    expect((result as any).personId).toBe(person.id);
    expect((result as any).activeMembershipId).toBe(m.id);
    expect((result as any).person.firstName).toBe("Ada");
    expect((result as any).person.lastName).toBe("Lovelace");
  });

  // ------------------------------------------------------------------
  // (b) guardian membership → profile.isParent = true
  // ------------------------------------------------------------------
  it("returns isParent true when active membership has guardianOf rows", async () => {
    const school = await prisma.school.create({ data: { name: "GuardianSchool", slug: `guardian-${Date.now()}` } as never });
    const parentPerson = await prisma.person.create({ data: {} });
    const childPerson = await prisma.person.create({ data: {} });
    const parentMembership = await prisma.membership.create({ data: { personId: parentPerson.id, schoolId: school.id } });
    const childMembership = await prisma.membership.create({ data: { personId: childPerson.id, schoolId: school.id } });
    const sid = `STU-${Date.now()}`;
    const studentProfile = await prisma.studentProfile.create({
      data: { membershipId: childMembership.id, schoolId: school.id, admissionNo: sid, studentId: sid },
    });
    await prisma.guardianship.create({
      data: { parentMembershipId: parentMembership.id, studentProfileId: studentProfile.id, relationship: "parent" },
    });

    const result = await controller.getMe({ user: { personId: parentPerson.id, membershipId: parentMembership.id } } as never);

    expect(result).not.toHaveProperty("legacy");
    expect((result as any).profile.isParent).toBe(true);
    expect((result as any).profile.isStaff).toBe(false);
    expect((result as any).profile.isStudent).toBe(false);
  });

  // ------------------------------------------------------------------
  // (c) student membership → profile.isStudent = true
  // ------------------------------------------------------------------
  it("returns isStudent true when active membership has a studentProfile", async () => {
    const school = await prisma.school.create({ data: { name: "StudentSchool", slug: `student-${Date.now()}` } as never });
    const person = await prisma.person.create({ data: {} });
    const m = await prisma.membership.create({ data: { personId: person.id, schoolId: school.id } });
    const sid = `STU2-${Date.now()}`;
    await prisma.studentProfile.create({
      data: { membershipId: m.id, schoolId: school.id, admissionNo: sid, studentId: sid },
    });

    const result = await controller.getMe({ user: { personId: person.id, membershipId: m.id } } as never);

    expect(result).not.toHaveProperty("legacy");
    expect((result as any).profile.isStudent).toBe(true);
    expect((result as any).profile.isStaff).toBe(false);
    expect((result as any).profile.isParent).toBe(false);
  });

  // ------------------------------------------------------------------
  // (d) multi-membership person → all memberships returned
  // ------------------------------------------------------------------
  it("returns all memberships for a person with multiple memberships", async () => {
    const schoolA = await prisma.school.create({ data: { name: "SchoolA", slug: `sA-${Date.now()}` } as never });
    const schoolB = await prisma.school.create({ data: { name: "SchoolB", slug: `sB-${Date.now()}` } as never });
    const person = await prisma.person.create({ data: {} });
    const mA = await prisma.membership.create({ data: { personId: person.id, schoolId: schoolA.id } });
    const mB = await prisma.membership.create({ data: { personId: person.id, schoolId: schoolB.id } });

    const result = await controller.getMe({ user: { personId: person.id, membershipId: mA.id } } as never);

    expect(result).not.toHaveProperty("legacy");
    const memberships = (result as any).memberships as any[];
    expect(memberships.length).toBeGreaterThanOrEqual(2);
    const ids = memberships.map((m: any) => m.id);
    expect(ids).toContain(mA.id);
    expect(ids).toContain(mB.id);

    const mAEntry = memberships.find((m: any) => m.id === mA.id);
    expect(mAEntry.schoolName).toBe("SchoolA");
    const mBEntry = memberships.find((m: any) => m.id === mB.id);
    expect(mBEntry.schoolName).toBe("SchoolB");
  });

  // ------------------------------------------------------------------
  // (e) legacy fallback: no personId → returns { legacy: true, ... }
  // ------------------------------------------------------------------
  it("returns legacy shape when personId is absent", async () => {
    const result = await controller.getMe({
      user: { identityType: "STAFF", schoolId: "s1" },
    } as never);

    expect((result as any).legacy).toBe(true);
    expect((result as any).identityType).toBe("STAFF");
    expect((result as any).schoolId).toBe("s1");
  });
});
