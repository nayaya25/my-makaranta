/**
 * MF-1 Task 3 — DiscountsService: schemes CRUD + assignments
 *
 * Tests:
 *   1. createScheme validates method+value (PERCENT 1-100, FIXED >0) -> BadRequest otherwise
 *   2. createScheme surfaces @@unique([schoolId, name]) dup
 *   3. updateScheme validates method/value when present
 *   4. deleteScheme throws BadRequest when scheme has assignments; else deletes
 *   5. assign validates student + scheme belong to school (foreign -> NotFound); @@unique dup blocked
 *   6. revoke deletes scoped
 *   7. listForStudent / schemeRoster return school-scoped rows
 *   8. IDOR: foreign student/scheme/assignment id -> NotFound
 *   9. tenant scoping: cross-school reads return nothing / throw
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { DiscountsService } from "./discounts.service";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("DiscountsService", () => {
  let service: DiscountsService;
  let schoolId: string;
  let otherSchoolId: string;
  let studentId: string;
  let otherStudentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    const school = await prisma.school.create({
      data: { name: `DiscountsSvc-${ts}`, slug: `discounts-svc-${ts}` } as never,
    });
    schoolId = school.id;

    const otherSchool = await prisma.school.create({
      data: { name: `DiscountsSvcOther-${ts}`, slug: `discounts-svc-other-${ts}` } as never,
    });
    otherSchoolId = otherSchool.id;

    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `DSC-${ts}`,
        firstName: "Zainab",
        lastName: "Musa",
        gender: "FEMALE",
        dateOfBirth: new Date("2014-01-01"),
      },
    });
    studentId = student.id;

    const otherStudent = await prisma.student.create({
      data: {
        schoolId: otherSchoolId,
        admissionNo: `DSC-OTHER-${ts}`,
        firstName: "Bello",
        lastName: "Yusuf",
        gender: "MALE",
        dateOfBirth: new Date("2014-01-01"),
      },
    });
    otherStudentId = otherStudent.id;

    service = new DiscountsService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.studentDiscount.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.discountScheme.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.student.deleteMany({ where: { schoolId: { in: [schoolId, otherSchoolId] } } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolId, otherSchoolId] } } });
  });

  const asSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId: null }, fn);
  const asOtherSchool = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: otherSchoolId, userId: null }, fn);

  // ────────────────────────────────────────────────────────────────────────
  // createScheme validation
  // ────────────────────────────────────────────────────────────────────────

  it("rejects PERCENT value outside 1-100", async () => {
    await expect(
      asSchool(() => service.createScheme({ name: "Bad Percent", method: "PERCENT", value: 0 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      asSchool(() => service.createScheme({ name: "Bad Percent 2", method: "PERCENT", value: 101 })),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects FIXED value <= 0", async () => {
    await expect(
      asSchool(() => service.createScheme({ name: "Bad Fixed", method: "FIXED", value: 0 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      asSchool(() => service.createScheme({ name: "Bad Fixed 2", method: "FIXED", value: -5 })),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates a valid PERCENT scheme", async () => {
    const scheme = await asSchool(() =>
      service.createScheme({ name: "Sibling Discount", method: "PERCENT", value: 50 }),
    );
    expect(scheme.id).toBeDefined();
    expect(scheme.method).toBe("PERCENT");
    expect(scheme.value).toBe(50);
    expect(scheme.active).toBe(true);
  });

  it("creates a valid FIXED scheme", async () => {
    const scheme = await asSchool(() =>
      service.createScheme({ name: "Merit Award", method: "FIXED", value: 5000 }),
    );
    expect(scheme.id).toBeDefined();
    expect(scheme.method).toBe("FIXED");
    expect(scheme.value).toBe(5000);
  });

  it("surfaces duplicate name within school (@@unique[schoolId, name])", async () => {
    await expect(
      asSchool(() => service.createScheme({ name: "Sibling Discount", method: "FIXED", value: 1000 })),
    ).rejects.toThrow();
  });

  it("allows same scheme name across different schools", async () => {
    const scheme = await asOtherSchool(() =>
      service.createScheme({ name: "Sibling Discount", method: "PERCENT", value: 10 }),
    );
    expect(scheme.id).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────────────────
  // listSchemes
  // ────────────────────────────────────────────────────────────────────────

  it("listSchemes returns only this school's schemes", async () => {
    const schemes = await asSchool(() => service.listSchemes());
    expect(schemes.length).toBe(2);
    expect(schemes.every((s) => s.schoolId === schoolId)).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateScheme
  // ────────────────────────────────────────────────────────────────────────

  it("updateScheme validates value range when method/value present", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    await expect(
      asSchool(() => service.updateScheme(scheme.id, { value: 200 })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      asSchool(() => service.updateScheme(scheme.id, { method: "FIXED", value: 0 })),
    ).rejects.toThrow(BadRequestException);
  });

  it("updateScheme applies valid changes", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    const updated = await asSchool(() => service.updateScheme(scheme.id, { value: 60, active: false }));
    expect(updated.value).toBe(60);
    expect(updated.active).toBe(false);
    // restore for later tests
    await asSchool(() => service.updateScheme(scheme.id, { value: 50, active: true }));
  });

  it("updateScheme on a foreign scheme id -> NotFound", async () => {
    const foreignScheme = await asOtherSchool(() => service.listSchemes()).then((s) => s[0]!);
    await expect(
      asSchool(() => service.updateScheme(foreignScheme.id, { value: 20 })),
    ).rejects.toThrow(NotFoundException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // assign / listForStudent / schemeRoster
  // ────────────────────────────────────────────────────────────────────────

  it("assign validates foreign student id -> NotFound", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    await expect(
      asSchool(() => service.assign(otherStudentId, scheme.id)),
    ).rejects.toThrow(NotFoundException);
  });

  it("assign validates foreign scheme id -> NotFound", async () => {
    const foreignScheme = await asOtherSchool(() => service.listSchemes()).then((s) => s[0]!);
    await expect(
      asSchool(() => service.assign(studentId, foreignScheme.id)),
    ).rejects.toThrow(NotFoundException);
  });

  it("assign creates a StudentDiscount when both belong to school", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    const assignment = await asSchool(() => service.assign(studentId, scheme.id));
    expect(assignment.id).toBeDefined();
    expect(assignment.studentId).toBe(studentId);
    expect(assignment.discountSchemeId).toBe(scheme.id);
  });

  it("assign rejects duplicate assignment (@@unique[studentId, discountSchemeId])", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    await expect(asSchool(() => service.assign(studentId, scheme.id))).rejects.toThrow();
  });

  it("listForStudent returns school-scoped assignments", async () => {
    const assignments = await asSchool(() => service.listForStudent(studentId));
    expect(assignments.length).toBe(1);
    expect(assignments[0]!.studentId).toBe(studentId);
  });

  it("listForStudent on a foreign student id -> NotFound", async () => {
    await expect(asSchool(() => service.listForStudent(otherStudentId))).rejects.toThrow(NotFoundException);
  });

  it("schemeRoster returns students on a scheme", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    const roster = await asSchool(() => service.schemeRoster(scheme.id));
    expect(roster.length).toBe(1);
    expect(roster[0]!.studentId).toBe(studentId);
  });

  it("schemeRoster on a foreign scheme id -> NotFound", async () => {
    const foreignScheme = await asOtherSchool(() => service.listSchemes()).then((s) => s[0]!);
    await expect(asSchool(() => service.schemeRoster(foreignScheme.id))).rejects.toThrow(NotFoundException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // deleteScheme blocked when assigned
  // ────────────────────────────────────────────────────────────────────────

  it("deleteScheme throws BadRequest when scheme has assignments", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    await expect(asSchool(() => service.deleteScheme(scheme.id))).rejects.toThrow(BadRequestException);
  });

  it("deleteScheme on a foreign scheme id -> NotFound", async () => {
    const foreignScheme = await asOtherSchool(() => service.listSchemes()).then((s) => s[0]!);
    await expect(asSchool(() => service.deleteScheme(foreignScheme.id))).rejects.toThrow(NotFoundException);
  });

  // ────────────────────────────────────────────────────────────────────────
  // revoke
  // ────────────────────────────────────────────────────────────────────────

  it("revoke on a foreign assignment id -> NotFound", async () => {
    const scheme = await asOtherSchool(() => service.listSchemes()).then((s) => s[0]!);
    const foreignAssignment = await asOtherSchool(() => service.assign(otherStudentId, scheme.id));
    await expect(asSchool(() => service.revoke(foreignAssignment.id))).rejects.toThrow(NotFoundException);
  });

  it("revoke deletes a scoped assignment", async () => {
    const scheme = await asSchool(() => service.listSchemes()).then((s) =>
      s.find((x) => x.name === "Sibling Discount")!,
    );
    const before = await asSchool(() => service.listForStudent(studentId));
    expect(before.length).toBe(1);

    await asSchool(() => service.revoke(before[0]!.id));

    const after = await asSchool(() => service.listForStudent(studentId));
    expect(after.length).toBe(0);

    // scheme now has no assignments -> deleteScheme should succeed
    const deleted = await asSchool(() => service.deleteScheme(scheme.id));
    expect(deleted.id).toBe(scheme.id);
  });
});
