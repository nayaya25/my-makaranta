import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Atomic capabilities (permissions ARE the primitive; roles are bundles of these).
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

async function main() {
  for (const [key, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  const count = await prisma.permission.count();
  console.log(`Seeded permissions. Total in catalog: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
