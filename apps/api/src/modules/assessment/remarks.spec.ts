import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { RemarksService } from "./remarks.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("RemarksService – term remarks with per-field perms + lock", () => {
  let service: RemarksService;
  let schoolId: string;
  let school2Id: string;
  let classId: string;
  let class2Id: string; // belongs to school2
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    // School 1
    const school = await prisma.school.create({
      data: { name: `RemarksTest-${ts}`, slug: `remarks-${ts}` } as never,
    });
    schoolId = school.id;

    // School 2 (for cross-school IDOR test)
    const school2 = await prisma.school.create({
      data: { name: `RemarksOther-${ts}`, slug: `remarks-other-${ts}` } as never,
    });
    school2Id = school2.id;

    // Academic year + term
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2024/2025", startDate: new Date(), endDate: new Date() },
    });
    const term = await prisma.term.create({
      data: { schoolId, academicYearId: year.id, number: 1, startDate: new Date(), endDate: new Date() },
    });
    termId = term.id;

    // Class for school 1
    const level = await prisma.classLevel.create({ data: { schoolId, name: "JSS1", order: 0 } });
    const klass = await prisma.class.create({ data: { schoolId, name: "JSS 1A", classLevelId: level.id } });
    classId = klass.id;

    // Class for school 2 (for cross-school IDOR test)
    const level2 = await prisma.classLevel.create({ data: { schoolId: school2Id, name: "JSS1", order: 0 } });
    const klass2 = await prisma.class.create({ data: { schoolId: school2Id, name: "JSS 1A", classLevelId: level2.id } });
    class2Id = klass2.id;

    // Student enrolled in school1 class
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `R1-${ts}`,
        firstName: "Jane",
        lastName: "Doe",
        gender: "FEMALE",
        dateOfBirth: new Date("2010-01-01"),
      },
    });
    studentId = student.id;

    await prisma.enrollment.create({
      data: { studentId, classId, termId },
    });

    service = new RemarksService(prisma as unknown as PrismaService);
  });

  // Test 1: formTeacherRemark with only canForm=true persists; principalRemark stays null
  it("upsertRemark: formTeacherRemark with only canForm=true — persists formTeacherRemark, principalRemark stays null", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.upsertRemark(
        { studentId, termId, classId, formTeacherRemark: "Good student" },
        { canForm: true, canPrincipal: false },
      ),
    );

    expect(result!.formTeacherRemark).toBe("Good student");
    expect(result!.principalRemark).toBeNull();
    expect(result!.studentId).toBe(studentId);
    expect(result!.termId).toBe(termId);
  });

  // Test 2: principalRemark without canPrincipal → ForbiddenException
  it("upsertRemark: principalRemark without canPrincipal → ForbiddenException", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.upsertRemark(
          { studentId, termId, classId, principalRemark: "Excellent" },
          { canForm: true, canPrincipal: false },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 3: both fields with both caps — persist on SAME row (no duplicate)
  it("upsertRemark: both fields with both caps — both persist on the same row", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.upsertRemark(
        { studentId, termId, classId, formTeacherRemark: "Updated remark", principalRemark: "Principal note" },
        { canForm: true, canPrincipal: true },
      ),
    );

    expect(result!.formTeacherRemark).toBe("Updated remark");
    expect(result!.principalRemark).toBe("Principal note");

    // Verify no duplicate rows
    const all = await prisma.termRemark.findMany({ where: { studentId, termId } });
    expect(all).toHaveLength(1);
  });

  // Test 4: student NOT enrolled in classId/termId → ForbiddenException (IDOR guard)
  it("upsertRemark: student NOT enrolled in classId/termId → ForbiddenException (IDOR guard)", async () => {
    const ts = Date.now();
    const unenrolled = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `UE-${ts}`,
        firstName: "Charlie",
        lastName: "NotEnrolled",
        gender: "MALE",
        dateOfBirth: new Date("2011-01-01"),
      },
    });

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.upsertRemark(
          { studentId: unenrolled.id, termId, classId, formTeacherRemark: "Test" },
          { canForm: true, canPrincipal: false },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 5: classId from different school → NotFoundException (IDOR guard)
  it("upsertRemark: classId from different school → NotFoundException (IDOR guard)", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.upsertRemark(
          { studentId, termId, classId: class2Id, formTeacherRemark: "Test" },
          { canForm: true, canPrincipal: false },
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // Test 6: locked after Release → ForbiddenException
  it("upsertRemark: locked after Release → ForbiddenException", async () => {
    // Create a separate class/term for the lock test to avoid affecting other tests
    const ts = Date.now();
    const levelL = await prisma.classLevel.create({ data: { schoolId, name: `LockLevel-${ts}`, order: 99 } });
    const classL = await prisma.class.create({ data: { schoolId, name: `LockClass-${ts}`, classLevelId: levelL.id } });
    const yearL = await prisma.academicYear.create({ data: { schoolId, name: `Lock-${ts}`, startDate: new Date(), endDate: new Date() } });
    const termL = await prisma.term.create({ data: { schoolId, academicYearId: yearL.id, number: 1, startDate: new Date(), endDate: new Date() } });

    await prisma.enrollment.create({ data: { studentId, classId: classL.id, termId: termL.id } });

    const person = await prisma.person.create({ data: {} });
    await prisma.release.create({ data: { schoolId, classId: classL.id, termId: termL.id, releasedBy: person.id } });

    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.upsertRemark(
          { studentId, termId: termL.id, classId: classL.id, formTeacherRemark: "Late" },
          { canForm: true, canPrincipal: false },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 7: getRemark returns TermRemark by (studentId, termId, schoolId)
  it("getRemark: returns TermRemark by (studentId, termId, schoolId) — row exists after upsert", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getRemark(studentId, termId),
    );

    expect(result).not.toBeNull();
    expect(result!.studentId).toBe(studentId);
    expect(result!.termId).toBe(termId);
    expect(result!.schoolId).toBe(schoolId);
  });

  // Test 9: principalRemark with only canPrincipal=true (no canForm) → persists principalRemark, formTeacherRemark null
  it("upsertRemark: principalRemark with only canPrincipal=true (no canForm) → persists principalRemark, formTeacherRemark null", async () => {
    const ts = Date.now();
    const levelP = await prisma.classLevel.create({ data: { schoolId, name: `PrincipalLevel-${ts}`, order: 98 } });
    const classP = await prisma.class.create({ data: { schoolId, name: `PrincipalClass-${ts}`, classLevelId: levelP.id } });
    const yearP = await prisma.academicYear.create({ data: { schoolId, name: `Principal-${ts}`, startDate: new Date(), endDate: new Date() } });
    const termP = await prisma.term.create({ data: { schoolId, academicYearId: yearP.id, number: 1, startDate: new Date(), endDate: new Date() } });

    const studentP = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `P-${ts}`,
        firstName: "Principal",
        lastName: "Only",
        gender: "MALE",
        dateOfBirth: new Date("2010-06-01"),
      },
    });
    await prisma.enrollment.create({ data: { studentId: studentP.id, classId: classP.id, termId: termP.id } });

    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.upsertRemark(
        { studentId: studentP.id, termId: termP.id, classId: classP.id, principalRemark: "Excellent conduct" },
        { canForm: false, canPrincipal: true },
      ),
    );

    expect(result!.principalRemark).toBe("Excellent conduct");
    expect(result!.formTeacherRemark).toBeNull();
    expect(result!.studentId).toBe(studentP.id);
    expect(result!.termId).toBe(termP.id);
  });

  // Test 8: getRemark returns null when no remark exists
  it("getRemark: returns null when no remark exists", async () => {
    const ts = Date.now();
    // Create a student with no remarks
    const fresh = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `FRESH-${ts}`,
        firstName: "Fresh",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    });

    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getRemark(fresh.id, termId),
    );

    expect(result).toBeNull();
  });

  // Test 10: canForm=false + canPrincipal=false → ForbiddenException regardless of field
  it("upsertRemark: {canForm:false, canPrincipal:false} → ForbiddenException", async () => {
    await expect(
      TenantContext.run({ schoolId, userId: null }, () =>
        service.upsertRemark(
          { studentId, termId, classId, formTeacherRemark: "Sneaky remark" },
          { canForm: false, canPrincipal: false },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Test 11: empty body (no fields) with valid caps → no new row / returns existing
  it("upsertRemark: empty body (no fields provided) → no upsert, row count unchanged", async () => {
    const before = await prisma.termRemark.count({ where: { studentId, termId } });

    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.upsertRemark(
        { studentId, termId, classId },
        { canForm: true, canPrincipal: true },
      ),
    );

    const after = await prisma.termRemark.count({ where: { studentId, termId } });
    expect(after).toBe(before);
    // Returns existing row (or null if none exists)
    if (result !== null) {
      expect(result.studentId).toBe(studentId);
      expect(result.termId).toBe(termId);
    }
  });
});
