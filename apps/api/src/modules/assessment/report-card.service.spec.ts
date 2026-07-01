import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ReportCardService } from "./report-card.service";
import type { StandardReportCardPayload } from "./report-card-pdf";

/** Narrows a report-card payload to standard mode for assertions in standard-only tests. */
const asStandard = (r: Awaited<ReturnType<ReportCardService["getReportCard"]>>): StandardReportCardPayload => {
  if (r.mode === "early_years") throw new Error("expected standard-mode report card");
  return r;
};

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

const mockStorage = {
  put: jest.fn(),
  delete: jest.fn(),
  getSignedUrl: async (key: string) => `https://cdn.test/${key}`,
};

describe("ReportCardService – getReportCard payload composition", () => {
  let service: ReportCardService;
  let schoolId: string;
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    // 1. School with logoUrl, principalSignatureUrl, motto
    const school = await prisma.school.create({
      data: {
        name: `RC-Test-${ts}`,
        slug: `rc-test-${ts}`,
        logoUrl: "schools/test-logo.png",
        principalSignatureUrl: "schools/principal-sig.png",
        motto: "Test Motto",
      } as never,
    });
    schoolId = school.id;

    // 2. AcademicYear + Term with startDate/endDate
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `2025/2026-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    // 3. ClassLevel + Class
    const level = await prisma.classLevel.create({
      data: { schoolId, name: `JSS1-${ts}`, order: 0 },
    });
    const klass = await prisma.class.create({
      data: { schoolId, name: `JSS 1A-${ts}`, classLevelId: level.id },
    });

    // 4. Student
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `RC-${ts}`,
        firstName: "Test",
        lastName: "Student",
        gender: "FEMALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    });
    studentId = student.id;

    // 5. Enrollment
    await prisma.enrollment.create({
      data: { studentId, classId: klass.id, termId },
    });

    // 6. AssessmentType
    const assessmentType = await prisma.assessmentType.create({
      data: { schoolId, name: `CA-${ts}`, maxScore: 100, order: 0 },
    });

    // 7. Subject
    const subject = await prisma.subject.create({
      data: { schoolId, name: `Maths-${ts}`, code: `MTH-${ts}` },
    });

    // 8. Person for releasedBy
    const person = await prisma.person.create({ data: {} });

    // 9. Release
    const release = await prisma.release.create({
      data: {
        schoolId,
        classId: klass.id,
        termId,
        releasedBy: person.id,
        releasedAt: new Date(),
      },
    });

    // 10. ResultSheet + ResultSheetEntry
    const sheet = await prisma.resultSheet.create({
      data: {
        schoolId,
        releaseId: release.id,
        studentId,
        classId: klass.id,
        termId,
        average: 80,
        position: 1,
      },
    });
    await prisma.resultSheetEntry.create({
      data: {
        schoolId,
        resultSheetId: sheet.id,
        subjectId: subject.id,
        total: 80,
        grade: "A",
      },
    });

    // 11. SkillDomain x2 conduct (ordered) + 1 early_years leak-test domain
    const domain1 = await prisma.skillDomain.create({
      data: { schoolId, name: `Affective-${ts}`, order: 0 },
    });
    const domain2 = await prisma.skillDomain.create({
      data: { schoolId, name: `Psychomotor-${ts}`, order: 1 },
    });
    // Leak-test: an early_years domain that must NOT appear in standard mode skills
    await prisma.skillDomain.create({
      data: { schoolId, kind: "early_years", name: `EY-Domain-leak-test-${ts}`, order: 2 },
    });

    const item1 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain1.id, name: `Attentiveness-${ts}`, order: 0 },
    });
    const item2 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain1.id, name: `Neatness-${ts}`, order: 1 },
    });
    const item3 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain2.id, name: `Drawing-${ts}`, order: 0 },
    });

    // 12. SkillRating for item1 and item3 (leave item2 null)
    await prisma.skillRating.create({
      data: {
        schoolId,
        studentId,
        termId,
        skillItemId: item1.id,
        value: 4,
        recordedBy: person.id,
      },
    });
    await prisma.skillRating.create({
      data: {
        schoolId,
        studentId,
        termId,
        skillItemId: item3.id,
        value: 3,
        recordedBy: person.id,
      },
    });

    // 13. SkillScalePoint x2
    await prisma.skillScalePoint.create({
      data: { schoolId, value: 5, label: "Excellent", order: 0 },
    });
    await prisma.skillScalePoint.create({
      data: { schoolId, value: 1, label: "Poor", order: 4 },
    });

    // 14. TermRemark
    await prisma.termRemark.create({
      data: {
        schoolId,
        studentId,
        termId,
        formTeacherRemark: "Very attentive student",
        principalRemark: "Keep it up",
      },
    });

    // 15. AttendanceRecord entries: 3 PRESENT, 1 ABSENT, 1 LATE (LATE counts as present)
    const makeDate = (d: number) => new Date(`2025-02-0${d}T00:00:00.000Z`);
    await prisma.attendanceRecord.createMany({
      data: [
        { schoolId, studentId, classId: klass.id, date: makeDate(1), status: "PRESENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(2), status: "PRESENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(3), status: "PRESENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(4), status: "ABSENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(5), status: "LATE", recordedBy: person.id },
      ],
    });

    // Instantiate service with mock storage
    service = new ReportCardService(prisma as unknown as PrismaService, mockStorage as any);
  });

  it("returns skills grouped by domain with items and ratings (null for unrated)", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.skills).toBeDefined();
    expect(result.skills.length).toBeGreaterThanOrEqual(2);

    // Domains should be ordered
    const domainNames = result.skills.map((d: { domain: string }) => d.domain);
    expect(domainNames[0]).toMatch(/Affective/);
    expect(domainNames[1]).toMatch(/Psychomotor/);

    // Domain 1 items: item1 rated=4, item2 rated=null
    const affective = result.skills[0]!;
    expect(affective.items.length).toBe(2);
    const ratedItem = affective.items.find((i: { name: string; value: number | null }) => i.value === 4);
    expect(ratedItem).toBeDefined();
    const nullItem = affective.items.find((i: { name: string; value: number | null }) => i.value === null);
    expect(nullItem).toBeDefined();

    // Domain 2 items: item3 rated=3
    const psychomotor = result.skills[1]!;
    expect(psychomotor.items.length).toBe(1);
    expect(psychomotor.items[0]!.value).toBe(3);
  });

  it("returns scaleKey with seeded scale points ordered", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.scaleKey).toBeDefined();
    expect(result.scaleKey.length).toBeGreaterThanOrEqual(2);

    // Should contain our seeded points
    const values = result.scaleKey.map((p: { value: number; label: string }) => p.value);
    expect(values).toContain(5);
    expect(values).toContain(1);

    const excellent = result.scaleKey.find((p: { value: number; label: string }) => p.value === 5);
    expect(excellent?.label).toBe("Excellent");
  });

  it("returns remarks with formTeacher and principal", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.remarks).toBeDefined();
    expect(result.remarks.formTeacher).toBe("Very attentive student");
    expect(result.remarks.principal).toBe("Keep it up");
  });

  it("returns attendance counts (LATE counts as present)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.attendance).toBeDefined();
    // 3 PRESENT + 1 LATE = 4 present, 1 ABSENT
    expect(result.attendance.present).toBe(4);
    expect(result.attendance.absent).toBe(1);
    expect(result.attendance.total).toBe(5);
  });

  it("returns config with schoolId", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.config).toBeDefined();
    expect(result.config.schoolId).toBe(schoolId);
  });

  it("returns school.logoUrl as signed URL", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.school.logoUrl).toBeDefined();
    expect(result.school.logoUrl).toMatch(/^https:\/\/cdn\.test\//);
  });

  it("returns school.motto", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.school.motto).toBe("Test Motto");
  });

  it("returns school.principalSignatureUrl as signed URL", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.school.principalSignatureUrl).toBeDefined();
    expect(result.school.principalSignatureUrl).toMatch(/^https:\/\/cdn\.test\//);
  });

  it("preserves existing fields (scores, position, gradeKey, verificationCode)", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.average).toBe(80);
    expect(result.position).toBe(1);
    expect(result.entries).toBeDefined();
    expect(result.gradeKey).toBeDefined();
    expect(result.verificationCode).toBeDefined();
  });

  it("returns mode:standard for a non-EY class", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );
    expect((result as any).mode).toBe("standard");
  });

  it("standard mode skills only contain conduct kind domains", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;
    expect(Array.isArray(result.skills)).toBe(true);
    // The early_years leak-test domain seeded in beforeAll must NOT appear here,
    // proving the kind:"conduct" filter is actually operative.
    const leakDomain = result.skills.find((d: { domain: string }) =>
      d.domain.includes("EY-Domain-leak-test"),
    );
    expect(leakDomain).toBeUndefined();
  });
});

describe("ReportCardService – EY mode", () => {
  let service: ReportCardService;
  let schoolId: string;
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = Date.now();

    // 1. School
    const school = await prisma.school.create({
      data: {
        name: `EY-Test-${ts}`,
        slug: `ey-test-${ts}`,
        logoUrl: "schools/ey-logo.png",
        principalSignatureUrl: "schools/ey-sig.png",
        motto: "EY Motto",
      } as never,
    });
    schoolId = school.id;

    // 2. AcademicYear + Term
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `EY-2025/2026-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    // 3. EY ClassLevel (isEarlyYears=true) + Class
    const level = await prisma.classLevel.create({
      data: { schoolId, name: `Nursery-${ts}`, order: 0, isEarlyYears: true },
    });
    const klass = await prisma.class.create({
      data: { schoolId, name: `Nursery 1-${ts}`, classLevelId: level.id },
    });

    // 4. Student
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `EY-${ts}`,
        firstName: "Early",
        lastName: "Years",
        gender: "MALE",
        dateOfBirth: new Date("2020-01-01"),
      },
    });
    studentId = student.id;

    // 5. Enrollment — NO ResultSheet for EY
    await prisma.enrollment.create({
      data: { studentId, classId: klass.id, termId },
    });

    // 6. Person for recordedBy
    const person = await prisma.person.create({ data: {} });

    // 7. EY SkillDomains (kind="early_years") + SkillItems
    const domain1 = await prisma.skillDomain.create({
      data: { schoolId, kind: "early_years", name: `Communication-${ts}`, order: 0 },
    });
    const domain2 = await prisma.skillDomain.create({
      data: { schoolId, kind: "early_years", name: `Physical-${ts}`, order: 1 },
    });

    const eyItem1 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain1.id, name: `Listening-${ts}`, order: 0 },
    });
    const eyItem2 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain1.id, name: `Speaking-${ts}`, order: 1 },
    });
    const eyItem3 = await prisma.skillItem.create({
      data: { schoolId, domainId: domain2.id, name: `Gross Motor-${ts}`, order: 0 },
    });

    // 8. SkillRatings for eyItem1 and eyItem3 — leave eyItem2 null (unrated)
    await prisma.skillRating.create({
      data: {
        schoolId,
        studentId,
        termId,
        skillItemId: eyItem1.id,
        value: 3,
        recordedBy: person.id,
      },
    });
    await prisma.skillRating.create({
      data: {
        schoolId,
        studentId,
        termId,
        skillItemId: eyItem3.id,
        value: 2,
        recordedBy: person.id,
      },
    });

    // 9. EY SkillScalePoints (kind="early_years")
    await prisma.skillScalePoint.create({
      data: { schoolId, kind: "early_years", value: 3, label: "Secure", order: 0 },
    });
    await prisma.skillScalePoint.create({
      data: { schoolId, kind: "early_years", value: 2, label: "Developing", order: 1 },
    });
    await prisma.skillScalePoint.create({
      data: { schoolId, kind: "early_years", value: 1, label: "Beginning", order: 2 },
    });

    // 10. TermRemark
    await prisma.termRemark.create({
      data: {
        schoolId,
        studentId,
        termId,
        formTeacherRemark: "Great progress in EY",
        principalRemark: "Well done",
      },
    });

    // 11. AttendanceRecords: 2 PRESENT, 1 ABSENT within term dates
    const makeDate = (d: number) => new Date(`2025-02-0${d}T00:00:00.000Z`);
    await prisma.attendanceRecord.createMany({
      data: [
        { schoolId, studentId, classId: klass.id, date: makeDate(1), status: "PRESENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(2), status: "PRESENT", recordedBy: person.id },
        { schoolId, studentId, classId: klass.id, date: makeDate(3), status: "ABSENT", recordedBy: person.id },
      ],
    });

    service = new ReportCardService(prisma as unknown as PrismaService, mockStorage as any);
  });

  it("returns mode:early_years", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );
    expect((result as any).mode).toBe("early_years");
  });

  it("has areas with items and ratings including EY labels", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(Array.isArray(result.areas)).toBe(true);
    expect(result.areas.length).toBeGreaterThanOrEqual(2);

    // First area: Communication
    const comm = result.areas[0];
    expect(comm.area).toMatch(/Communication/);
    expect(Array.isArray(comm.items)).toBe(true);

    // eyItem1 rated=3 → label "Secure"
    const ratedItem = comm.items.find((i: any) => i.rating !== null);
    expect(ratedItem).toBeDefined();
    expect(ratedItem.rating.value).toBe(3);
    expect(ratedItem.rating.label).toBe("Secure");

    // eyItem2 unrated → rating null
    const unratedItem = comm.items.find((i: any) => i.rating === null);
    expect(unratedItem).toBeDefined();
  });

  it("unrated EY item has rating:null", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    const comm = result.areas[0];
    const unrated = comm.items.find((i: any) => i.rating === null);
    expect(unrated).toBeDefined();
    expect(unrated.rating).toBeNull();
  });

  it("has scaleKey from EY scale points", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(Array.isArray(result.scaleKey)).toBe(true);
    expect(result.scaleKey.length).toBe(3);

    const secure = result.scaleKey.find((p: any) => p.value === 3);
    expect(secure?.label).toBe("Secure");

    const developing = result.scaleKey.find((p: any) => p.value === 2);
    expect(developing?.label).toBe("Developing");
  });

  it("has narrative (formTeacher and principal)", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(result.narrative).toBeDefined();
    expect(result.narrative.formTeacher).toBe("Great progress in EY");
    expect(result.narrative.principal).toBe("Well done");
  });

  it("has attendance counts", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(result.attendance).toBeDefined();
    expect(result.attendance.present).toBe(2);
    expect(result.attendance.absent).toBe(1);
    expect(result.attendance.total).toBe(3);
  });

  it("has no entries, average, position, gradeKey, verificationCode, skills, config", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(result.entries).toBeUndefined();
    expect(result.average).toBeUndefined();
    expect(result.position).toBeUndefined();
    expect(result.gradeKey).toBeUndefined();
    expect(result.verificationCode).toBeUndefined();
    expect(result.skills).toBeUndefined();
    expect(result.config).toBeUndefined();
  });

  it("has student, class, term, school fields", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ) as any;

    expect(result.student).toBeDefined();
    expect(result.student.name).toBe("Early Years");
    expect(result.student.admissionNo).toBeDefined();
    expect(result.class).toBeDefined();
    expect(result.class.name).toMatch(/Nursery/);
    expect(result.term).toBeDefined();
    expect(result.term.label).toBeDefined();
    expect(result.school).toBeDefined();
    expect(result.school.name).toMatch(/EY-Test/);
  });
});

