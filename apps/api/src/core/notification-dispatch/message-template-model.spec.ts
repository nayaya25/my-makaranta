import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "msg-tpl-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.messageTemplate.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("MessageTemplate model", () => {
  let schoolAId: string;
  let schoolBId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const schoolA = await prisma.school.create({
      data: { name: "Msg Tpl School A", slug: `msg-tpl-test-${ts}-a` } as never,
    });
    schoolAId = schoolA.id;

    const schoolB = await prisma.school.create({
      data: { name: "Msg Tpl School B", slug: `msg-tpl-test-${ts}-b` } as never,
    });
    schoolBId = schoolB.id;
  });

  it("creates a MessageTemplate", async () => {
    const tpl = await prisma.messageTemplate.create({
      data: { schoolId: schoolAId, key: "RESULTS_READY", body: "Hello {{studentName}}" },
    });

    expect(tpl.id).toBeDefined();
    expect(tpl.schoolId).toBe(schoolAId);
    expect(tpl.key).toBe("RESULTS_READY");
    expect(tpl.body).toBe("Hello {{studentName}}");
    expect(tpl.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate (schoolId,key) — @@unique([schoolId,key])", async () => {
    await expect(
      prisma.messageTemplate.create({
        data: { schoolId: schoolAId, key: "RESULTS_READY", body: "Another body" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows a second school to reuse the same key", async () => {
    const tpl = await prisma.messageTemplate.create({
      data: { schoolId: schoolBId, key: "RESULTS_READY", body: "Hi {{studentName}}" },
    });

    expect(tpl.id).toBeDefined();
    expect(tpl.schoolId).toBe(schoolBId);
    expect(tpl.key).toBe("RESULTS_READY");
  });
});
