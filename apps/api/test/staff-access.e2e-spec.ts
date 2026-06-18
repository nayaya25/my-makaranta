/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { PermissionsService } from "../src/core/auth/permissions/permissions.service";
import { StaffAccessModule } from "../src/modules/staff-access/staff-access.module";
import { StaffAccessService } from "../src/modules/staff-access/staff-access.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Staff access (e2e)", () => {
  let prisma: PrismaService;
  let svc: StaffAccessService;
  let perms: PermissionsService;
  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "u";
  let staffT: string;
  let staffB: string;
  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule, PrismaModule, AuthModule, StaffAccessModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    svc = moduleRef.get(StaffAccessService);
    perms = moduleRef.get(PermissionsService);
    const a = await prisma.school.create({ data: { name: `RB A ${suffix}`, slug: `rb-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `RB B ${suffix}`, slug: `rb-b-${suffix}` } });
    schoolBId = b.id;
    const t = await prisma.staff.create({ data: { schoolId, staffNo: `T-${suffix}`, firstName: "Tee", lastName: "Cher", email: `t-${suffix}@e.test`, phone: `+234890${String(suffix).slice(-7)}` } });
    staffT = t.id;
    const sb = await prisma.staff.create({ data: { schoolId: schoolBId, staffNo: `B-${suffix}`, firstName: "Bee", lastName: "Staff", email: `b-${suffix}@e.test`, phone: `+234891${String(suffix).slice(-7)}` } });
    staffB = sb.id;
  });
  afterAll(async () => {
    await prisma.staffPermission.deleteMany({ where: { staffId: { in: [staffT, staffB] } } });
    await prisma.onModuleDestroy();
  });

  it("catalog returns the seeded permissions + presets", async () => {
    const cat = await asA(() => svc.getCatalog());
    expect(cat.catalog.some((c: any) => c.key === "results.record")).toBe(true);
    expect(cat.presets.FORM_TEACHER).toContain("results.record");
  });

  it("set + get staff permissions (replace-as-unit); keysFor unions for a STAFF caller", async () => {
    await asA(() => svc.setStaffPermissions(staffT, ["results.record", "attendance.mark"]));
    const got = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got.keys].sort()).toEqual(["attendance.mark", "results.record"]);
    const keys = await asA(() => perms.keysFor({ id: "any", identityType: "STAFF", identityId: staffT }));
    expect(keys.has("results.record")).toBe(true);
    expect(keys.has("attendance.mark")).toBe(true);
    expect(keys.has("fees.manage")).toBe(false);
    // replace-as-unit
    await asA(() => svc.setStaffPermissions(staffT, ["attendance.view"]));
    const got2 = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got2.keys]).toEqual(["attendance.view"]);
  });

  it("rejects a foreign staff id (404) and a bad permission key (400, no write)", async () => {
    await expect(asA(() => svc.getStaffPermissions(staffB))).rejects.toThrow(NotFoundException);
    await expect(asA(() => svc.setStaffPermissions(staffB, ["results.record"]))).rejects.toThrow(NotFoundException);
    await asA(() => svc.setStaffPermissions(staffT, ["results.record"]));
    await expect(asA(() => svc.setStaffPermissions(staffT, ["not.a.key"]))).rejects.toThrow(BadRequestException);
    const got = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got.keys]).toEqual(["results.record"]); // unchanged by the rejected call
  });

  it("keysFor for a non-STAFF identity does not union staff grants", async () => {
    const keys = await asA(() => perms.keysFor({ id: "any", identityType: "PROPRIETOR", identityId: null }));
    expect(keys.has("results.record")).toBe(false); // no UserPermission rows for 'any'
  });
});
