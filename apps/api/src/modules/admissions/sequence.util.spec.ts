import { PrismaClient } from "@prisma/client";
import { nextApplicationNo, nextAdmissionNo } from "./sequence.util";

const prisma = new PrismaClient();

afterAll(async () => {
  const testSchools = await prisma.school.findMany({
    where: { slug: { startsWith: "seq-test-" } },
    select: { id: true },
  });
  const ids = testSchools.map((s) => s.id);

  // Clean up students and applicants first (FK deps), then supporting records
  await prisma.enrollment.deleteMany({ where: { student: { schoolId: { in: ids } } } });
  await prisma.guardian.deleteMany({ where: { student: { schoolId: { in: ids } } } });
  await prisma.student.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.applicant.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.classLevel.deleteMany({ where: { schoolId: { in: ids } } });
  await prisma.school.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("nextApplicationNo", () => {
  let schoolId: string;
  let school2Id: string;
  let classLevelId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: "Seq School 1", slug: `seq-test-${ts}-1` } as never,
    });
    schoolId = school.id;

    const school2 = await prisma.school.create({
      data: { name: "Seq School 2", slug: `seq-test-${ts}-2` } as never,
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

  it("returns APP-2026-0001 when 0 applicants exist for the school", async () => {
    const no = await nextApplicationNo(prisma as never, schoolId, 2026);
    expect(no).toBe("APP-2026-0001");
  });

  it("returns APP-2026-0002 after one applicant exists", async () => {
    await prisma.applicant.create({
      data: {
        schoolId,
        applicationNo: "APP-2026-0001",
        firstName: "Test",
        lastName: "Applicant",
        gender: "MALE",
        dateOfBirth: new Date("2015-01-01"),
        desiredClassLevelId: classLevelId,
        academicYearId,
        guardianName: "Test Guardian",
        guardianPhone: "08011111111",
        guardianRelation: "FATHER",
        source: "STAFF",
      },
    });

    const no = await nextApplicationNo(prisma as never, schoolId, 2026);
    expect(no).toBe("APP-2026-0002");
  });

  it("returns APP-2026-0001 for a different school (independent count)", async () => {
    const no = await nextApplicationNo(prisma as never, school2Id, 2026);
    expect(no).toBe("APP-2026-0001");
  });
});

describe("nextAdmissionNo", () => {
  let schoolId: string;
  let school2Id: string;

  beforeAll(async () => {
    const ts = Date.now() + 1; // offset to avoid slug collision with outer suite

    const school = await prisma.school.create({
      data: { name: "Seq Adm School 1", slug: `seq-test-${ts}-adm-1` } as never,
    });
    schoolId = school.id;

    const school2 = await prisma.school.create({
      data: { name: "Seq Adm School 2", slug: `seq-test-${ts}-adm-2` } as never,
    });
    school2Id = school2.id;
  });

  it("returns ADM-2026-0001 when 0 students exist for the school", async () => {
    const no = await nextAdmissionNo(prisma as never, schoolId, 2026);
    expect(no).toBe("ADM-2026-0001");
  });

  it("returns ADM-2026-0002 after one student exists", async () => {
    await prisma.student.create({
      data: {
        schoolId,
        admissionNo: "ADM-2026-0001",
        firstName: "Test",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2015-01-01"),
      },
    });

    const no = await nextAdmissionNo(prisma as never, schoolId, 2026);
    expect(no).toBe("ADM-2026-0002");
  });

  it("returns ADM-2026-0001 for a different school (independent count)", async () => {
    const no = await nextAdmissionNo(prisma as never, school2Id, 2026);
    expect(no).toBe("ADM-2026-0001");
  });
});
