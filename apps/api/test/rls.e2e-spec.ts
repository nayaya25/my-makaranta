import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

// RLS is enforced for the `mymakaranta_app` role (non-superuser, NOBYPASSRLS). We exercise it by
// SET ROLE-ing to it inside a transaction — a superuser that SET ROLEs to a non-superuser role
// loses its RLS bypass — so a pass here proves the database policies block cross-tenant reads,
// independent of the app-layer Prisma middleware. No passwords or extra connections needed.
describe("Row-Level Security (defense-in-depth)", () => {
  let prisma: PrismaService;
  const suffix = Date.now();
  let schoolA: string;
  let schoolB: string;

  const countStudentsAs = (schoolId?: string) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE mymakaranta_app`);
      if (schoolId) await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolId}'`);
      const rows = await tx.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "Student"`,
      );
      return rows[0]?.count ?? -1;
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    const a = await prisma.school.create({ data: { name: "A", slug: `rls-a-${suffix}` } });
    const b = await prisma.school.create({ data: { name: "B", slug: `rls-b-${suffix}` } });
    schoolA = a.id;
    schoolB = b.id;
    await TenantContext.run({ schoolId: schoolA, userId: "u" }, async () => {
      await prisma.student.create({
        data: {
          admissionNo: "RLS-001",
          firstName: "Ngozi",
          lastName: "Okafor",
          gender: "FEMALE",
          dateOfBirth: new Date("2011-02-02"),
        } as never,
      });
    });
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { schoolId: { in: [schoolA, schoolB] } } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
    await prisma.onModuleDestroy();
  });

  it("with no tenant set, the app role sees zero rows", async () => {
    expect(await countStudentsAs()).toBe(0);
  });

  it("with tenant = school A, the app role sees only A's rows", async () => {
    expect(await countStudentsAs(schoolA)).toBe(1);
  });

  it("with tenant = school B, the app role cannot see A's rows", async () => {
    expect(await countStudentsAs(schoolB)).toBe(0);
  });
});
