/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { DashboardModule } from "../src/modules/dashboard/dashboard.module";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Dashboard (e2e)", () => {
  let prisma: PrismaService;
  let dashboard: DashboardService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        DashboardModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    dashboard = moduleRef.get(DashboardService);

    const a = await prisma.school.create({ data: { name: `Dash A ${suffix}`, slug: `dash-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Dash B ${suffix}`, slug: `dash-b-${suffix}` } });
    schoolBId = b.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("proprietor summary", () => {
    let termId: string;

    beforeAll(async () => {
      // Term window 2025-09-01..2025-12-20 (ended → windowTo clamps to endDate).
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `DashYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `DashJSS1-${suffix}`, order: 1 } });

      // Two students, two invoices (one fully paid, one half) — past due so the unpaid one is OVERDUE.
      const past = new Date("2025-10-15");
      const mkStudent = async (label: string) =>
        prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "D", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      const s1 = await mkStudent("D1");
      const s2 = await mkStudent("D2");
      const inv1 = await prisma.invoice.create({ data: { schoolId, studentId: s1.id, termId, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 6000000, dueDate: past } });
      const inv2 = await prisma.invoice.create({ data: { schoolId, studentId: s2.id, termId, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 3000000, dueDate: past } });
      // collectedThisWeek = a SUCCESS payment paid now (within 7d); an old one must NOT count.
      await prisma.payment.create({ data: { schoolId, invoiceId: inv1.id, amountKobo: 6000000, channel: "CASH", reference: `DASHR-${suffix}`, status: "SUCCESS", paidAt: new Date(), recordedBy: "x" } });
      await prisma.payment.create({ data: { schoolId, invoiceId: inv2.id, amountKobo: 3000000, channel: "CASH", reference: `DASHO-${suffix}`, status: "SUCCESS", paidAt: new Date("2025-10-15"), recordedBy: "x" } });

      // Attendance inside the window: 6 present, 2 late, 1 absent, 1 excused → rate 0.8.
      const d = new Date("2025-10-01");
      const cls = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `DashClass-${suffix}` } });
      const mkAtt = async (student: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED", n: number) => {
        for (let i = 0; i < n; i++) {
          await prisma.attendanceRecord.create({ data: { schoolId, studentId: student, classId: cls.id, date: new Date(d.getTime() + (status.length + i) * 86400000), status, recordedBy: "x" } });
        }
      };
      await mkAtt(s1.id, "PRESENT", 6);
      await mkAtt(s1.id, "LATE", 2);
      await mkAtt(s2.id, "ABSENT", 1);
      await mkAtt(s2.id, "EXCUSED", 1);

      // Results: enrol both, release the class, two result sheets → mean average 80.
      await prisma.enrollment.create({ data: { studentId: s1.id, classId: cls.id, termId } });
      await prisma.enrollment.create({ data: { studentId: s2.id, classId: cls.id, termId } });
      const rel = await prisma.release.create({ data: { schoolId, classId: cls.id, termId, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId, releaseId: rel.id, studentId: s1.id, classId: cls.id, termId, average: 85, position: 1 } });
      await prisma.resultSheet.create({ data: { schoolId, releaseId: rel.id, studentId: s2.id, classId: cls.id, termId, average: 75, position: 2 } });
    });

    it("aggregates fees / attendance / results for the current term (no termId)", async () => {
      const r = await asA(() => dashboard.getProprietorSummary());
      expect(r.term?.id).toBe(termId);
      expect(r.term?.number).toBe(1);
      // fees
      expect(r.fees.expectedKobo).toBe(12000000);
      expect(r.fees.collectedKobo).toBe(9000000);
      expect(r.fees.outstandingKobo).toBe(3000000);
      expect(r.fees.overdueKobo).toBe(3000000);
      expect(r.fees.collectedThisWeekKobo).toBe(6000000);
      // attendance
      expect(r.attendance.presentDays).toBe(8);
      expect(r.attendance.totalDays).toBe(10);
      expect(r.attendance.rate).toBeCloseTo(0.8, 5);
      // results
      expect(r.results.classesTotal).toBe(1);
      expect(r.results.classesReleased).toBe(1);
      expect(r.results.topClass?.average).toBe(80);
      expect(r.results.topClass?.classId).toBeDefined();
    });

    it("accepts an explicit termId", async () => {
      const r = await asA(() => dashboard.getProprietorSummary(termId));
      expect(r.term?.id).toBe(termId);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getProprietorSummary(termId))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + zeroed KPIs when the school has no current term", async () => {
      // School B has no term at all.
      const r = await asB(() => dashboard.getProprietorSummary());
      expect(r.term).toBeNull();
      expect(r.fees.expectedKobo).toBe(0);
      expect(r.results.topClass).toBeNull();
      expect(r.attendance.rate).toBe(0);
    });
  });

  describe("principal summary", () => {
    let schoolCId: string;
    let termC: string;
    let class1: string;
    let class2: string;
    const asC = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolCId, userId }, fn);

    beforeAll(async () => {
      const c = await prisma.school.create({ data: { name: `Dash C ${suffix}`, slug: `dash-c-${suffix}` } });
      schoolCId = c.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: schoolCId, name: `DashCYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId: schoolCId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termC = term.id;
      const lvl1 = await prisma.classLevel.create({ data: { schoolId: schoolCId, name: `PL1-${suffix}`, order: 1 } });
      const lvl2 = await prisma.classLevel.create({ data: { schoolId: schoolCId, name: `PL2-${suffix}`, order: 2 } });
      const teacher = await prisma.staff.create({ data: { schoolId: schoolCId, staffNo: `PT-${suffix}`, firstName: "Form", lastName: "Teacher", email: `pt-${suffix}@e.test`, phone: `+234900${String(suffix).slice(-7)}` } });
      // class1 has a form teacher; class2 does not. class2 ordered after class1 by level order.
      const c1 = await prisma.class.create({ data: { schoolId: schoolCId, classLevelId: lvl1.id, name: `P1A-${suffix}`, formTeacherId: teacher.id } });
      const c2 = await prisma.class.create({ data: { schoolId: schoolCId, classLevelId: lvl2.id, name: `P1B-${suffix}` } });
      class1 = c1.id; class2 = c2.id;

      const at = await prisma.assessmentType.create({ data: { schoolId: schoolCId, name: `CA-${suffix}`, maxScore: 100, order: 1 } });
      const mkSubj = (n: string) => prisma.subject.create({ data: { schoolId: schoolCId, name: n, code: `${n}-${suffix}` } });
      const subjA = await mkSubj("Maths"); const subjB = await mkSubj("English"); const subjC = await mkSubj("Science");
      const subjD = await mkSubj("Civics"); const subjE = await mkSubj("Arts");
      // class1: 3 subjects offered, 2 scored. class2: 2 subjects offered, 0 scored.
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId: schoolCId, subjectId: subjA.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjB.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjC.id, classId: class1, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjD.id, classId: class2, staffId: teacher.id, academicYearId: ay.id },
        { schoolId: schoolCId, subjectId: subjE.id, classId: class2, staffId: teacher.id, academicYearId: ay.id },
      ] });

      const mkStu = (label: string) => prisma.student.create({ data: { schoolId: schoolCId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "P", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
      const s1 = await mkStu("PS1"); const s2 = await mkStu("PS2"); const s3 = await mkStu("PS3");
      await prisma.enrollment.createMany({ data: [
        { studentId: s1.id, classId: class1, termId: termC },
        { studentId: s2.id, classId: class1, termId: termC },
        { studentId: s3.id, classId: class2, termId: termC },
      ] });

      // class1 scores: subjA + subjB scored (for s1) → 2 distinct OFFERED subjects. subjC unscored.
      // subjD is NOT offered to class1 (it's a class2 subject); a stray score for it must NOT inflate
      // class1 coverage above offered (regression guard for the scored>offered edge).
      await prisma.score.createMany({ data: [
        { schoolId: schoolCId, studentId: s1.id, subjectId: subjA.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 70, recordedBy: "x" },
        { schoolId: schoolCId, studentId: s1.id, subjectId: subjB.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 60, recordedBy: "x" },
        { schoolId: schoolCId, studentId: s2.id, subjectId: subjA.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 80, recordedBy: "x" },
        { schoolId: schoolCId, studentId: s1.id, subjectId: subjD.id, classId: class1, assessmentTypeId: at.id, termId: termC, value: 90, recordedBy: "x" },
      ] });

      // class1 released; class2 not.
      const rel = await prisma.release.create({ data: { schoolId: schoolCId, classId: class1, termId: termC, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId: schoolCId, releaseId: rel.id, studentId: s1.id, classId: class1, termId: termC, average: 65, position: 1 } });

      // class1 attendance: s1 6 present + 2 late, s2 1 absent + 1 excused → 8/10 = 0.8.
      const base = new Date("2025-10-01").getTime();
      let day = 0;
      const att = async (sid: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED", n: number) => {
        for (let i = 0; i < n; i++) {
          await prisma.attendanceRecord.create({ data: { schoolId: schoolCId, studentId: sid, classId: class1, date: new Date(base + (day++) * 86400000), status, recordedBy: "x" } });
        }
      };
      await att(s1.id, "PRESENT", 6); await att(s1.id, "LATE", 2); await att(s2.id, "ABSENT", 1); await att(s2.id, "EXCUSED", 1);

      // class1 fees: s1 6,000,000/6,000,000 (paid), s2 6,000,000/3,000,000 (partial) → paidRate 0.75.
      // class2 fees: s3 4,000,000/4,000,000 → paidRate 1.0.
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s1.id, termId: termC, classLevelId: lvl1.id, totalKobo: 6000000, paidKobo: 6000000 } });
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s2.id, termId: termC, classLevelId: lvl1.id, totalKobo: 6000000, paidKobo: 3000000 } });
      await prisma.invoice.create({ data: { schoolId: schoolCId, studentId: s3.id, termId: termC, classLevelId: lvl2.id, totalKobo: 4000000, paidKobo: 4000000 } });
    });

    it("returns per-class rows for the current term (no termId), sorted by level order", async () => {
      const r = await asC(() => dashboard.getPrincipalSummary());
      expect(r.term?.id).toBe(termC);
      expect(r.classes.map((c) => c.classId)).toEqual([class1, class2]); // level order 1 then 2
      const a = r.classes.find((c) => c.classId === class1)!;
      expect(a.formTeacher).toBe("Form Teacher");
      expect(a.results).toEqual({ subjectsScored: 2, subjectsOffered: 3, released: true });
      expect(a.attendance.presentDays).toBe(8);
      expect(a.attendance.totalDays).toBe(10);
      expect(a.attendance.rate).toBeCloseTo(0.8, 5);
      expect(a.fees.expectedKobo).toBe(12000000);
      expect(a.fees.collectedKobo).toBe(9000000);
      expect(a.fees.paidRate).toBeCloseTo(0.75, 5);
      const b = r.classes.find((c) => c.classId === class2)!;
      expect(b.formTeacher).toBeNull();
      expect(b.results).toEqual({ subjectsScored: 0, subjectsOffered: 2, released: false });
      expect(b.attendance.totalDays).toBe(0);
      expect(b.fees.paidRate).toBe(1);
    });

    it("accepts an explicit termId", async () => {
      const r = await asC(() => dashboard.getPrincipalSummary(termC));
      expect(r.classes.length).toBe(2);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getPrincipalSummary(termC))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + [] when the school has no current term", async () => {
      const r = await asB(() => dashboard.getPrincipalSummary());
      expect(r.term).toBeNull();
      expect(r.classes).toEqual([]);
    });
  });
});
