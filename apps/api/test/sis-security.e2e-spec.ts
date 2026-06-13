import { Test } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { SchoolsService } from "../src/modules/structure/schools.service";
import { EnrollmentService } from "../src/modules/sis/enrollment.service";
import { ParentsService } from "../src/modules/sis/parents.service";

// Regression tests for the Sprint 1 security review findings.
describe("SIS security (tenant isolation + privilege escalation)", () => {
  let prisma: PrismaService;
  let schools: SchoolsService;
  let enrollment: EnrollmentService;
  let parents: ParentsService;
  const s = Date.now();
  const ids: { schoolA?: string; schoolB?: string; studentA?: string; classA?: string; termA?: string; parentA?: string; userMember?: string } = {};

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = ref.get(PrismaService);
    schools = ref.get(SchoolsService);
    enrollment = ref.get(EnrollmentService);
    parents = ref.get(ParentsService);
    await prisma.onModuleInit();

    const a = await prisma.school.create({ data: { name: "A", slug: `sec-a-${s}` } });
    const b = await prisma.school.create({ data: { name: "B", slug: `sec-b-${s}` } });
    ids.schoolA = a.id;
    ids.schoolB = b.id;

    await TenantContext.run({ schoolId: a.id, userId: "x" }, async () => {
      const ay = await prisma.academicYear.create({
        data: { name: `Y-${s}`, startDate: new Date(), endDate: new Date() } as never,
      });
      const term = await prisma.term.create({
        data: { academicYearId: ay.id, number: 1, startDate: new Date(), endDate: new Date() } as never,
      });
      const lvl = await prisma.classLevel.create({ data: { name: `JSS1-${s}`, order: 1 } as never });
      const cls = await prisma.class.create({ data: { classLevelId: lvl.id, name: `JSS1A-${s}` } as never });
      const stu = await prisma.student.create({
        data: { admissionNo: `A-${s}`, firstName: "A", lastName: "One", gender: "MALE", dateOfBirth: new Date("2011-01-01") } as never,
      });
      const par = await prisma.parent.create({
        data: { phone: `+23480${String(s).slice(-7)}`, firstName: "P", lastName: "A" } as never,
      });
      ids.termA = term.id;
      ids.classA = cls.id;
      ids.studentA = stu.id;
      ids.parentA = par.id;
    });

    // A user who already belongs to school B (not PENDING).
    const member = await prisma.user.create({
      data: { phone: `+23481${String(s).slice(-7)}`, identityType: "PROPRIETOR", identityId: "", schoolId: b.id },
    });
    ids.userMember = member.id;
  });

  afterAll(async () => {
    const inAB = { schoolId: { in: [ids.schoolA!, ids.schoolB!] } };
    await prisma.enrollment.deleteMany({ where: { student: inAB } });
    await prisma.guardian.deleteMany({ where: { student: inAB } });
    await prisma.student.deleteMany({ where: inAB });
    await prisma.parent.deleteMany({ where: inAB });
    await prisma.class.deleteMany({ where: inAB });
    await prisma.classLevel.deleteMany({ where: inAB });
    await prisma.term.deleteMany({ where: inAB });
    await prisma.academicYear.deleteMany({ where: inAB });
    await prisma.auditLog.deleteMany({ where: { schoolId: { in: [ids.schoolA!, ids.schoolB!] } } });
    if (ids.userMember) await prisma.user.deleteMany({ where: { id: ids.userMember } });
    await prisma.school.deleteMany({ where: { id: { in: [ids.schoolA!, ids.schoolB!] } } });
    await prisma.onModuleDestroy();
  });

  it("rejects school creation by a user who already belongs to a school", async () => {
    await expect(
      schools.createSchool({ name: "Sneaky" } as never, ids.userMember!),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects enrolling a student from another tenant (cross-tenant IDOR)", async () => {
    await TenantContext.run({ schoolId: ids.schoolB!, userId: "b" }, async () => {
      await expect(
        enrollment.create({ studentId: ids.studentA!, classId: ids.classA!, termId: ids.termA! }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("rejects linking a guardian to another tenant's student", async () => {
    await TenantContext.run({ schoolId: ids.schoolB!, userId: "b" }, async () => {
      await expect(
        parents.createGuardian(ids.studentA!, { parentId: ids.parentA!, relationship: "MOTHER" } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
