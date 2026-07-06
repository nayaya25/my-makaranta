import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "discounts-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.invoiceDiscount.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.invoiceLine.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.invoice.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.studentDiscount.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.discountScheme.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("Discount models", () => {
  let schoolId: string;
  let school2Id: string;
  let classLevelId: string;
  let academicYearId: string;
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Discounts School 1", slug: `discounts-test-${ts}-1` } as never,
    });
    schoolId = school.id;

    const school2 = await prisma.school.create({
      data: { name: "Discounts School 2", slug: `discounts-test-${ts}-2` } as never,
    });
    school2Id = school2.id;

    const classLevel = await prisma.classLevel.create({
      data: { schoolId, name: "JSS 1", order: 1 },
    });
    classLevelId = classLevel.id;

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `${ts}/2026`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });
    academicYearId = academicYear.id;

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        number: 1,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });
    termId = term.id;

    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `DISC-${ts}`,
        firstName: "Amina",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2015-03-15"),
      },
    });
    studentId = student.id;
  });

  it("creates a DiscountScheme (PERCENT 50)", async () => {
    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: "Sibling Discount", method: "PERCENT", value: 50 },
    });
    expect(scheme.id).toBeDefined();
    expect(scheme.method).toBe("PERCENT");
    expect(scheme.value).toBe(50);
    expect(scheme.active).toBe(true);
  });

  it("rejects duplicate (schoolId, name) — @@unique([schoolId, name])", async () => {
    await expect(
      prisma.discountScheme.create({
        data: { schoolId, name: "Sibling Discount", method: "FIXED", value: 10000 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("assigns a StudentDiscount to a scheme", async () => {
    const scheme = await prisma.discountScheme.findFirstOrThrow({
      where: { schoolId, name: "Sibling Discount" },
    });

    const assignment = await prisma.studentDiscount.create({
      data: { schoolId, studentId, discountSchemeId: scheme.id },
    });
    expect(assignment.id).toBeDefined();
    expect(assignment.studentId).toBe(studentId);
    expect(assignment.discountSchemeId).toBe(scheme.id);
  });

  it("rejects duplicate (studentId, discountSchemeId) — @@unique([studentId, discountSchemeId])", async () => {
    const scheme = await prisma.discountScheme.findFirstOrThrow({
      where: { schoolId, name: "Sibling Discount" },
    });

    await expect(
      prisma.studentDiscount.create({
        data: { schoolId, studentId, discountSchemeId: scheme.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("deleting a scheme cascades StudentDiscount but SETs NULL on InvoiceDiscount.schemeId (row kept)", async () => {
    const scheme = await prisma.discountScheme.create({
      data: { schoolId, name: "Merit Award", method: "FIXED", value: 5000 },
    });

    const assignment = await prisma.studentDiscount.create({
      data: { schoolId, studentId, discountSchemeId: scheme.id },
    });

    const invoice = await prisma.invoice.create({
      data: {
        schoolId,
        studentId,
        termId,
        classLevelId,
        totalKobo: 45000,
        grossKobo: 50000,
        discountKobo: 5000,
      },
    });

    const invoiceDiscount = await prisma.invoiceDiscount.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        schemeId: scheme.id,
        name: scheme.name,
        amountKobo: 5000,
      },
    });

    await prisma.discountScheme.delete({ where: { id: scheme.id } });

    // StudentDiscount cascaded (row deleted)
    const survivingAssignment = await prisma.studentDiscount.findUnique({
      where: { id: assignment.id },
    });
    expect(survivingAssignment).toBeNull();

    // InvoiceDiscount row survives with schemeId set to NULL
    const survivingInvoiceDiscount = await prisma.invoiceDiscount.findUnique({
      where: { id: invoiceDiscount.id },
    });
    expect(survivingInvoiceDiscount).not.toBeNull();
    expect(survivingInvoiceDiscount!.schemeId).toBeNull();
    expect(survivingInvoiceDiscount!.name).toBe("Merit Award");
    expect(survivingInvoiceDiscount!.amountKobo).toBe(5000);
  });

  it("cannot read school 1's discount scheme when scoped by school 2 (tenant isolation)", async () => {
    const scheme = await prisma.discountScheme.findFirstOrThrow({
      where: { schoolId, name: "Sibling Discount" },
    });

    const crossTenantResult = await prisma.discountScheme.findFirst({
      where: { id: scheme.id, schoolId: school2Id },
    });
    expect(crossTenantResult).toBeNull();
  });
});