describe("ReportCardService – subjectGroups by category", () => {
  let service: ReportCardService;
  let schoolId: string;
  let termId: string;
  let studentId: string;

  beforeAll(async () => {
    const ts = `sg${Date.now()}`;

    // School
    const school = await prisma.school.create({
      data: {
        name: `RC-SG-${ts}`,
        slug: `rc-sg-${ts}`,
      } as never,
    });
    schoolId = school.id;

    // AcademicYear + Term
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        name: `AY-${ts}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      },
    });
    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        number: 1,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    termId = term.id;

    // ClassLevel + Class
    const level = await prisma.classLevel.create({
      data: { schoolId, name: `JSS-SG-${ts}`, order: 0 },
    });
    const klass = await prisma.class.create({
      data: { schoolId, name: `JSS-SG-1A-${ts}`, classLevelId: level.id },
    });

    // Student
    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNo: `SG-${ts}`,
        firstName: "Cat",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
      },
    });
    studentId = student.id;

    // Enrollment
    await prisma.enrollment.create({
      data: { studentId, classId: klass.id, termId },
    });

    // AssessmentType
    await prisma.assessmentType.create({
      data: { schoolId, name: `CA-SG-${ts}`, maxScore: 100, order: 0 },
    });

    // Two categories (order matters: Sciences=0, Languages=1) + subjects under each + 1 uncategorised
    const catSciences = await prisma.subjectCategory.create({
      data: { schoolId, name: `Sciences-${ts}`, order: 0 },
    });
    const catLanguages = await prisma.subjectCategory.create({
      data: { schoolId, name: `Languages-${ts}`, order: 1 },
    });

    const subMaths = await prisma.subject.create({
      data: { schoolId, name: `Maths-${ts}`, code: `MTH-${ts}`, categoryId: catSciences.id },
    });
    const subPhysics = await prisma.subject.create({
      data: { schoolId, name: `Physics-${ts}`, code: `PHY-${ts}`, categoryId: catSciences.id },
    });
    const subEnglish = await prisma.subject.create({
      data: { schoolId, name: `English-${ts}`, code: `ENG-${ts}`, categoryId: catLanguages.id },
    });
    const subPE = await prisma.subject.create({
      data: { schoolId, name: `PE-${ts}`, code: `PE-${ts}` }, // no category
    });

    // Person + Release
    const person = await prisma.person.create({ data: {} });
    const release = await prisma.release.create({
      data: {
        schoolId,
        classId: klass.id,
        termId,
        releasedBy: person.id,
        releasedAt: new Date(),
      },
    });

    // ResultSheet + entries for all 4 subjects
    const sheet = await prisma.resultSheet.create({
      data: {
        schoolId,
        releaseId: release.id,
        studentId,
        classId: klass.id,
        termId,
        average: 75,
        position: 2,
      },
    });
    await prisma.resultSheetEntry.createMany({
      data: [
        { schoolId, resultSheetId: sheet.id, subjectId: subMaths.id, total: 90, grade: "A" },
        { schoolId, resultSheetId: sheet.id, subjectId: subPhysics.id, total: 85, grade: "A" },
        { schoolId, resultSheetId: sheet.id, subjectId: subEnglish.id, total: 70, grade: "B" },
        { schoolId, resultSheetId: sheet.id, subjectId: subPE.id, total: 60, grade: "C" },
      ],
    });

    service = new ReportCardService(prisma as unknown as PrismaService, mockStorage as any);
  });

  it("includes subjectGroups with 2 named category groups ordered by category.order + null group last", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.subjectGroups).toBeDefined();
    expect(result.subjectGroups.length).toBe(3);

    // First group: Sciences (order 0)
    expect(result.subjectGroups[0]!.category).toMatch(/Sciences/);
    expect(result.subjectGroups[0]!.subjects.length).toBe(2);

    // Second group: Languages (order 1)
    expect(result.subjectGroups[1]!.category).toMatch(/Languages/);
    expect(result.subjectGroups[1]!.subjects.length).toBe(1);

    // Third group: uncategorised (null)
    expect(result.subjectGroups[2]!.category).toBeNull();
    expect(result.subjectGroups[2]!.subjects.length).toBe(1);
  });

  it("each subjectGroup entry has the same shape as entries (subjectId, subjectName, total, grade)", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    const allGrouped = result.subjectGroups.flatMap((g: { subjects: unknown[] }) => g.subjects);
    expect(allGrouped.length).toBe(4);

    for (const entry of allGrouped) {
      expect(entry).toHaveProperty("subjectId");
      expect(entry).toHaveProperty("subjectName");
      expect(entry).toHaveProperty("total");
      expect(entry).toHaveProperty("grade");
    }
  });

  it("keeps the flat entries array present (backward-compat)", async () => {
    const result = asStandard(await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    ));

    expect(result.entries).toBeDefined();
    expect(result.entries.length).toBe(4);
  });
});
