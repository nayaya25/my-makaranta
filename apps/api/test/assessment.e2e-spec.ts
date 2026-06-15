/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { AssessmentModule } from "../src/modules/assessment/assessment.module";
import { AssessmentTypesService } from "../src/modules/assessment/assessment-types.service";
import { GradeBoundariesService } from "../src/modules/assessment/grade-boundaries.service";
import { SubjectAssignmentsService } from "../src/modules/assessment/subject-assignments.service";
import { ScoresService } from "../src/modules/assessment/scores.service";
import { ReviewService } from "../src/modules/assessment/review.service";
import { ReleaseService } from "../src/modules/assessment/release.service";
import { CorrectionService } from "../src/modules/assessment/correction.service";
import { AuthService } from "../src/core/auth/auth.service";
import { SmsService } from "../src/core/auth/sms.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Assessment config (e2e)", () => {
  let prisma: PrismaService;
  let types: AssessmentTypesService;
  let boundaries: GradeBoundariesService;
  let assignments: SubjectAssignmentsService;
  let scores: ScoresService;
  let review: ReviewService;
  let release2: ReleaseService;
  let correction: CorrectionService;
  let auth: AuthService;
  let sms: SmsService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  let subjectId: string;
  let classId: string;
  let staffId: string;
  let academicYearId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        AssessmentModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    types = moduleRef.get(AssessmentTypesService);
    boundaries = moduleRef.get(GradeBoundariesService);
    assignments = moduleRef.get(SubjectAssignmentsService);
    scores = moduleRef.get(ScoresService);
    review = moduleRef.get(ReviewService);
    release2 = moduleRef.get(ReleaseService);
    correction = moduleRef.get(CorrectionService);
    auth = moduleRef.get(AuthService);
    sms = moduleRef.get(SmsService);

    const a = await prisma.school.create({ data: { name: `Asmt A ${suffix}`, slug: `asmt-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Asmt B ${suffix}`, slug: `asmt-b-${suffix}` } });
    schoolBId = b.id;

    const year = await prisma.academicYear.create({
      data: { schoolId, name: `2024/2025-asmt-${suffix}`, startDate: new Date("2024-09-01"), endDate: new Date("2025-07-31") },
    });
    academicYearId = year.id;
    const subject = await prisma.subject.create({ data: { schoolId, name: "Mathematics", code: `MTH-${suffix}` } });
    subjectId = subject.id;
    const level = await prisma.classLevel.create({ data: { schoolId, name: `JSS1-${suffix}`, order: 1 } });
    const klass = await prisma.class.create({ data: { schoolId, classLevelId: level.id, name: `JSS1A-${suffix}` } });
    classId = klass.id;
    const staff = await prisma.staff.create({
      data: { schoolId, staffNo: `T-${suffix}`, firstName: "Grace", lastName: "Okon", email: `g${suffix}@s.test`, phone: "+2348000000000" },
    });
    staffId = staff.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("assessment types", () => {
    it("rejects a set whose maxScores do not sum to 100", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 10, order: 0 },
          { name: "Exam", maxScore: 80, order: 1 },
        ])),
      ).rejects.toThrow(/100/);
    });

    it("accepts a valid set summing to 100 and lists it ordered", async () => {
      const saved = await asA(() => types.replace([
        { name: "CA1", maxScore: 10, order: 0 },
        { name: "CA2", maxScore: 10, order: 1 },
        { name: "CA3", maxScore: 10, order: 2 },
        { name: "Exam", maxScore: 70, order: 3 },
      ]));
      expect(saved.map((t) => t.name)).toEqual(["CA1", "CA2", "CA3", "Exam"]);
      const list = await asA(() => types.list());
      expect(list).toHaveLength(4);
      // school B never set any types; A's replace must not touch B's rows
      expect(await asB(() => types.list())).toHaveLength(0);
    });

    it("rejects duplicate type names", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 50, order: 0 },
          { name: "CA1", maxScore: 50, order: 1 },
        ])),
      ).rejects.toThrow();
    });
  });

  describe("grade boundaries", () => {
    it("applies the WAEC template and lists 9 bands ordered desc by minScore", async () => {
      await asA(() => boundaries.applyTemplate("WAEC"));
      const list = await asA(() => boundaries.list());
      expect(list).toHaveLength(9);
      expect(list[0]?.grade).toBe("A1");
      expect(list[0]?.minScore).toBe(75);
      expect(list[list.length - 1]?.grade).toBe("F9");
      expect(list[list.length - 1]?.minScore).toBe(0);
      // school B never applied a template; A's replace must not touch B's bands
      expect(await asB(() => boundaries.list())).toHaveLength(0);
    });

    it("rejects a band set with no zero (catch-all) band", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 75, remark: "Excellent", order: 0 },
          { grade: "C6", minScore: 50, remark: "Credit", order: 1 },
        ])),
      ).rejects.toThrow();
    });

    it("rejects duplicate minScores", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 50, remark: "x", order: 0 },
          { grade: "C6", minScore: 50, remark: "y", order: 1 },
          { grade: "F9", minScore: 0, remark: "z", order: 2 },
        ])),
      ).rejects.toThrow();
    });
  });

  describe("subject assignments", () => {
    let createdId: string;

    it("creates an assignment with valid tenant ids", async () => {
      const a = await asA(() => assignments.create({ subjectId, classId, staffId, academicYearId }));
      expect(a.id).toBeDefined();
      createdId = a.id;
    });

    it("rejects a duplicate (subject, class, year) with Conflict", async () => {
      await expect(
        asA(() => assignments.create({ subjectId, classId, staffId, academicYearId })),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects a foreign/unknown subjectId with NotFound", async () => {
      await expect(
        asA(() => assignments.create({ subjectId: "nonexistent", classId, staffId, academicYearId })),
      ).rejects.toThrow(NotFoundException);
    });

    it("lists assignments filtered by class + year, enriched with names", async () => {
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0]?.subject?.name).toBe("Mathematics");
    });

    it("removes an assignment", async () => {
      await asA(() => assignments.remove(createdId));
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.find((x) => x.id === createdId)).toBeUndefined();
    });
  });

  describe("cross-tenant isolation", () => {
    it("school B sees none of school A's assessment types", async () => {
      // A set its types earlier; B set none.
      expect(await asB(() => types.list())).toHaveLength(0);
    });

    it("school B cannot create an assignment with school A's ids (IDOR -> NotFound)", async () => {
      await expect(
        asB(() => assignments.create({ subjectId, classId, staffId, academicYearId })),
      ).rejects.toThrow(NotFoundException);
    });

    it("school B cannot remove school A's assignment (IDOR -> NotFound)", async () => {
      const a = await asA(() => assignments.create({ subjectId, classId, staffId, academicYearId }));
      await expect(asB(() => assignments.remove(a.id))).rejects.toThrow(NotFoundException);
      // A's row is untouched
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.find((x) => x.id === a.id)).toBeDefined();
      await asA(() => assignments.remove(a.id)); // cleanup
    });
  });

  describe("scores", () => {
    let termId: string;
    let s1: string;
    let s2: string;
    const recorder = "rec-user";

    beforeAll(async () => {
      const term = await prisma.term.create({
        data: { schoolId, academicYearId, number: 1, startDate: new Date("2024-09-01"), endDate: new Date("2024-12-20"), isCurrent: true },
      });
      termId = term.id;
      const st1 = await prisma.student.create({ data: { schoolId, admissionNo: `A1-${suffix}`, firstName: "Ada", lastName: "Eze", gender: "FEMALE", dateOfBirth: new Date("2012-01-01") } });
      const st2 = await prisma.student.create({ data: { schoolId, admissionNo: `A2-${suffix}`, firstName: "Bola", lastName: "Ade", gender: "MALE", dateOfBirth: new Date("2012-02-02") } });
      s1 = st1.id; s2 = st2.id;
      await prisma.enrollment.createMany({ data: [
        { studentId: s1, classId, termId },
        { studentId: s2, classId, termId },
      ] });
      await asA(() => types.replace([
        { name: "CA1", maxScore: 30, order: 0 },
        { name: "Exam", maxScore: 70, order: 1 },
      ]));
      await asA(() => boundaries.applyTemplate("WAEC"));
    });

    it("saves a batch of scores and reads them back with computed totals/grades", async () => {
      const t = await asA(() => types.list());
      const ca1 = t.find((x) => x.name === "CA1")!.id;
      const exam = t.find((x) => x.name === "Exam")!.id;
      const res = await asA(() => scores.saveScores({
        classId, subjectId, termId,
        scores: [
          { studentId: s1, assessmentTypeId: ca1, value: 25 },
          { studentId: s1, assessmentTypeId: exam, value: 60 },
          { studentId: s2, assessmentTypeId: ca1, value: 10 },
        ],
      }, recorder));
      expect(res.saved).toBe(3);

      const gb = await asA(() => scores.getGradebook(classId, subjectId, termId));
      expect(gb.assessmentTypes.length).toBe(2);
      const ada = gb.students.find((x) => x.studentId === s1)!;
      expect(ada.total).toBe(85);
      expect(ada.grade).toBe("A1");
      expect(ada.complete).toBe(true);
      const bola = gb.students.find((x) => x.studentId === s2)!;
      expect(bola.total).toBe(10);
      expect(bola.complete).toBe(false);
    });

    it("rejects a value greater than the assessment type's maxScore", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: s1, assessmentTypeId: ca1, value: 31 }] }, recorder)),
      ).rejects.toThrow(/max|exceed|30/i);
    });

    it("rejects a non-enrolled student", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: "nope", assessmentTypeId: ca1, value: 5 }] }, recorder)),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a foreign classId (cross-tenant)", async () => {
      const ca1 = (await asA(() => types.list())).find((x) => x.name === "CA1")!.id;
      await expect(
        asB(() => scores.saveScores({ classId, subjectId, termId, scores: [{ studentId: s1, assessmentTypeId: ca1, value: 5 }] }, recorder)),
      ).rejects.toThrow(NotFoundException);
    });

    it("blocks assessment-type replace once a score exists (structure guard)", async () => {
      // earlier tests in this describe already saved scores for school A
      await expect(
        asA(() => types.replace([{ name: "CA1", maxScore: 100, order: 0 }])),
      ).rejects.toThrow(/scores have been entered/i);
    });
  });

  describe("review", () => {
    let rTerm: string;
    let phys: string;
    let caId: string;
    let examId: string;
    let classA: string;
    let classB: string;

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 2, startDate: new Date("2025-01-01"), endDate: new Date("2025-04-01"), isCurrent: false } });
      rTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Physics", code: `PHY-${suffix}` } });
      phys = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `JSS2-${suffix}`, order: 2 } });
      const ca = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS2A-${suffix}` } });
      const cb = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS2B-${suffix}` } });
      classA = ca.id; classB = cb.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `R-${suffix}`, firstName: "Rev", lastName: "Teacher", email: `r${suffix}@s.test`, phone: "+2348000000111" } });
      await prisma.subjectAssignment.createMany({ data: [
        { schoolId, subjectId: phys, classId: classA, staffId: staff.id, academicYearId },
        { schoolId, subjectId: phys, classId: classB, staffId: staff.id, academicYearId },
      ] });
      const t = await asA(() => types.list());
      caId = t.find((x) => x.name === "CA1")!.id;
      examId = t.find((x) => x.name === "Exam")!.id;

      // Deterministic cohort: classA clusters ~90 + one low outlier (20); classB ~60.
      // Cohort totals 90,92,91,89,88,20,60,62,61,59 → mean 71.2 σ≈22; z(20)≈-2.3 (flagged).
      // classA mean ≈78.3 > classB 60.5; classA drift +, classB drift −. (CA1≤30, Exam≤70.)
      const mk = async (cls: string, label: string, caV: number, examV: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `R${label}-${suffix}`, firstName: label, lastName: "Test", gender: "MALE", dateOfBirth: new Date("2011-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: rTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: phys, termId: rTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: caV },
          { studentId: st.id, assessmentTypeId: examId, value: examV },
        ] }, "rev"));
        return st.id;
      };
      await mk(classA, "A1", 28, 62);
      await mk(classA, "A2", 30, 62);
      await mk(classA, "A3", 29, 62);
      await mk(classA, "A4", 27, 62);
      await mk(classA, "A5", 26, 62);
      await mk(classA, "OUT", 10, 10);
      await mk(classB, "B1", 20, 40);
      await mk(classB, "B2", 22, 40);
      await mk(classB, "B3", 21, 40);
      await mk(classB, "B4", 19, 40);
    });

    it("class-master returns a student×subject matrix with totals, grades, average, anomaly", async () => {
      const sheet = await asA(() => review.classMaster(classA, rTerm));
      expect(sheet.subjects.some((s) => s.id === phys)).toBe(true);
      const out = sheet.students.find((s) => s.name.startsWith("OUT"))!;
      expect(out.perSubject[phys]!.total).toBe(20);
      expect(out.perSubject[phys]!.anomaly).toBe(true);
      expect(typeof out.average).toBe("number");
      const a1 = sheet.students.find((s) => s.name.startsWith("A1"))!;
      expect(a1.perSubject[phys]!.anomaly).toBe(false);
    });

    it("subject-master returns per-class means, subject stats, drift, and flags the outlier", async () => {
      const sheet = await asA(() => review.subjectMaster(phys, rTerm));
      expect(sheet.classes.length).toBe(2);
      const a = sheet.classes.find((c) => c.classId === classA)!;
      const b = sheet.classes.find((c) => c.classId === classB)!;
      expect(a.mean).toBeGreaterThan(b.mean);
      expect(a.drift).toBeGreaterThan(0);
      expect(b.drift).toBeLessThan(0);
      expect(a.students.find((s) => s.name.startsWith("OUT"))!.anomaly).toBe(true);
      expect(sheet.subjectStdDev).toBeGreaterThan(0);
    });

    it("rejects a foreign classId/subjectId (cross-tenant)", async () => {
      await expect(asB(() => review.classMaster(classA, rTerm))).rejects.toThrow(NotFoundException);
      await expect(asB(() => review.subjectMaster(phys, rTerm))).rejects.toThrow(NotFoundException);
    });
  });

  describe("release", () => {
    let rTerm: string;
    let subj: string;
    let cls: string;
    let s1: string; let s2: string; let s3: string;

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 3, startDate: new Date("2025-04-15"), endDate: new Date("2025-07-31"), isCurrent: false } });
      rTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Chemistry", code: `CHM-${suffix}` } });
      subj = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `JSS3-${suffix}`, order: 3 } });
      const klass = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `JSS3A-${suffix}` } });
      cls = klass.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `RL-${suffix}`, firstName: "Rel", lastName: "T", email: `rl${suffix}@s.test`, phone: "+2348000000222" } });
      await prisma.subjectAssignment.create({ data: { schoolId, subjectId: subj, classId: cls, staffId: staff.id, academicYearId } });
      const t = await asA(() => types.list());
      const caId = t.find((x) => x.name === "CA1")!.id;
      const examId = t.find((x) => x.name === "Exam")!.id;
      const mk = async (label: string, caV: number, examV: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: rTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: rTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: caV }, { studentId: st.id, assessmentTypeId: examId, value: examV },
        ] }, "rel"));
        return st.id;
      };
      s1 = await mk("S1", 28, 52); // 80
      s2 = await mk("S2", 30, 50); // 80 — tie with S1
      s3 = await mk("S3", 20, 40); // 60
    });

    it("releases a class: freezes ResultSheets with averages, positions (ties), and entries", async () => {
      const res = await asA(() => release2.release(cls, rTerm, "principal-1"));
      expect(res.released).toBe(3);
      const sheet = await asA(() => release2.getSheet(cls, rTerm));
      const byName = (n: string) => sheet.students.find((x) => x.name.startsWith(n))!;
      expect(byName("S1").average).toBe(80);
      expect(byName("S1").position).toBe(1);
      expect(byName("S2").position).toBe(1); // tie
      expect(byName("S3").position).toBe(3); // competition ranking
      expect(byName("S1").entries[0]!.subjectId).toBe(subj);
      expect(byName("S1").entries[0]!.total).toBe(80);
      expect(sheet.students[0]!.position).toBeLessThanOrEqual(sheet.students[sheet.students.length - 1]!.position);
    });

    it("creates a Verification per released sheet with a code + snapshot", async () => {
      const sheets = await prisma.resultSheet.findMany({ where: { schoolId, classId: cls, termId: rTerm }, include: { verification: true } });
      expect(sheets.length).toBeGreaterThan(0);
      for (const s of sheets) {
        expect(s.verification).toBeTruthy();
        expect(s.verification!.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$/);
        expect(s.verification!.average).toBe(s.average);
        expect(s.verification!.position).toBe(s.position);
        expect(s.verification!.studentName.length).toBeGreaterThan(0);
        expect(s.verification!.schoolId).toBe(schoolId);
      }
    });

    it("rejects re-releasing an already-released class", async () => {
      await expect(asA(() => release2.release(cls, rTerm, "principal-1"))).rejects.toThrow(ConflictException);
    });

    it("status reflects the released class for the term", async () => {
      const st = await asA(() => release2.getStatus(rTerm));
      const row = st.find((c) => c.classId === cls)!;
      expect(row.released).toBe(true);
      expect(row.releasedAt).toBeTruthy();
    });

    it("rejects cross-tenant release/read", async () => {
      await expect(asB(() => release2.release(cls, rTerm, "x"))).rejects.toThrow(NotFoundException);
      await expect(asB(() => release2.getSheet(cls, rTerm))).rejects.toThrow(NotFoundException);
    });

    it("blocks score edits after release (immutability)", async () => {
      const t = await asA(() => types.list());
      const caId = t.find((x) => x.name === "CA1")!.id;
      await expect(
        asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: rTerm, scores: [{ studentId: s1, assessmentTypeId: caId, value: 5 }] }, "rel")),
      ).rejects.toThrow(/released/i);
    });
  });

  describe("correction", () => {
    let cTerm: string; let subj: string; let cls: string;
    let lo: string; let hi: string;
    let caId: string; let examId: string;

    beforeAll(async () => {
      const term = await prisma.term.create({ data: { schoolId, academicYearId, number: 2, startDate: new Date("2025-01-10"), endDate: new Date("2025-04-10"), isCurrent: false } });
      cTerm = term.id;
      const subject = await prisma.subject.create({ data: { schoolId, name: "Biology", code: `BIO-${suffix}` } });
      subj = subject.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `SS1-${suffix}`, order: 4 } });
      const klass = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `SS1A-${suffix}` } });
      cls = klass.id;
      const staff = await prisma.staff.create({ data: { schoolId, staffNo: `CR-${suffix}`, firstName: "Cor", lastName: "T", email: `cr${suffix}@s.test`, phone: "+2348000000333" } });
      await prisma.subjectAssignment.create({ data: { schoolId, subjectId: subj, classId: cls, staffId: staff.id, academicYearId } });
      const t = await asA(() => types.list());
      caId = t.find((x) => x.name === "CA1")!.id;
      examId = t.find((x) => x.name === "Exam")!.id;
      const mk = async (label: string, caV: number, examV: number) => {
        const st = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "T", gender: "MALE", dateOfBirth: new Date("2009-01-01") } });
        await prisma.enrollment.create({ data: { studentId: st.id, classId: cls, termId: cTerm } });
        await asA(() => scores.saveScores({ classId: cls, subjectId: subj, termId: cTerm, scores: [
          { studentId: st.id, assessmentTypeId: caId, value: caV }, { studentId: st.id, assessmentTypeId: examId, value: examV },
        ] }, "rec"));
        return st.id;
      };
      lo = await mk("Lo", 10, 40); // total 50 -> behind
      hi = await mk("Hi", 20, 50); // total 70 -> ahead
      await asA(() => release2.release(cls, cTerm, "principal"));
    });

    // Distinct phone per test keeps each under the 5/hour OTP rate limit.
    let phoneSeq = 0;
    const freshActor = () => {
      const phone = `+234809000${String(2230 + phoneSeq++).padStart(4, "0")}`;
      return { id: "prop-1", phone, schoolId, identityType: "PROPRIETOR" };
    };
    const freshOtp = async (phone: string) => { await auth.requestOtp(phone); return sms.lastCodeForTest(phone)!; };

    it("corrects a score (OTP required), re-ranks the class, and records the Correction", async () => {
      const actor = freshActor();
      const before = await asA(() => release2.getSheet(cls, cTerm));
      expect(before.students.find((s) => s.name.startsWith("Lo"))!.position).toBe(2);
      const code = await freshOtp(actor.phone);
      await asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: examId, newValue: 60, reason: "marking error", otpCode: code }, actor));
      const after = await asA(() => release2.getSheet(cls, cTerm));
      const loRow = after.students.find((s) => s.name.startsWith("Lo"))!;
      expect(loRow.entries[0]!.total).toBe(70);
      expect(loRow.average).toBe(70);
      expect(loRow.position).toBe(1);
      const rec = await prisma.correction.findFirst({ where: { schoolId, studentId: lo, subjectId: subj, assessmentTypeId: examId } });
      expect(rec).toBeTruthy();
      expect(rec!.oldValue).toBe(40); expect(rec!.newValue).toBe(60);
      expect(rec!.oldTotal).toBe(50); expect(rec!.newTotal).toBe(70);
      expect(rec!.oldPosition).toBe(2); expect(rec!.newPosition).toBe(1);
      expect(rec!.otpVerified).toBe(true);
      expect(rec!.reason).toBe("marking error");
    });

    it("rejects an invalid OTP when the tenant requires it", async () => {
      const actor = freshActor();
      await auth.requestOtp(actor.phone);
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: "000000" }, actor))).rejects.toThrow(/invalid|expired/i);
    });

    it("rejects an empty reason", async () => {
      const actor = freshActor();
      const code = await freshOtp(actor.phone);
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "  ", otpCode: code }, actor))).rejects.toThrow(/reason/i);
    });

    it("rejects a value above the component max", async () => {
      const actor = freshActor();
      const code = await freshOtp(actor.phone);
      await expect(asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 999, reason: "x", otpCode: code }, actor))).rejects.toThrow(/max|exceed/i);
    });

    it("rejects correcting an unreleased class", async () => {
      const actor = freshActor();
      const code = await freshOtp(actor.phone);
      const t2 = await prisma.term.create({ data: { schoolId, academicYearId, number: 4, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-01"), isCurrent: false } });
      await expect(asA(() => correction.correct({ classId: cls, termId: t2.id, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: code }, actor))).rejects.toThrow(/not released|released|sheet/i);
    });

    it("rejects cross-tenant correction", async () => {
      const actor = freshActor();
      const code = await freshOtp(actor.phone);
      await expect(asB(() => correction.correct({ classId: cls, termId: cTerm, studentId: lo, subjectId: subj, assessmentTypeId: caId, newValue: 5, reason: "x", otpCode: code }, { ...actor, schoolId: schoolBId }))).rejects.toThrow(/not found/i);
    });

    it("exposes and flips the OTP config (tenant-scoped)", async () => {
      const c0 = await asA(() => correction.getConfig());
      expect(c0.requireCorrectionOtp).toBe(true);
      const c1 = await asA(() => correction.setConfig(false));
      expect(c1.requireCorrectionOtp).toBe(false);
      expect((await asA(() => correction.getConfig())).requireCorrectionOtp).toBe(false);
    });

    it("allows a correction with NO otp when the tenant disabled it (otpVerified=false)", async () => {
      await asA(() => correction.setConfig(false));
      await asA(() => correction.correct({ classId: cls, termId: cTerm, studentId: hi, subjectId: subj, assessmentTypeId: caId, newValue: 15, reason: "no-otp path", otpCode: undefined }, { id: "prop-nootp", phone: "+2348090000999", schoolId, identityType: "PROPRIETOR" }));
      const rec = await prisma.correction.findFirst({ where: { schoolId, studentId: hi, assessmentTypeId: caId }, orderBy: { correctedAt: "desc" } });
      expect(rec!.otpVerified).toBe(false);
      await asA(() => correction.setConfig(true)); // restore
    });

    it("returns correctable component scores for a student+subject", async () => {
      const comps = await asA(() => correction.getCorrectableScores(cls, cTerm, hi, subj));
      const exam = comps.find((c) => c.name === "Exam")!;
      expect(exam.maxScore).toBe(70);
      expect(typeof exam.value === "number" || exam.value === null).toBe(true);
    });
  });
});
