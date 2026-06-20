import { PrismaClient } from "@prisma/client";

export async function backfillIdentity(
  prisma: PrismaClient
): Promise<{ persons: number; memberships: number }> {
  const personIds = new Set<string>();
  const membershipIds = new Set<string>();

  // ── Helper: upsert RoleAssignment ───────────────────────────────────────────
  async function assignRole(membershipId: string, roleKey: string) {
    const role = await prisma.role.findFirst({
      where: { schoolId: null, key: roleKey },
    });
    if (!role) return;
    await prisma.roleAssignment.upsert({
      where: { membershipId_roleId: { membershipId, roleId: role.id } },
      create: { membershipId, roleId: role.id },
      update: {},
    });
  }

  // ── 1. Students ─────────────────────────────────────────────────────────────
  // Must run first so StudentProfiles exist when Parents link Guardian_v2
  const students = await prisma.student.findMany();
  for (const student of students) {
    await prisma.studentProfile.upsert({
      where: { schoolId_studentId: { schoolId: student.schoolId, studentId: student.id } },
      create: {
        schoolId: student.schoolId,
        admissionNo: student.admissionNo,
        studentId: student.id,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        membershipId: null,
      },
      update: {},
    });
  }

  // ── 2. Parents ──────────────────────────────────────────────────────────────
  const parents = await prisma.parent.findMany({
    include: { guardians: true },
  });
  for (const parent of parents) {
    // Upsert Person keyed by phone (Parent.phone is the required unique identifier)
    const person = await prisma.person.upsert({
      where: { phone: parent.phone },
      create: {
        phone: parent.phone,
        email: parent.email ?? null,
        firstName: parent.firstName,
        lastName: parent.lastName,
      },
      update: {
        firstName: parent.firstName,
        lastName: parent.lastName,
      },
    });
    personIds.add(person.id);

    // Upsert Membership
    const membership = await prisma.membership.upsert({
      where: { personId_schoolId: { personId: person.id, schoolId: parent.schoolId } },
      create: { personId: person.id, schoolId: parent.schoolId },
      update: {},
    });
    membershipIds.add(membership.id);

    // For each legacy Guardian row, create Guardian_v2 linking membership → StudentProfile
    for (const guardian of parent.guardians) {
      const studentProfile = await prisma.studentProfile.findUnique({
        where: {
          schoolId_studentId: {
            schoolId: parent.schoolId,
            studentId: guardian.studentId,
          },
        },
      });
      if (!studentProfile) continue;

      await prisma.guardian_v2.upsert({
        where: {
          parentMembershipId_studentProfileId: {
            parentMembershipId: membership.id,
            studentProfileId: studentProfile.id,
          },
        },
        create: {
          parentMembershipId: membership.id,
          studentProfileId: studentProfile.id,
          relationship: guardian.relationship,
          isPrimary: guardian.isPrimary,
        },
        update: {},
      });
    }
  }

  // ── 3. Staff ─────────────────────────────────────────────────────────────────
  const staffList = await prisma.staff.findMany({
    include: { staffPermissions: { include: { permission: true } } },
  });
  for (const staff of staffList) {
    // Upsert Person keyed by email
    const person = await prisma.person.upsert({
      where: { email: staff.email },
      create: {
        email: staff.email,
        phone: staff.phone ?? null,
        firstName: staff.firstName,
        lastName: staff.lastName,
      },
      update: {
        firstName: staff.firstName,
        lastName: staff.lastName,
      },
    });
    personIds.add(person.id);

    // Upsert Membership
    const membership = await prisma.membership.upsert({
      where: { personId_schoolId: { personId: person.id, schoolId: staff.schoolId } },
      create: { personId: person.id, schoolId: staff.schoolId },
      update: {},
    });
    membershipIds.add(membership.id);

    // Create/find StaffProfile
    const existingProfile = await prisma.staffProfile.findUnique({
      where: { membershipId: membership.id },
    });
    if (!existingProfile) {
      // May already exist with same schoolId+staffNo but different membershipId —
      // check by staffNo+schoolId first to avoid unique constraint violation
      const byStaffNo = await prisma.staffProfile.findUnique({
        where: { schoolId_staffNo: { schoolId: staff.schoolId, staffNo: staff.staffNo } },
      });
      if (!byStaffNo) {
        await prisma.staffProfile.create({
          data: {
            membershipId: membership.id,
            schoolId: staff.schoolId,
            staffNo: staff.staffNo,
            hireDate: staff.hiredAt,
          },
        });
      }
    }

    // Assign teacher role always
    await assignRole(membership.id, "teacher");

    // If staff has school.manage, also assign ict_admin
    const hasSchoolManage = staff.staffPermissions.some(
      (sp) => sp.permission.key === "school.manage"
    );
    if (hasSchoolManage) {
      await assignRole(membership.id, "ict_admin");
    }
  }

  // ── 4. PROPRIETOR Users ──────────────────────────────────────────────────────
  const proprietorUsers = await prisma.user.findMany({
    where: { identityType: "PROPRIETOR" },
  });
  for (const user of proprietorUsers) {
    if (!user.schoolId) continue;

    // Upsert Person keyed by email (fallback phone)
    let person;
    if (user.email) {
      person = await prisma.person.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          phone: user.phone ?? null,
          tokenVersion: user.tokenVersion,
          lastLoginAt: user.lastLoginAt,
        },
        update: {
          tokenVersion: user.tokenVersion,
          lastLoginAt: user.lastLoginAt,
        },
      });
    } else if (user.phone) {
      person = await prisma.person.upsert({
        where: { phone: user.phone },
        create: {
          phone: user.phone,
          tokenVersion: user.tokenVersion,
          lastLoginAt: user.lastLoginAt,
        },
        update: {
          tokenVersion: user.tokenVersion,
          lastLoginAt: user.lastLoginAt,
        },
      });
    } else {
      continue; // cannot key without email or phone
    }
    personIds.add(person.id);

    // Upsert Membership
    const membership = await prisma.membership.upsert({
      where: { personId_schoolId: { personId: person.id, schoolId: user.schoolId } },
      create: { personId: person.id, schoolId: user.schoolId },
      update: {},
    });
    membershipIds.add(membership.id);

    // Assign proprietor role
    await assignRole(membership.id, "proprietor");
  }

  return { persons: personIds.size, memberships: membershipIds.size };
}

// Allow running directly: ts-node prisma/migrate-identity.ts
if (require.main === module) {
  const client = new PrismaClient();
  backfillIdentity(client)
    .then((result) => {
      console.log("Backfill complete:", result);
    })
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    })
    .finally(() => client.$disconnect());
}
