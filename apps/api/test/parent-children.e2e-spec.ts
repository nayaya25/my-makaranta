import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { PaymentsProviderModule } from "../src/core/payments/payments.module";
import { ParentModule } from "../src/modules/parent/parent.module";
import { ParentService } from "../src/modules/parent/parent.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Parent children (e2e)", () => {
  let prisma: PrismaService;
  let parent: ParentService;

  const suffix = Date.now();
  const userId = "test-user";
  let schoolId: string;
  let schoolBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        PaymentsProviderModule,
        ParentModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    parent = moduleRef.get(ParentService);

    const a = await prisma.school.create({ data: { name: `Par A ${suffix}`, slug: `par-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Par B ${suffix}`, slug: `par-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("parent children", () => {
    let parentId: string;
    beforeAll(async () => {
      const par = await prisma.parent.create({ data: { schoolId, phone: `+234830${String(Date.now()).slice(-7)}`, firstName: "Par", lastName: "Ent" } });
      parentId = par.id;
      for (const n of ["Kid One", "Kid Two"]) {
        const [f, l] = n.split(" ");
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${f}-${l}-${suffix}`, firstName: f!, lastName: l!, gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
        await prisma.guardian.create({ data: { studentId: stu.id, parentId: par.id, relationship: "FATHER" } });
      }
    });

    it("returns the linked parent's children", async () => {
      const kids = await asA(() => parent.getChildren({ id: "u1", phone: "x", schoolId, identityType: "PARENT", identityId: parentId }));
      expect(kids.length).toBe(2);
      expect(kids.every((k) => k.name.length > 0 && k.admissionNo.length > 0)).toBe(true);
    });
    it("returns [] for a non-parent user", async () => {
      const kids = await asA(() => parent.getChildren({ id: "u2", phone: "y", schoolId, identityType: "PENDING" }));
      expect(kids).toEqual([]);
    });
    it("returns [] for a parent id from another tenant", async () => {
      const kids = await asB(() => parent.getChildren({ id: "u3", phone: "z", schoolId: schoolBId, identityType: "PARENT", identityId: parentId }));
      expect(kids).toEqual([]);
    });
  });
});
