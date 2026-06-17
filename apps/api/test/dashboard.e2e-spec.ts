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

  describe("alerts", () => {
    let schoolDId: string;
    let termD: string;
    let classDip: string;
    let classLow: string;
    let classResults: string;
    let classHealthy: string;
    const asD = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolDId, userId }, fn);

    beforeAll(async () => {
      const d = await prisma.school.create({ data: { name: `Dash D ${suffix}`, slug: `dash-d-${suffix}` } });
      schoolDId = d.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: schoolDId, name: `DashDYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      // Term ENDED (endDate < now) → windowTo clamps to endDate, termElapsedFraction = 1.
      const term = await prisma.term.create({ data: { schoolId: schoolDId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termD = term.id;
      const mkLevel = (n: number) => prisma.classLevel.create({ data: { schoolId: schoolDId, name: `AL${n}-${suffix}`, order: n } });
      const l1 = await mkLevel(1); const l2 = await mkLevel(2); const l3 = await mkLevel(3); const l4 = await mkLevel(4);
      const mkClass = (lvlId: string, name: string) => prisma.class.create({ data: { schoolId: schoolDId, classLevelId: lvlId, name: `${name}-${suffix}` } });
      const cDip = await mkClass(l1.id, "ADip"); const cLow = await mkClass(l2.id, "ALow");
      const cRes = await mkClass(l3.id, "ARes"); const cOk = await mkClass(l4.id, "AOk");
      classDip = cDip.id; classLow = cLow.id; classResults = cRes.id; classHealthy = cOk.id;

      const mkStu = (label: string) => prisma.student.create({ data: { schoolId: schoolDId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "A", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
      // Each class needs >=1 enrolled student so it appears in the term's class list.
      const dip1 = await mkStu("Dip1"); const dip2 = await mkStu("Dip2");
      const low1 = await mkStu("Low1"); const res1 = await mkStu("Res1"); const ok1 = await mkStu("Ok1");
      await prisma.enrollment.createMany({ data: [
        { studentId: dip1.id, classId: classDip, termId: termD },
        { studentId: dip2.id, classId: classDip, termId: termD },
        { studentId: low1.id, classId: classLow, termId: termD },
        { studentId: res1.id, classId: classResults, termId: termD },
        { studentId: ok1.id, classId: classHealthy, termId: termD },
      ] });

      // --- classDip: high baseline (Oct PRESENT) + low recent (Dec 14-19 ABSENT, 12 marks) → dip high.
      const attData: { schoolId: string; studentId: string; classId: string; date: Date; status: "PRESENT" | "ABSENT"; recordedBy: string }[] = [];
      for (const sid of [dip1.id, dip2.id]) {
        for (let day = 1; day <= 6; day++) attData.push({ schoolId: schoolDId, studentId: sid, classId: classDip, date: new Date(`2025-10-0${day}`), status: "PRESENT", recordedBy: "x" });
        for (let day = 14; day <= 19; day++) attData.push({ schoolId: schoolDId, studentId: sid, classId: classDip, date: new Date(`2025-12-${day}`), status: "ABSENT", recordedBy: "x" });
      }
      await prisma.attendanceRecord.createMany({ data: attData });
      // classDip students fully paid (no overdue), no subjects (no results alert).
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: dip1.id, termId: termD, classLevelId: l1.id, totalKobo: 5000000, paidKobo: 5000000 } });

      // --- classLow: an invoice past due, fully unpaid → overdue 100% → LOW_COLLECTION high. No subjects/attendance.
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: low1.id, termId: termD, classLevelId: l2.id, totalKobo: 5000000, paidKobo: 0, dueDate: new Date("2025-10-15") } });

      // --- classResults: 2 offered, 1 scored, not released, term ended → RESULTS_OVERDUE high. Fully paid (no overdue).
      const at = await prisma.assessmentType.create({ data: { schoolId: schoolDId, name: `CA-${suffix}`, maxScore: 100, order: 1 } });
      const subjP = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Phy", code: `PHY-${suffix}` } });
      const subjQ = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Chem", code: `CHM-${suffix}` } });
      const staff = await prisma.staff.create({ data: { schoolId: schoolDId, staffNo: `S-${suffix}`, firstName: "T", lastName: "R", email: `s-${suffix}@e.test`, phone: `+234902${String(suffix).slice(-7)}` } });
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId: schoolDId, subjectId: subjP.id, classId: classResults, staffId: staff.id, academicYearId: ay.id },
        { schoolId: schoolDId, subjectId: subjQ.id, classId: classResults, staffId: staff.id, academicYearId: ay.id },
      ] });
      await prisma.score.create({ data: { schoolId: schoolDId, studentId: res1.id, subjectId: subjP.id, classId: classResults, assessmentTypeId: at.id, termId: termD, value: 50, recordedBy: "x" } });
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: res1.id, termId: termD, classLevelId: l3.id, totalKobo: 5000000, paidKobo: 5000000 } });

      // --- classHealthy: released + full coverage (1 offered, 1 scored), paid invoice → NO alerts.
      const subjR = await prisma.subject.create({ data: { schoolId: schoolDId, name: "Bio", code: `BIO-${suffix}` } });
      await prisma.subjectAssignment.create({ data: { schoolId: schoolDId, subjectId: subjR.id, classId: classHealthy, staffId: staff.id, academicYearId: ay.id } });
      await prisma.score.create({ data: { schoolId: schoolDId, studentId: ok1.id, subjectId: subjR.id, classId: classHealthy, assessmentTypeId: at.id, termId: termD, value: 80, recordedBy: "x" } });
      const rel = await prisma.release.create({ data: { schoolId: schoolDId, classId: classHealthy, termId: termD, releasedBy: "x" } });
      await prisma.resultSheet.create({ data: { schoolId: schoolDId, releaseId: rel.id, studentId: ok1.id, classId: classHealthy, termId: termD, average: 80, position: 1 } });
      await prisma.invoice.create({ data: { schoolId: schoolDId, studentId: ok1.id, termId: termD, classLevelId: l4.id, totalKobo: 5000000, paidKobo: 5000000 } });
    });

    const byClass = (alerts: { classId: string; type: string; severity: string }[], cid: string) =>
      alerts.filter((a) => a.classId === cid).map((a) => [a.type, a.severity]);

    it("emits exactly the expected alert per class (no termId → current term)", async () => {
      const r = await asD(() => dashboard.getAlerts());
      expect(r.term?.id).toBe(termD);
      expect(byClass(r.alerts, classDip)).toEqual([["ATTENDANCE_DIP", "high"]]);
      expect(byClass(r.alerts, classLow)).toEqual([["LOW_COLLECTION", "high"]]);
      expect(byClass(r.alerts, classResults)).toEqual([["RESULTS_OVERDUE", "high"]]);
      expect(byClass(r.alerts, classHealthy)).toEqual([]);
      expect(r.alerts.length).toBe(3);
    });

    it("rejects a foreign term (404)", async () => {
      await expect(asB(() => dashboard.getAlerts(termD))).rejects.toThrow(NotFoundException);
    });

    it("returns term:null + [] when the school has no current term", async () => {
      const r = await asB(() => dashboard.getAlerts());
      expect(r.term).toBeNull();
      expect(r.alerts).toEqual([]);
    });
  });
});
