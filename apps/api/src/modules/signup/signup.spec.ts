/**
 * Integration test for SignupService.signup (P3 Task 2)
 * Runs against the local test DB (serial — argon2 requires --runInBand).
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *   pnpm exec jest --runInBand signup
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { seedSystemRoles } from "../../../prisma/seed-roles";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PasswordService } from "../../core/auth/password.service";
import { SignupService } from "./signup.service";
import { SignupDto } from "./dto/signup.dto";

const prisma = new PrismaClient();

function makeService(): SignupService {
  return new SignupService(
    prisma as unknown as PrismaService,
    new PasswordService(),
  );
}

describe("SignupService.signup", () => {
  const svc = makeService();
  const suffix = Date.now();
  const createdSlugs: string[] = [];
  const createdPersonIds: string[] = [];

  beforeAll(async () => {
    await seedSystemRoles(prisma);
  });

  afterAll(async () => {
    // Clean up in dependency order
    if (createdSlugs.length > 0) {
      const schools = await prisma.school.findMany({
        where: { slug: { in: createdSlugs } },
        select: { id: true },
      });
      const schoolIds = schools.map((s) => s.id);

      if (schoolIds.length > 0) {
        // memberships → role assignments
        const memberships = await prisma.membership.findMany({
          where: { schoolId: { in: schoolIds } },
          select: { id: true },
        });
        const membershipIds = memberships.map((m) => m.id);

        if (membershipIds.length > 0) {
          await prisma.roleAssignment.deleteMany({
            where: { membershipId: { in: membershipIds } },
          });
          await prisma.membership.deleteMany({
            where: { id: { in: membershipIds } },
          });
        }
        await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      }
    }

    if (createdPersonIds.length > 0) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }

    await prisma.$disconnect();
  });

  const validDto = (): SignupDto => ({
    schoolName: `Test School ${suffix}`,
    slug: `test-school-${suffix}`,
    country: "NG",
    firstName: "Ada",
    lastName: "Lovelace",
    gender: "FEMALE",
    email: `ada-${suffix}@example.com`,
    phone: `+2348100${suffix}`.slice(0, 15),
    password: "StrongP@ss1",
  });

  // ── 1. Valid signup ───────────────────────────────────────────────────────
  it("creates School, Person, Membership, RoleAssignment and returns slug + schoolId", async () => {
    const dto = validDto();
    const result = await svc.signup(dto);

    createdSlugs.push(dto.slug);

    // Return value
    expect(result.slug).toBe(dto.slug);

    // School created
    const school = await prisma.school.findUnique({ where: { slug: dto.slug } });
    expect(school).not.toBeNull();
    expect(result.schoolId).toBe(school!.id);

    // Person created with hashed password
    const person = await prisma.person.findUnique({ where: { email: dto.email } });
    expect(person).not.toBeNull();
    expect(person!.passwordHash).not.toBe(dto.password);
    expect(person!.phone).toBe(dto.phone);
    createdPersonIds.push(person!.id);

    // Membership
    const membership = await prisma.membership.findFirst({
      where: { personId: person!.id, schoolId: school!.id },
    });
    expect(membership).not.toBeNull();
    expect(membership!.status).toBe("active");

    // RoleAssignment to proprietor
    const proprietorRole = await prisma.role.findFirst({
      where: { schoolId: null, key: "proprietor" },
    });
    expect(proprietorRole).not.toBeNull();

    const assignment = await prisma.roleAssignment.findFirst({
      where: { membershipId: membership!.id, roleId: proprietorRole!.id },
    });
    expect(assignment).not.toBeNull();
  });

  // ── 2. Duplicate slug ────────────────────────────────────────────────────
  it("rejects a duplicate slug", async () => {
    const dto = validDto();
    dto.email = `ada2-${suffix}@example.com`;
    dto.phone = `+2348200${suffix}`.slice(0, 15);
    // slug is the same as created above — already taken
    await expect(svc.signup(dto)).rejects.toThrow();
  });

  // ── 3. Existing email ────────────────────────────────────────────────────
  it("throws ConflictException when email already registered", async () => {
    const existing = await prisma.person.create({
      data: { email: `existing-${suffix}@example.com` },
    });
    createdPersonIds.push(existing.id);

    const dto = validDto();
    dto.slug = `slug-email-conflict-${suffix}`;
    dto.email = existing.email!;
    dto.phone = `+2348300${suffix}`.slice(0, 15);

    await expect(svc.signup(dto)).rejects.toThrow(ConflictException);
  });

  // ── 4. Weak password ────────────────────────────────────────────────────
  it("throws BadRequestException for a weak password", async () => {
    const dto = validDto();
    dto.slug = `slug-weak-pw-${suffix}`;
    dto.email = `weak-${suffix}@example.com`;
    dto.phone = `+2348400${suffix}`.slice(0, 15);
    dto.password = "tooweak";

    await expect(svc.signup(dto)).rejects.toThrow(BadRequestException);
  });

  // ── 5. Atomicity ─────────────────────────────────────────────────────────
  it("does not create a partial School row when signup fails mid-transaction", async () => {
    const conflictPerson = await prisma.person.create({
      data: { email: `conflict-${suffix}@test.com` },
    });
    createdPersonIds.push(conflictPerson.id);

    const attemptedSlug = `atomic-test-${suffix}`;
    const dto = validDto();
    dto.slug = attemptedSlug;
    dto.email = conflictPerson.email!;
    dto.phone = `+2348500${suffix}`.slice(0, 15);

    await expect(svc.signup(dto)).rejects.toThrow();

    const schoolCount = await prisma.school.count({ where: { slug: attemptedSlug } });
    expect(schoolCount).toBe(0);
  });
});
