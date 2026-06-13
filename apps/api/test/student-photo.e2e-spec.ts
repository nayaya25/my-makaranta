import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { StudentsService } from "../src/modules/sis/students.service";

describe("Student photo upload", () => {
  let prisma: PrismaService;
  let students: StudentsService;
  const s = Date.now();
  let schoolId: string;
  let studentId: string;

  beforeAll(async () => {
    process.env.STORAGE_LOCAL_DIR = `.storage-test-${s}`;
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = ref.get(PrismaService);
    students = ref.get(StudentsService);
    await prisma.onModuleInit();
    const school = await prisma.school.create({ data: { name: "Ph", slug: `ph-${s}` } });
    schoolId = school.id;
    await TenantContext.run({ schoolId, userId: "u" }, async () => {
      const st = await prisma.student.create({
        data: { admissionNo: `P-${s}`, firstName: "Pic", lastName: "Student", gender: "MALE", dateOfBirth: new Date("2011-01-01") } as never,
      });
      studentId = st.id;
    });
  });

  afterAll(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(`.storage-test-${s}`, { recursive: true, force: true });
    delete process.env.STORAGE_LOCAL_DIR;
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.onModuleDestroy();
  });

  it("stores a valid image and sets photoUrl", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex"); // PNG magic bytes (enough for the test)
    const res = await TenantContext.run({ schoolId, userId: "u" }, () =>
      students.setPhoto(studentId, { buffer: png, mimetype: "image/png", size: png.length }),
    );
    expect(res.photoUrl).toContain(`photos/${schoolId}/${studentId}.png`);

    const updated = await TenantContext.run({ schoolId, userId: "u" }, () =>
      prisma.student.findUnique({ where: { id: studentId } }),
    );
    expect(updated?.photoUrl).toBe(res.photoUrl);
  });

  it("rejects a non-image file type", async () => {
    await TenantContext.run({ schoolId, userId: "u" }, async () => {
      await expect(
        students.setPhoto(studentId, { buffer: Buffer.from("x"), mimetype: "application/pdf", size: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
