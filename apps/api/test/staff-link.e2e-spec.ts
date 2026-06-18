import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { ConflictException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/core/auth/auth.service";
import { SmsService } from "../src/core/auth/sms.service";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { StaffService } from "../src/modules/sis/staff.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

describe("Staff link (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let sms: SmsService;
  let staffService: StaffService;
  const phones: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    sms = moduleRef.get(SmsService);
    staffService = moduleRef.get(StaffService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await prisma.otpRequest.deleteMany({ where: { phone: { in: phones } } });
    const users = await prisma.user.findMany({ where: { phone: { in: phones } }, select: { id: true } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });

  const stamp = Date.now().toString(36);
  const login = async (phone: string) => {
    await auth.requestOtp(phone);
    const code = sms.lastCodeForTest(phone)!;
    return auth.verifyOtp(phone, code);
  };
  const mkStaff = (schoolId: string, phone: string, tag: string) =>
    prisma.staff.create({ data: { schoolId, staffNo: `SN-${tag}`, firstName: "Staff", lastName: tag, email: `sf-${tag}@e.test`, phone } });

  let schoolAId: string;
  beforeAll(async () => {
    const a = await prisma.school.create({ data: { name: `SL-A-${stamp}`, slug: `sl-a-${stamp}` } });
    schoolAId = a.id;
  });

  it("links a PENDING login to its Staff (exactly one match) with NO permissions", async () => {
    const phone = `+234812${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const staff = await mkStaff(schoolAId, phone, `one-${stamp}`);
    const res = await login(phone);
    expect(res.user.identityType).toBe("STAFF");
    expect(res.user.schoolId).toBe(schoolAId);
    const user = await prisma.user.findFirstOrThrow({ where: { phone } });
    expect(user.identityId).toBe(staff.id);
    const perms = await prisma.userPermission.count({ where: { userId: user.id } });
    expect(perms).toBe(0);
  });

  it("stays PENDING when a phone matches one Parent AND one Staff (ambiguous)", async () => {
    const phone = `+234813${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    await mkStaff(schoolAId, phone, `amb-${stamp}`);
    await prisma.parent.create({ data: { schoolId: schoolAId, phone, firstName: "P", lastName: "A", email: `pa-${stamp}@e.test` } });
    const res = await login(phone);
    expect(res.user.identityType).toBe("PENDING");
    expect(res.user.schoolId).toBeNull();
  });

  it("stays PENDING when the phone matches staff in two schools", async () => {
    const phone = `+234814${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const sb = await prisma.school.create({ data: { name: `SL-B-${stamp}`, slug: `sl-b-${stamp}-${Date.now().toString(36)}` } });
    await mkStaff(schoolAId, phone, `two-a-${stamp}`);
    await prisma.staff.create({ data: { schoolId: sb.id, staffNo: `SN-two-b-${stamp}`, firstName: "Staff", lastName: "TwoB", email: `sf-two-b-${stamp}@e.test`, phone } });
    const res = await login(phone);
    expect(res.user.identityType).toBe("PENDING");
  });

  it("rejects a duplicate (schoolId, phone) staff via the create path (409)", async () => {
    const phone = `+234818${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const run = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolAId, userId: "u" }, fn);
    await run(() => staffService.create({ staffNo: `D1-${stamp}`, firstName: "Dup", lastName: "One", email: `d1-${stamp}@e.test`, phone } as never));
    await expect(run(() => staffService.create({ staffNo: `D2-${stamp}`, firstName: "Dup", lastName: "Two", email: `d2-${stamp}@e.test`, phone } as never))).rejects.toThrow(ConflictException);
  });

  it("re-login is idempotent — stays STAFF", async () => {
    const phone = `+234815${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    await mkStaff(schoolAId, phone, `idem-${stamp}`);
    await login(phone);
    const res = await login(phone);
    expect(res.user.identityType).toBe("STAFF");
  });

  it("never relinks an already-claimed identity, even if the phone also matches a Staff", async () => {
    const phone = `+234817${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    // Pre-existing PARENT user (already claimed) whose phone ALSO matches a Staff row.
    await prisma.user.create({ data: { phone, identityType: "PARENT", identityId: "some-parent-id", schoolId: schoolAId } });
    await mkStaff(schoolAId, phone, `norelink-${stamp}`);
    const res = await login(phone);
    expect(res.user.identityType).toBe("PARENT"); // not downgraded/relinked to STAFF
    expect(res.user.schoolId).toBe(schoolAId);
  });
});
