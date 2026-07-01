import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ReportCardService } from "./report-card.service";

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

    // 11. SkillDomain x2 (ordered), SkillItem per domain (ordered)
    const domain1 = await prisma.skillDomain.create({
      data: { schoolId, name: `Affective-${ts}`, order: 0 },
    });
    const domain2 = await prisma.skillDomain.create({
      data: { schoolId, name: `Psychomotor-${ts}`, order: 1 },
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
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

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
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

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
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

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
    const result = await TenantContext.run({ schoolId, userId: null }, () =>
      service.getReportCard(studentId, termId),
    );

    expect(result.average).toBe(80);
    expect(result.position).toBe(1);
    expect(result.entries).toBeDefined();
    expect(result.gradeKey).toBeDefined();
    expect(result.verificationCode).toBeDefined();
  });
});
