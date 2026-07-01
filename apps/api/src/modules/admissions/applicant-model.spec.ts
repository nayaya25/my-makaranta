import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  // Clean up in reverse FK order, scoped to test schools only
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "admissions-test-" } },
    select: { id: true },
  });
  const testSchoolIds = testSchools.map((s) => s.id);

  await prisma.applicant.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.term.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: testSchoolIds } } });
  await prisma.school.deleteMany({ where: { id: { in: testSchoolIds } } });
  await prisma.$disconnect();
});

describe("Applicant model", () => {
  let schoolId: string;
  let school2Id: string;
  let classLevelId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Admissions School 1", slug: `admissions-test-${ts}-1` } as never,
    });
    schoolId = school.id;

    const school2 = await prisma.school.create({
      data: { name: "Admissions School 2", slug: `admissions-test-${ts}-2` } as never,
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
  });

  it("creates an applicant with status defaulting to APPLIED", async () => {
    const applicant = await prisma.applicant.create({
      data: {
        schoolId,
        applicationNo: "APP-001",
        firstName: "Amina",
        lastName: "Yusuf",
        gender: "FEMALE",
        dateOfBirth: new Date("2015-03-15"),
        desiredClassLevelId: classLevelId,
        academicYearId,
        guardianName: "Fatima Yusuf",
        guardianPhone: "08012345678",
        guardianRelation: "MOTHER",
        source: "PUBLIC",
      },
    });

    expect(applicant.status).toBe("APPLIED");
    expect(applicant.schoolId).toBe(schoolId);
    expect(applicant.applicationNo).toBe("APP-001");
  });

  it("throws P2002 on duplicate (schoolId, applicationNo)", async () => {
    await expect(
      prisma.applicant.create({
        data: {
          schoolId,
          applicationNo: "APP-001", // same as above — duplicate!
          firstName: "Duplicate",
          lastName: "Applicant",
          gender: "MALE",
          dateOfBirth: new Date("2015-05-10"),
          desiredClassLevelId: classLevelId,
          academicYearId,
          guardianName: "Guardian Name",
          guardianPhone: "08099999999",
          guardianRelation: "FATHER",
          source: "STAFF",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cannot find school 1 applicant when scoped by school 2", async () => {
    const applicant = await prisma.applicant.findFirst({
      where: { applicationNo: "APP-001", schoolId },
    });
    expect(applicant).not.toBeNull();

    const crossTenantResult = await prisma.applicant.findFirst({
      where: { id: applicant!.id, schoolId: school2Id },
    });
    expect(crossTenantResult).toBeNull();
  });
});
