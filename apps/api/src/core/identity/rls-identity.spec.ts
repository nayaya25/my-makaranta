import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
describe("rls_identity", () => {
  afterAll(() => prisma.$disconnect());
  it("has RLS enabled on Membership/StaffProfile/StudentProfile", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ relname: string; relrowsecurity: boolean }>>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('Membership','StaffProfile','StudentProfile')`,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
