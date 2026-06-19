/**
 * One-off demo seed: "Ahlulbayt Academy" with a proprietor login + realistic data.
 * Run:  DATABASE_URL="<neon-direct-url>" npx ts-node prisma/seed-demo.ts
 * Atomic (single transaction) — safe to abort; re-running is blocked if the slug exists.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROPRIETOR_PHONE = "+2348106336111";
const PROPRIETOR_EMAIL = "nayayaibrahim21@gmail.com";
const SLUG = "ahlulbayt-academy";

const d = (s: string) => new Date(s);

async function main() {
  await prisma.$transaction(
    async (tx) => {
      if (await tx.school.findUnique({ where: { slug: SLUG } })) {
        throw new Error(`School "${SLUG}" already exists — aborting to avoid duplicates.`);
      }

      const school = await tx.school.create({
        data: { name: "Ahlulbayt Academy", slug: SLUG, country: "NG", currency: "NGN" },
      });
      const schoolId = school.id;

      // --- Proprietor login (phone + email) with every permission ---
      const existingUser = await tx.user.findFirst({
        where: { OR: [{ phone: PROPRIETOR_PHONE }, { email: PROPRIETOR_EMAIL }] },
      });
      const proprietor = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { schoolId, phone: PROPRIETOR_PHONE, email: PROPRIETOR_EMAIL, identityType: "PROPRIETOR", identityId: "", tokenVersion: { increment: 1 } },
          })
        : await tx.user.create({
            data: { schoolId, phone: PROPRIETOR_PHONE, email: PROPRIETOR_EMAIL, identityType: "PROPRIETOR", identityId: "" },
          });
      const actor = proprietor.id;
      const perms = await tx.permission.findMany({ select: { id: true } });
      await tx.userPermission.createMany({
        data: perms.map((p) => ({ userId: actor, permissionId: p.id, scope: {} })),
        skipDuplicates: true,
      });

      // --- Calendar: 2025/2026, Term 3 current ---
      const ay = await tx.academicYear.create({
        data: { schoolId, name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-07-31") },
      });
      await tx.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: d("2025-09-15"), endDate: d("2025-12-19") } });
      await tx.term.create({ data: { schoolId, academicYearId: ay.id, number: 2, startDate: d("2026-01-12"), endDate: d("2026-04-10") } });
      const term = await tx.term.create({ data: { schoolId, academicYearId: ay.id, number: 3, startDate: d("2026-04-27"), endDate: d("2026-07-24"), isCurrent: true } });
      const termId = term.id;

      // --- Class levels + classes ---
      const jss1 = await tx.classLevel.create({ data: { schoolId, name: "JSS 1", order: 1 } });
      const jss2 = await tx.classLevel.create({ data: { schoolId, name: "JSS 2", order: 2 } });
      const jss3 = await tx.classLevel.create({ data: { schoolId, name: "JSS 3", order: 3 } });

      // --- Staff ---
      const principal = await tx.staff.create({ data: { schoolId, staffNo: "STF001", firstName: "Aisha", lastName: "Bello", email: "aisha.bello@ahlulbayt.ng", phone: "+2348040000001" } });
      const tMaths = await tx.staff.create({ data: { schoolId, staffNo: "STF002", firstName: "Yusuf", lastName: "Audu", email: "yusuf.audu@ahlulbayt.ng", phone: "+2348040000002" } });
      const tEnglish = await tx.staff.create({ data: { schoolId, staffNo: "STF003", firstName: "Zainab", lastName: "Sani", email: "zainab.sani@ahlulbayt.ng", phone: "+2348040000003" } });

      const jss1a = await tx.class.create({ data: { schoolId, classLevelId: jss1.id, name: "JSS 1A", formTeacherId: tMaths.id } });
      const jss1b = await tx.class.create({ data: { schoolId, classLevelId: jss1.id, name: "JSS 1B", formTeacherId: tEnglish.id } });
      const jss2a = await tx.class.create({ data: { schoolId, classLevelId: jss2.id, name: "JSS 2A", formTeacherId: principal.id } });
      const jss3a = await tx.class.create({ data: { schoolId, classLevelId: jss3.id, name: "JSS 3A" } });

      // --- Subjects ---
      const subjDefs = [
        ["Mathematics", "MTH"],
        ["English Language", "ENG"],
        ["Basic Science", "BSC"],
        ["Islamic Studies", "IRS"],
        ["Social Studies", "SOS"],
      ] as const;
      const subjects: Record<string, string> = {};
      for (const [name, code] of subjDefs) {
        const s = await tx.subject.create({ data: { schoolId, name, code } });
        subjects[code] = s.id;
      }

      // --- Assessment config ---
      const ca1 = await tx.assessmentType.create({ data: { schoolId, name: "CA 1", maxScore: 20, order: 0 } });
      const ca2 = await tx.assessmentType.create({ data: { schoolId, name: "CA 2", maxScore: 20, order: 1 } });
      const exam = await tx.assessmentType.create({ data: { schoolId, name: "Exam", maxScore: 60, order: 2 } });
      await tx.gradeBoundary.createMany({
        data: [
          { schoolId, grade: "A", minScore: 70, remark: "Excellent", order: 0 },
          { schoolId, grade: "B", minScore: 60, remark: "Very Good", order: 1 },
          { schoolId, grade: "C", minScore: 50, remark: "Good", order: 2 },
          { schoolId, grade: "D", minScore: 45, remark: "Pass", order: 3 },
          { schoolId, grade: "F", minScore: 0, remark: "Fail", order: 4 },
        ],
      });
      const gradeFor = (t: number) => (t >= 70 ? "A" : t >= 60 ? "B" : t >= 50 ? "C" : t >= 45 ? "D" : "F");

      // --- Subject assignments for JSS 1A ---
      await tx.subjectAssignment.createMany({
        data: [
          { schoolId, subjectId: subjects.MTH!, classId: jss1a.id, staffId: tMaths.id, academicYearId: ay.id },
          { schoolId, subjectId: subjects.BSC!, classId: jss1a.id, staffId: tMaths.id, academicYearId: ay.id },
          { schoolId, subjectId: subjects.ENG!, classId: jss1a.id, staffId: tEnglish.id, academicYearId: ay.id },
          { schoolId, subjectId: subjects.SOS!, classId: jss1a.id, staffId: tEnglish.id, academicYearId: ay.id },
          { schoolId, subjectId: subjects.IRS!, classId: jss1a.id, staffId: principal.id, academicYearId: ay.id },
        ],
      });

      // --- Students + parents + guardians + enrollments ---
      type SeedStudent = { adm: string; first: string; last: string; gender: "MALE" | "FEMALE"; dob: string; classId: string; parentFirst: string; parentLast: string; phone: string; rel: "MOTHER" | "FATHER" };
      const roster: SeedStudent[] = [
        { adm: "ADM/0001", first: "Aisha", last: "Mohammed", gender: "FEMALE", dob: "2013-03-04", classId: jss1a.id, parentFirst: "Fatima", parentLast: "Mohammed", phone: "+2348030000001", rel: "MOTHER" },
        { adm: "ADM/0002", first: "Bilal", last: "Sani", gender: "MALE", dob: "2013-07-22", classId: jss1a.id, parentFirst: "Sani", parentLast: "Abubakar", phone: "+2348030000002", rel: "FATHER" },
        { adm: "ADM/0003", first: "Khadija", last: "Yusuf", gender: "FEMALE", dob: "2013-01-15", classId: jss1a.id, parentFirst: "Yusuf", parentLast: "Garba", phone: "+2348030000003", rel: "FATHER" },
        { adm: "ADM/0004", first: "Ibrahim", last: "Lawal", gender: "MALE", dob: "2013-09-09", classId: jss1a.id, parentFirst: "Hauwa", parentLast: "Lawal", phone: "+2348030000004", rel: "MOTHER" },
        { adm: "ADM/0005", first: "Maryam", last: "Aliyu", gender: "FEMALE", dob: "2012-05-18", classId: jss2a.id, parentFirst: "Aliyu", parentLast: "Bello", phone: "+2348030000005", rel: "FATHER" },
        { adm: "ADM/0006", first: "Umar", last: "Tanko", gender: "MALE", dob: "2012-11-02", classId: jss2a.id, parentFirst: "Musa", parentLast: "Tanko", phone: "+2348030000006", rel: "FATHER" },
        { adm: "ADM/0007", first: "Zainab", last: "Idris", gender: "FEMALE", dob: "2011-08-30", classId: jss3a.id, parentFirst: "Idris", parentLast: "Bala", phone: "+2348030000007", rel: "FATHER" },
        { adm: "ADM/0008", first: "Yusuf", last: "Adamu", gender: "MALE", dob: "2011-12-12", classId: jss3a.id, parentFirst: "Adamu", parentLast: "Sule", phone: "+2348030000008", rel: "FATHER" },
      ];
      const studentIds: Record<string, string> = {};
      for (const r of roster) {
        const student = await tx.student.create({
          data: { schoolId, admissionNo: r.adm, firstName: r.first, lastName: r.last, gender: r.gender, dateOfBirth: d(r.dob) },
        });
        studentIds[r.adm] = student.id;
        const parent = await tx.parent.create({
          data: { schoolId, phone: r.phone, firstName: r.parentFirst, lastName: r.parentLast },
        });
        await tx.guardian.create({ data: { studentId: student.id, parentId: parent.id, relationship: r.rel, isPrimary: true } });
        await tx.enrollment.create({ data: { studentId: student.id, classId: r.classId, termId } });
      }

      // --- Scores + released result sheet for JSS 1A ---
      const jss1aRoster = roster.filter((r) => r.classId === jss1a.id);
      const scoredSubjects = ["MTH", "ENG", "BSC", "IRS", "SOS"] as const;
      // subject totals (out of 100) per student, in scoredSubjects order
      const totalsByAdm: Record<string, number[]> = {
        "ADM/0001": [88, 92, 80, 95, 85],
        "ADM/0002": [72, 68, 75, 80, 70],
        "ADM/0003": [95, 85, 90, 88, 92],
        "ADM/0004": [60, 65, 58, 70, 62],
      };
      const scoreRows: { schoolId: string; studentId: string; subjectId: string; classId: string; assessmentTypeId: string; termId: string; value: number; recordedBy: string }[] = [];
      const averages: { adm: string; avg: number }[] = [];
      for (const r of jss1aRoster) {
        const totals = totalsByAdm[r.adm]!;
        averages.push({ adm: r.adm, avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) });
        scoredSubjects.forEach((code, i) => {
          const t = totals[i]!;
          const c1 = Math.min(20, Math.round(t * 0.2));
          const c2 = Math.min(20, Math.round(t * 0.2));
          const ex = Math.min(60, t - c1 - c2);
          for (const [atId, val] of [[ca1.id, c1], [ca2.id, c2], [exam.id, ex]] as const) {
            scoreRows.push({ schoolId, studentId: studentIds[r.adm]!, subjectId: subjects[code]!, classId: jss1a.id, assessmentTypeId: atId, termId, value: val, recordedBy: actor });
          }
        });
      }
      await tx.score.createMany({ data: scoreRows });

      // ranks (position) by average desc
      const ranked = [...averages].sort((a, b) => b.avg - a.avg);
      const positionByAdm: Record<string, number> = {};
      ranked.forEach((x, i) => (positionByAdm[x.adm] = i + 1));

      const release = await tx.release.create({ data: { schoolId, classId: jss1a.id, termId, releasedBy: actor } });
      for (const r of jss1aRoster) {
        const totals = totalsByAdm[r.adm]!;
        const avg = averages.find((a) => a.adm === r.adm)!.avg;
        const sheet = await tx.resultSheet.create({
          data: { schoolId, releaseId: release.id, studentId: studentIds[r.adm]!, classId: jss1a.id, termId, average: avg, position: positionByAdm[r.adm]! },
        });
        await tx.resultSheetEntry.createMany({
          data: scoredSubjects.map((code, i) => ({ schoolId, resultSheetId: sheet.id, subjectId: subjects[code]!, total: totals[i]!, grade: gradeFor(totals[i]!) })),
        });
      }

      // --- Fees (Term 3, JSS 1 level) ---
      const feeDefs = [
        ["Tuition", 6_000_000],
        ["PTA Levy", 500_000],
        ["Exam Fee", 300_000],
      ] as const;
      let order = 0;
      for (const [name, amt] of feeDefs) {
        await tx.feeItem.create({ data: { schoolId, classLevelId: jss1.id, termId, name, amountKobo: amt, order: order++ } });
      }
      const feeTotal = feeDefs.reduce((a, [, amt]) => a + amt, 0); // 6,800,000 kobo = ₦68,000

      // invoices for JSS 1A: paid / overdue / partial / unpaid
      const invoicePlan: Record<string, { paid: number; due: string }> = {
        "ADM/0001": { paid: feeTotal, due: "2026-05-10" }, // fully paid
        "ADM/0002": { paid: 0, due: "2026-05-10" }, // overdue (past due, unpaid)
        "ADM/0003": { paid: 3_000_000, due: "2026-05-10" }, // partial
        "ADM/0004": { paid: 0, due: "2026-09-30" }, // unpaid, not yet due
      };
      for (const r of jss1aRoster) {
        const plan = invoicePlan[r.adm]!;
        const inv = await tx.invoice.create({
          data: { schoolId, studentId: studentIds[r.adm]!, termId, classLevelId: jss1.id, totalKobo: feeTotal, paidKobo: plan.paid, dueDate: d(plan.due) },
        });
        await tx.invoiceLine.createMany({ data: feeDefs.map(([name, amt]) => ({ schoolId, invoiceId: inv.id, name, amountKobo: amt })) });

        if (plan.paid > 0) {
          const channel = r.adm === "ADM/0001" ? "BANK_TRANSFER" : "CASH";
          const payment = await tx.payment.create({
            data: { schoolId, invoiceId: inv.id, amountKobo: plan.paid, channel: channel as never, reference: `SEED-${r.adm.replace(/\W/g, "")}`, status: "SUCCESS", paidAt: d("2026-05-02"), recordedBy: actor },
          });
          await tx.receipt.create({
            data: {
              code: `RC-${r.adm.replace(/\W/g, "")}`,
              paymentId: payment.id,
              schoolId,
              receiptNo: `0001-${r.adm.slice(-1)}`,
              studentName: `${r.first} ${r.last}`,
              schoolName: school.name,
              termLabel: "2025/2026 · Term 3",
              amountKobo: plan.paid,
              channel,
              paidAt: d("2026-05-02"),
              balanceAfterKobo: feeTotal - plan.paid,
            },
          });
        }
      }

      // --- Attendance for JSS 1A (5 recent weekdays) ---
      const days = ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"];
      const attendance: { schoolId: string; studentId: string; classId: string; date: Date; status: "PRESENT" | "ABSENT" | "LATE"; recordedBy: string }[] = [];
      jss1aRoster.forEach((r, si) => {
        days.forEach((day, di) => {
          let status: "PRESENT" | "ABSENT" | "LATE" = "PRESENT";
          if (r.adm === "ADM/0002" && di === 2) status = "ABSENT";
          if (r.adm === "ADM/0004" && di === 1) status = "LATE";
          attendance.push({ schoolId, studentId: studentIds[r.adm]!, classId: jss1a.id, date: d(day + "T00:00:00.000Z"), status, recordedBy: actor });
        });
      });
      await tx.attendanceRecord.createMany({ data: attendance });

      // --- Announcement ---
      await tx.announcement.create({
        data: { schoolId, authorId: actor, title: "Welcome to Ahlulbayt Academy", body: "Our school is now live on myMakaranta. Parents can sign in to view fees, results, and updates.", audienceType: "school", audienceIds: [], channels: ["in_app"] },
      });

      return { schoolId, actor };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  // counts (outside the tx)
  const school = await prisma.school.findUnique({ where: { slug: SLUG } });
  const [students, classes, invoices, scores, sheets, attendance] = await Promise.all([
    prisma.student.count({ where: { schoolId: school!.id } }),
    prisma.class.count({ where: { schoolId: school!.id } }),
    prisma.invoice.count({ where: { schoolId: school!.id } }),
    prisma.score.count({ where: { schoolId: school!.id } }),
    prisma.resultSheet.count({ where: { schoolId: school!.id } }),
    prisma.attendanceRecord.count({ where: { schoolId: school!.id } }),
  ]);
  console.log("Seeded Ahlulbayt Academy:", { schoolId: school!.id, students, classes, invoices, scores, sheets, attendance });
  console.log(`Proprietor login: ${PROPRIETOR_PHONE} / ${PROPRIETOR_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
