// apps/api/prisma/migrate-identity.spec.ts
import { PrismaClient } from "@prisma/client";
import { backfillIdentity } from "./migrate-identity";
import { seedSystemRoles } from "./seed-roles";

const prisma = new PrismaClient();

const PERMISSIONS: Array<[string, string]> = [
  ["students.view", "View student records"],
  ["students.create", "Create student records"],
  ["students.update", "Edit student records"],
  ["students.import", "Bulk-import students"],
  ["staff.view", "View staff records"],
  ["staff.manage", "Create and edit staff"],
  ["classes.view", "View classes and class levels"],
  ["classes.manage", "Create and edit classes"],
  ["attendance.mark", "Mark attendance"],
  ["attendance.view", "View attendance"],
  ["attendance.audit", "Audit attendance changes"],
  ["results.record", "Record assessment scores"],
  ["results.review", "Review results before release"],
  ["results.release", "Release results to parents/students"],
  ["results.correct", "Correct (override) a released result score"],
  ["results.view.own", "View one's own (or one's children's) results"],
  ["assessment.configure", "Configure assessment types, grade boundaries, and subject assignments"],
  ["fees.view", "View fee positions and invoices"],
  ["fees.manage", "Configure fees, discounts, reconcile"],
  ["fees.pay.own", "Pay one's own (or one's children's) fees"],
  ["announcements.create", "Create and send announcements"],
  ["announcements.view", "View announcements"],
  ["reports.view", "View operational reports"],
  ["reports.view.proprietor", "View the proprietor dashboard"],
  ["school.manage", "Manage school settings and structure"],
];

const slug = `test-school-migrate-${Date.now()}`;

let schoolId: string;
let userId: string;
let staffId: string;
let parentId: string;
let studentId: string;
let staffEmail: string;
let proprietorEmail: string;
let parentPhone: string;

beforeAll(async () => {
  // 1. Seed permissions
  for (const [key, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  // 2. Seed system roles
  await seedSystemRoles(prisma);

  // 3. Create a school
  const school = await prisma.school.create({
    data: {
      name: "Test Migrate School",
      slug,
    },
  });
  schoolId = school.id;

  // 4. Create PROPRIETOR User
  proprietorEmail = `proprietor-${Date.now()}@test.com`;
  const user = await prisma.user.create({
    data: {
      schoolId,
      identityType: "PROPRIETOR",
      identityId: `prop-${Date.now()}`,
      email: proprietorEmail,
      tokenVersion: 3,
    },
  });
  userId = user.id;

  // 5. Get the school.manage permission id
  const schoolManagePerm = await prisma.permission.findUniqueOrThrow({
    where: { key: "school.manage" },
  });

  // 6. Create Staff with school.manage permission
  staffEmail = `staff-${Date.now()}@test.com`;
  const staff = await prisma.staff.create({
    data: {
      schoolId,
      staffNo: `ST-${Date.now()}`,
      firstName: "Jane",
      lastName: "Doe",
      email: staffEmail,
      phone: `+23480${Date.now().toString().slice(-8)}`,
      staffPermissions: {
        create: {
          permissionId: schoolManagePerm.id,
        },
      },
    },
  });
  staffId = staff.id;

  // 7. Create Parent
  parentPhone = `+23481${Date.now().toString().slice(-8)}`;
  const parent = await prisma.parent.create({
    data: {
      schoolId,
      phone: parentPhone,
      firstName: "Amina",
      lastName: "Ibrahim",
    },
  });
  parentId = parent.id;

  // 8. Create Student
  const student = await prisma.student.create({
    data: {
      schoolId,
      admissionNo: `ADM-${Date.now()}`,
      firstName: "Usman",
      lastName: "Bello",
      gender: "MALE",
      dateOfBirth: new Date("2015-03-15"),
    },
  });
  studentId = student.id;

  // 9. Create legacy Guardian row linking Parent → Student
  await prisma.guardian.create({
    data: {
      studentId,
      parentId,
      relationship: "MOTHER",
      isPrimary: true,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

it("backfills proprietor/staff/parent/student idempotently", async () => {
  // ── First run ──
  const a = await backfillIdentity(prisma);

  // ── Second run (idempotent) ──
  const b = await backfillIdentity(prisma);

  // 1 & 2. Idempotency
  expect(b.persons).toBe(a.persons);
  expect(b.memberships).toBe(a.memberships);

  // 3. Proprietor Person exists with correct email
  const proprietorPerson = await prisma.person.findUnique({
    where: { email: proprietorEmail },
  });
  expect(proprietorPerson).not.toBeNull();
  expect(proprietorPerson!.tokenVersion).toBe(3);

  // 4. Membership for proprietor person + school; RoleAssignment for "proprietor"
  const proprietorMembership = await prisma.membership.findUnique({
    where: {
      personId_schoolId: { personId: proprietorPerson!.id, schoolId },
    },
    include: { roles: { include: { role: true } } },
  });
  expect(proprietorMembership).not.toBeNull();
  const proprietorRoleKeys = proprietorMembership!.roles.map((ra) => ra.role.key);
  expect(proprietorRoleKeys).toContain("proprietor");

  // 5. Staff Person exists with correct email
  const staffPerson = await prisma.person.findUnique({
    where: { email: staffEmail },
  });
  expect(staffPerson).not.toBeNull();

  // 6. Membership, StaffProfile, teacher + ict_admin roles for staff
  const staffMembership = await prisma.membership.findUnique({
    where: {
      personId_schoolId: { personId: staffPerson!.id, schoolId },
    },
    include: {
      roles: { include: { role: true } },
      staffProfile: true,
    },
  });
  expect(staffMembership).not.toBeNull();
  expect(staffMembership!.staffProfile).not.toBeNull();
  const staffRoleKeys = staffMembership!.roles.map((ra) => ra.role.key);
  expect(staffRoleKeys).toContain("teacher");
  expect(staffRoleKeys).toContain("ict_admin"); // has school.manage permission

  // 7. Parent Person exists with correct phone
  const parentPerson = await prisma.person.findUnique({
    where: { phone: parentPhone },
  });
  expect(parentPerson).not.toBeNull();

  // 8. Parent Membership + Guardianship linking to migrated StudentProfile
  const parentMembership = await prisma.membership.findUnique({
    where: {
      personId_schoolId: { personId: parentPerson!.id, schoolId },
    },
    include: { guardianOf: true },
  });
  expect(parentMembership).not.toBeNull();
  expect(parentMembership!.guardianOf.length).toBeGreaterThan(0);

  // 9. StudentProfile exists with correct studentId
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { schoolId_studentId: { schoolId, studentId } },
  });
  expect(studentProfile).not.toBeNull();
  expect(studentProfile!.studentId).toBe(studentId);

  // Verify Guardianship links to correct StudentProfile
  const guardianV2 = parentMembership!.guardianOf[0]!;
  expect(guardianV2.studentProfileId).toBe(studentProfile!.id);

  // 10. At least 3 persons (proprietor + staff + parent)
  expect(a.persons).toBeGreaterThanOrEqual(3);
});
