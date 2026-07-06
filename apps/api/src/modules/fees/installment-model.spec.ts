import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "installments-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.installment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.scheduleInstallment.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.invoiceLine.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.invoice.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.student.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("Installment models", () => {
  let schoolId: string;
  let school2Id: string;
  let classLevelId: string;
  let academicYearId: string;
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Installments School 1", slug: `installments-test-${ts}-1` } as never,
    });
    schoolId = school.id;

    const school2 = await prisma.school.create({
      data: { name: "Installments School 2", slug: `installments-test-${ts}-2` } as never,
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
        admissionNo: `INST-${ts}`,
        firstName: "Amina",
        lastName: "Bello",
        gender: "FEMALE",
        dateOfBirth: new Date("2015-03-15"),
      },
    });
    studentId = student.id;
  });

  it("creates a ScheduleInstallment", async () => {
    const row = await prisma.scheduleInstallment.create({
      data: {
        schoolId,
        classLevelId,
        termId,
        order: 1,
        label: "First",
        percentBps: 5000,
        dueDate: new Date("2026-09-15"),
      },
    });
    expect(row.id).toBeDefined();
    expect(row.percentBps).toBe(5000);
    expect(row.order).toBe(1);
  });

  it("rejects duplicate (classLevelId, termId, order) — @@unique([classLevelId,termId,order])", async () => {
    await expect(
      prisma.scheduleInstallment.create({
        data: {
          schoolId,
          classLevelId,
          termId,
          order: 1,
          label: "Duplicate",
          percentBps: 2500,
          dueDate: new Date("2026-10-15"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("creates an Invoice + Installment", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        schoolId,
        studentId,
        termId,
        classLevelId,
        totalKobo: 100000,
        grossKobo: 100000,
        discountKobo: 0,
      },
    });

    const installment = await prisma.installment.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        order: 1,
        label: "First",
        amountKobo: 50000,
        dueDate: new Date("2026-09-15"),
      },
    });

    expect(installment.id).toBeDefined();
    expect(installment.amountKobo).toBe(50000);
  });

  it("rejects duplicate (invoiceId, order) — @@unique([invoiceId,order])", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { schoolId, studentId, termId },
    });

    await expect(
      prisma.installment.create({
        data: {
          schoolId,
          invoiceId: invoice.id,
          order: 1,
          label: "Duplicate",
          amountKobo: 25000,
          dueDate: new Date("2026-10-15"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("deleting the invoice cascades its installments", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { schoolId, studentId, termId },
    });

    const installments = await prisma.installment.findMany({ where: { invoiceId: invoice.id } });
    expect(installments.length).toBeGreaterThan(0);

    await prisma.invoice.delete({ where: { id: invoice.id } });

    const survivors = await prisma.installment.findMany({ where: { invoiceId: invoice.id } });
    expect(survivors).toHaveLength(0);
  });

  it("cannot read school 1's schedule installment when scoped by school 2 (tenant isolation)", async () => {
    const row = await prisma.scheduleInstallment.findFirstOrThrow({
      where: { schoolId, classLevelId, termId, order: 1 },
    });

    const crossTenantResult = await prisma.scheduleInstallment.findFirst({
      where: { id: row.id, schoolId: school2Id },
    });
    expect(crossTenantResult).toBeNull();
  });
});
