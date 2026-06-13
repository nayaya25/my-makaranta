import { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

// Connect as the non-superuser app role so RLS is actually enforced (postgres superuser bypasses it).
const APP_ROLE_URL = "postgresql://mymakaranta_app:app_dev_password@localhost:5432/my_makaranta?schema=public";

describe("Row-Level Security (defense-in-depth, app role)", () => {
  let prisma: PrismaService; // superuser — seeds data
  let appDb: PrismaClient; // app role — subject to RLS
  const suffix = Date.now();
  let schoolA: string;
  let schoolB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    appDb = new PrismaClient({ datasources: { db: { url: APP_ROLE_URL } } });
    await appDb.$connect();

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
    await appDb.$disconnect();
    await prisma.onModuleDestroy();
  });

  it("with no tenant GUC set, the app role sees zero rows", async () => {
    const rows = await appDb.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "Student"`,
    );
    expect(rows[0]?.count).toBe(0);
  });

  it("with the tenant GUC set to school A, the app role sees only A's rows", async () => {
    const rows = await appDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolA}'`);
      return tx.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "Student"`,
      );
    });
    expect(rows[0]?.count).toBe(1);
  });

  it("with the tenant GUC set to school B, the app role cannot see A's rows", async () => {
    const rows = await appDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolB}'`);
      return tx.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "Student"`,
      );
    });
    expect(rows[0]?.count).toBe(0);
  });
});
