import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

describe("Tenant isolation (Prisma middleware)", () => {
  let prisma: PrismaService;
  const suffix = Date.now();
  let schoolA: string;
  let schoolB: string;
  let studentAId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    const a = await prisma.school.create({ data: { name: "A", slug: `a-${suffix}` } });
    const b = await prisma.school.create({ data: { name: "B", slug: `b-${suffix}` } });
    schoolA = a.id;
    schoolB = b.id;
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
    await prisma.onModuleDestroy();
  });

  it("create injects the current schoolId automatically", async () => {
    const student = await TenantContext.run({ schoolId: schoolA, userId: "u" }, async () =>
      prisma.student.create({
        data: {
          admissionNo: "001",
          firstName: "Aisha",
          lastName: "Mohammed",
          gender: "FEMALE",
          dateOfBirth: new Date("2010-01-01"),
        } as never,
      }),
    );
    studentAId = student.id;
    expect(student.schoolId).toBe(schoolA);
  });

  it("school B cannot list school A's students", async () => {
    const visibleToB = await TenantContext.run({ schoolId: schoolB, userId: "u" }, async () =>
      prisma.student.findMany(),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it("school A sees its own student", async () => {
    const visibleToA = await TenantContext.run({ schoolId: schoolA, userId: "u" }, async () =>
      prisma.student.findMany(),
    );
    expect(visibleToA).toHaveLength(1);
  });

  it("findUnique by id is tenant-scoped (B cannot read A's student)", async () => {
    const found = await TenantContext.run({ schoolId: schoolB, userId: "u" }, async () =>
      prisma.student.findUnique({ where: { id: studentAId } }),
    );
    expect(found).toBeNull();
  });
});
