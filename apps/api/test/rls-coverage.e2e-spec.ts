import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService, TENANT_MODELS } from "../src/core/prisma/prisma.service";

// Complements rls.e2e-spec.ts (which proves the policy BLOCKS cross-tenant for Student):
// this asserts EVERY tenant-scoped table has FORCE RLS + a tenant_isolation policy, so a future
// table added to TENANT_MODELS (and thus middleware-scoped) cannot ship without the DB backstop.
// Catalog reads need no RLS, so running as the dev superuser is fine.
describe("RLS coverage (every TENANT_MODELS table is RLS-forced + policied)", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const tables = [...TENANT_MODELS];

  it("covers a non-trivial set of tenant tables", () => {
    expect(tables.length).toBeGreaterThanOrEqual(20);
  });

  it.each(tables)("%s has ROW LEVEL SECURITY enabled + FORCED", async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`,
      `"${table}"`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
    expect(rows[0]?.relforcerowsecurity).toBe(true);
  });

  it.each(tables)("%s has a tenant_isolation policy", async (table) => {
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'tenant_isolation'`,
      table,
    );
    expect(rows[0]?.n ?? 0).toBeGreaterThanOrEqual(1);
  });
});
