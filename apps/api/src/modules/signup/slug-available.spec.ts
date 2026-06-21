/**
 * Integration test for SignupService.checkSlug
 * Runs against the local test DB.
 * Run: DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' pnpm exec jest slug-available
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PasswordService } from "../../core/auth/password.service";
import { SignupService } from "./signup.service";

const prisma = new PrismaClient();

function makeService(): SignupService {
  return new SignupService(prisma as unknown as PrismaService, new PasswordService());
}

describe("SignupService.checkSlug", () => {
  const svc = makeService();
  let createdSchoolId: string;
  const takenSlug = `taken-slug-${Date.now()}`;

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: "Slug Test School", slug: takenSlug },
    });
    createdSchoolId = school.id;
  });

  afterAll(async () => {
    await prisma.school.delete({ where: { id: createdSchoolId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("returns available:false with reason matching /reserved/ for a reserved slug", async () => {
    const result = await svc.checkSlug("app");
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/reserved/i);
  });

  it("returns available:false for a too-short slug", async () => {
    const result = await svc.checkSlug("ab");
    expect(result.available).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("returns available:false with reason 'taken' for an existing school slug", async () => {
    const result = await svc.checkSlug(takenSlug);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("taken");
  });

  it("returns available:true with reason null for a valid unused slug", async () => {
    const result = await svc.checkSlug(`valid-slug-${Date.now()}`);
    expect(result.available).toBe(true);
    expect(result.reason).toBeNull();
  });
});
