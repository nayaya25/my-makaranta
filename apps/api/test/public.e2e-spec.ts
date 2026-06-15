import { Test } from "@nestjs/testing";
import type { INestApplicationContext } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { PublicService } from "../src/modules/public/public.service";

describe("public verification (no tenant context)", () => {
  let prisma: PrismaService;
  let pub: PublicService;
  let app: INestApplicationContext;
  const code = "ABCDEFGHJKMNPQRS";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await moduleRef.createNestApplication().init();
    prisma = moduleRef.get(PrismaService);
    pub = moduleRef.get(PublicService);
    const stamp = Date.now();
    const school = await prisma.school.create({ data: { name: "Verify Co", slug: `vc-${stamp}` } });
    const ay = await prisma.academicYear.create({ data: { schoolId: school.id, name: "2025/2026", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
    const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
    const lvl = await prisma.classLevel.create({ data: { schoolId: school.id, name: "L1", order: 1 } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, classLevelId: lvl.id, name: "C1" } });
    const stu = await prisma.student.create({ data: { schoolId: school.id, admissionNo: `A-${stamp}`, firstName: "Pub", lastName: "Verify", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
    await prisma.enrollment.create({ data: { studentId: stu.id, classId: klass.id, termId: term.id } });
    const rel = await prisma.release.create({ data: { schoolId: school.id, classId: klass.id, termId: term.id, releasedBy: "x" } });
    const rs = await prisma.resultSheet.create({ data: { schoolId: school.id, releaseId: rel.id, studentId: stu.id, classId: klass.id, termId: term.id, average: 77, position: 1 } });
    // Idempotent seed: these e2e specs share a persistent DB with no teardown, so a prior run may
    // already hold this fixed `code` (Verification.code is @unique). Clear it before re-seeding.
    await prisma.verification.deleteMany({ where: { code } });
    await prisma.verification.create({ data: { code, resultSheetId: rs.id, schoolId: school.id, studentName: "Pub Verify", className: "C1", termLabel: "2025/2026 · Term 1", schoolName: "Verify Co", average: 77, position: 1, issuedAt: new Date("2026-01-10") } });
  });

  afterAll(async () => { await app.close(); });

  it("returns minimal authenticity for a valid code (no tenant context)", async () => {
    const r = await pub.verify(code);
    expect(r.valid).toBe(true);
    expect(r).toMatchObject({ student: "Pub Verify", className: "C1", school: "Verify Co", average: 77, position: 1 });
    expect((r as Record<string, unknown>).entries).toBeUndefined();
  });

  it("returns valid:false for an unknown code", async () => {
    expect((await pub.verify("ZZZZZZZZZZZZZZZZ")).valid).toBe(false);
  });
});
