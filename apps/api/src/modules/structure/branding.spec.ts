/**
 * Integration test for SchoolsService.updateBranding
 * Runs against the local test DB only.
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { SchoolsService } from "./schools.service";
import { PrismaService } from "../../core/prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { STORAGE_SERVICE } from "../../core/storage/storage.types";

const prisma = new PrismaClient();

// Minimal storage stub — branding tests never touch storage
const storageStub = { put: jest.fn(), getSignedUrl: jest.fn() };

// Minimal JWT stub
const jwtStub = { signAsync: jest.fn().mockResolvedValue("tok") };

function makeService(): SchoolsService {
  const ps = new PrismaService();
  (ps as any).$connect = () => Promise.resolve();
  // point the service at the same underlying prisma
  return new SchoolsService(
    prisma as unknown as PrismaService,
    jwtStub as unknown as JwtService,
    storageStub as any,
  );
}

describe("SchoolsService.updateBranding", () => {
  let schoolId: string;
  const svc = makeService();

  beforeAll(async () => {
    // Create a minimal School for the tests (unique slug per run)
    const school = await prisma.school.create({
      data: {
        name: "Branding Test School",
        slug: `branding-test-${Date.now()}`,
      },
    });
    schoolId = school.id;
  });

  afterAll(async () => {
    await prisma.school.delete({ where: { id: schoolId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("persists themeKey and motto", async () => {
    await svc.updateBranding(schoolId, { themeKey: "teal", motto: "Knowledge" });
    const row = await prisma.school.findUnique({ where: { id: schoolId } });
    expect(row?.themeKey).toBe("teal");
    expect(row?.motto).toBe("Knowledge");
  });

  it("persists optional branding fields", async () => {
    await svc.updateBranding(schoolId, {
      type: "Private",
      state: "Lagos",
      technicalContact: {
        name: "Admin",
        phone: "+2348000000000",
        email: "admin@school.test",
      },
    });
    const row = await prisma.school.findUnique({ where: { id: schoolId } });
    expect(row?.type).toBe("Private");
    expect(row?.state).toBe("Lagos");
    expect(row?.technicalContactName).toBe("Admin");
    expect(row?.technicalContactPhone).toBe("+2348000000000");
    expect(row?.technicalContactEmail).toBe("admin@school.test");
  });

  it("throws BadRequestException for unknown themeKey", async () => {
    await expect(
      svc.updateBranding(schoolId, { themeKey: "bogus" }),
    ).rejects.toThrow(BadRequestException);
  });
});
