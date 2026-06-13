import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

describe("Audit logging (Prisma middleware)", () => {
  let prisma: PrismaService;
  const suffix = Date.now();
  let schoolId: string;
  let studentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    const s = await prisma.school.create({ data: { name: "Audit", slug: `audit-${suffix}` } });
    schoolId = s.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.onModuleDestroy();
  });

  it("records an audit row with actor + action when a student is created", async () => {
    await TenantContext.run({ schoolId, userId: "actor-1" }, async () => {
      const student = await prisma.student.create({
        data: {
          admissionNo: "AUD-1",
          firstName: "Audit",
          lastName: "Subject",
          gender: "MALE",
          dateOfBirth: new Date("2012-03-03"),
        } as never,
      });
      studentId = student.id;
    });

    const log = await prisma.auditLog.findFirst({
      where: { resourceType: "Student", resourceId: studentId },
    });
    expect(log).toBeTruthy();
    expect(log?.action).toBe("Student.create");
    expect(log?.actorId).toBe("actor-1");
    expect(log?.schoolId).toBe(schoolId);
  });
});
