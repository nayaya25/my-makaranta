import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { runStudentImport, type StudentImportRow } from "../src/modules/imports/students-import";

describe("Student bulk-import logic", () => {
  let prisma: PrismaService;
  const s = Date.now();
  let schoolId: string;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = ref.get(PrismaService);
    await prisma.onModuleInit();
    const school = await prisma.school.create({ data: { name: "Import", slug: `imp-${s}` } });
    schoolId = school.id;
  });

  afterAll(async () => {
    await prisma.guardian.deleteMany({ where: { student: { schoolId } } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.parent.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.onModuleDestroy();
  });

  it("imports valid rows, reports per-row errors, links parents, and is tenant-scoped", async () => {
    const rows: StudentImportRow[] = [
      { admissionNo: `OK-1-${s}`, firstName: "Aisha", lastName: "Bello", gender: "Female", dateOfBirth: "2011-01-01" },
      {
        admissionNo: `OK-2-${s}`,
        firstName: "Chidi",
        lastName: "Okonkwo",
        gender: "M",
        dateOfBirth: "2012-02-02",
        parentPhone: `+23480${String(s).slice(-7)}`,
        parentFirstName: "Ngozi",
        guardianRelationship: "Mother",
      },
      { admissionNo: `BAD-3-${s}`, firstName: "Bad", lastName: "Gender", gender: "X", dateOfBirth: "2010-01-01" },
      { admissionNo: `BAD-4-${s}`, firstName: "No", gender: "M", dateOfBirth: "2010-01-01" }, // missing lastName
      { admissionNo: `OK-1-${s}`, firstName: "Dup", lastName: "Licate", gender: "M", dateOfBirth: "2010-01-01" }, // duplicate admissionNo
    ];

    const result = await TenantContext.run({ schoolId, userId: "importer" }, () =>
      runStudentImport(prisma, rows),
    );

    expect(result.total).toBe(5);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(3);
    // error rows are 3 (gender), 4 (lastName), 5 (duplicate)
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4, 5]);
    expect(result.errors.find((e) => e.row === 5)?.message).toMatch(/duplicate/i);

    // the parent row produced a linked guardian
    const withGuardian = await TenantContext.run({ schoolId, userId: "x" }, () =>
      prisma.student.findFirst({
        where: { admissionNo: `OK-2-${s}` },
        include: { guardians: { include: { parent: true } } },
      }),
    );
    expect(withGuardian?.guardians[0]?.parent.firstName).toBe("Ngozi");
  });
});
