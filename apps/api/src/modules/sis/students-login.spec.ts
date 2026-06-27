// apps/api/src/modules/sis/students-login.spec.ts
import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PasswordService } from "../../core/auth/password.service";
import { StudentsService } from "./students.service";

const prisma = new PrismaClient();
const passwords = new PasswordService();

// Minimal storage mock — provisionLogin never touches storage
const mockStorage = { put: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue("http://x") } as never;

function makeSvc(schoolId: string) {
  const svc = new StudentsService(prisma as never, mockStorage, passwords);
  // Inject schoolId into TenantContext via the service call (see note below)
  // We thread schoolId directly into provisionLogin instead of mocking AsyncLocalStorage
  return { svc, schoolId };
}

describe("StudentsService.provisionLogin", () => {
  afterAll(() => prisma.$disconnect());

  it("creates Person + active Membership, links membershipId, sets a hash that verifies", async () => {
    const school = await prisma.school.create({
      data: { name: "LoginSchool1", slug: `login1-${Date.now()}` } as never,
    });
    const sid = `LGN-${Date.now()}`;
    const profile = await prisma.studentProfile.create({
      data: { schoolId: school.id, admissionNo: sid, studentId: sid },
    });

    const { svc } = makeSvc(school.id);
    const result = await svc.provisionLogin(profile.id, school.id);

    expect(result.studentId).toBe(sid);
    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThan(0);

    // Reload the profile and verify linkage
    const updated = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { membership: { include: { person: true } } },
    });

    expect(updated.membershipId).not.toBeNull();
    const person = updated.membership!.person;
    expect(person.passwordHash).not.toBeNull();
    // Hash must not equal plain password
    expect(person.passwordHash).not.toBe(result.tempPassword);
    // Hash must verify
    expect(await passwords.verify(person.passwordHash!, result.tempPassword)).toBe(true);

    // Membership must be active
    expect(updated.membership!.status).toBe("active");
  });

  it("second call resets hash WITHOUT duplicating the membership", async () => {
    const school = await prisma.school.create({
      data: { name: "LoginSchool2", slug: `login2-${Date.now()}` } as never,
    });
    const sid = `LGN2-${Date.now()}`;
    const profile = await prisma.studentProfile.create({
      data: { schoolId: school.id, admissionNo: sid, studentId: sid },
    });

    const { svc } = makeSvc(school.id);
    const first = await svc.provisionLogin(profile.id, school.id);
    const second = await svc.provisionLogin(profile.id, school.id);

    // Password was reset
    const updated = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { membership: { include: { person: true } } },
    });

    expect(await passwords.verify(updated.membership!.person.passwordHash!, second.tempPassword)).toBe(true);
    expect(await passwords.verify(updated.membership!.person.passwordHash!, first.tempPassword)).toBe(false);

    // Only one membership for this person+school
    const membershipCount = await prisma.membership.count({
      where: { personId: updated.membership!.personId, schoolId: school.id },
    });
    expect(membershipCount).toBe(1);
  });

  it("throws NotFoundException for a student from another school", async () => {
    const schoolA = await prisma.school.create({
      data: { name: "SchoolA", slug: `schoolA-${Date.now()}` } as never,
    });
    const schoolB = await prisma.school.create({
      data: { name: "SchoolB", slug: `schoolB-${Date.now()}` } as never,
    });
    const sid = `LGN3-${Date.now()}`;
    // Profile belongs to schoolA
    const profile = await prisma.studentProfile.create({
      data: { schoolId: schoolA.id, admissionNo: sid, studentId: sid },
    });

    const { svc } = makeSvc(schoolB.id);
    // Caller is from schoolB — should 404
    await expect(svc.provisionLogin(profile.id, schoolB.id)).rejects.toThrow(NotFoundException);
  });
});
