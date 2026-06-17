import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/core/auth/auth.service";
import { SmsService } from "../src/core/auth/sms.service";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Parent link (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let sms: SmsService;
  const phones: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    sms = moduleRef.get(SmsService);
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

  describe("parent identity link", () => {
    const stamp = Date.now().toString(36);
    let schoolAId: string;
    let parentId: string;
    let parentPhone: string;

    beforeAll(async () => {
      const a = await prisma.school.create({ data: { name: `PL-A-${stamp}`, slug: `pl-a-${stamp}` } });
      schoolAId = a.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: a.id, name: "Y", startDate: new Date(), endDate: new Date() } });
      const term = await prisma.term.create({ data: { schoolId: a.id, academicYearId: ay.id, number: 1, startDate: new Date(), endDate: new Date() } });
      const lvl = await prisma.classLevel.create({ data: { schoolId: a.id, name: `L-${stamp}`, order: 1 } });
      const cls = await prisma.class.create({ data: { schoolId: a.id, classLevelId: lvl.id, name: `C-${stamp}` } });
      const stu = await prisma.student.create({ data: { schoolId: a.id, admissionNo: `PS-${stamp}`, firstName: "Kid", lastName: "One", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
      await prisma.enrollment.create({ data: { studentId: stu.id, classId: cls.id, termId: term.id } });
      parentPhone = `+234810${String(Date.now()).slice(-7)}`;
      phones.push(parentPhone);
      const par = await prisma.parent.create({ data: { schoolId: a.id, phone: parentPhone, email: `p-${stamp}@e.test`, firstName: "Par", lastName: "Ent" } });
      parentId = par.id;
      await prisma.guardian.create({ data: { studentId: stu.id, parentId: par.id, relationship: "FATHER", isPrimary: true } });
    });

    const login = async (phone: string) => {
      await auth.requestOtp(phone);
      const code = sms.lastCodeForTest(phone)!;
      return auth.verifyOtp(phone, code);
    };

    it("links a PENDING user to a single matching Parent + grants parent perms", async () => {
      const res = await login(parentPhone);
      expect(res.user.identityType).toBe("PARENT");
      expect(res.user.schoolId).toBe(schoolAId);
      const u = await prisma.user.findFirstOrThrow({ where: { phone: parentPhone } });
      expect(u.identityId).toBe(parentId);
      const perms = await prisma.userPermission.findMany({ where: { userId: u.id }, include: { permission: { select: { key: true } } } });
      expect(perms.map((p) => p.permission.key)).toEqual(expect.arrayContaining(["fees.pay.own", "results.view.own"]));
    });

    it("is idempotent on re-login (no duplicate perms, still PARENT)", async () => {
      const res = await login(parentPhone);
      expect(res.user.identityType).toBe("PARENT");
      const u = await prisma.user.findFirstOrThrow({ where: { phone: parentPhone } });
      expect((await prisma.userPermission.findMany({ where: { userId: u.id } })).length).toBe(2);
    });

    it("leaves a non-matching phone PENDING", async () => {
      const phone = `+234819000${String(Date.now()).slice(-4)}`;
      phones.push(phone);
      const res = await login(phone);
      expect(res.user.identityType).toBe("PENDING");
      expect(res.user.schoolId).toBeNull();
    });

    it("does not link when the phone matches Parents in multiple schools", async () => {
      const b = await prisma.school.create({ data: { name: `PL-B-${stamp}`, slug: `pl-b-${stamp}` } });
      const multiPhone = `+234820${String(Date.now()).slice(-7)}`;
      phones.push(multiPhone);
      await prisma.parent.create({ data: { schoolId: schoolAId, phone: multiPhone, firstName: "M", lastName: "A" } });
      await prisma.parent.create({ data: { schoolId: b.id, phone: multiPhone, firstName: "M", lastName: "B" } });
      const res = await login(multiPhone);
      expect(res.user.identityType).toBe("PENDING");
    });
  });
});
