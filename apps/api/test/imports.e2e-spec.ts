import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { ImportsService } from "../src/modules/imports/imports.service";
import type { StudentImportRow } from "../src/modules/imports/students-import";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Bulk import queue (BullMQ worker)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let imports: ImportsService;
  const s = Date.now();
  let schoolId: string;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    await app.init(); // starts the BullMQ worker
    prisma = ref.get(PrismaService);
    imports = ref.get(ImportsService);
    const school = await prisma.school.create({ data: { name: "Q", slug: `q-${s}` } });
    schoolId = school.id;
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await app.close(); // closes worker + redis connections
  });

  it("processes an enqueued batch end-to-end and reports the result", async () => {
    const rows: StudentImportRow[] = [
      { admissionNo: `Q-1-${s}`, firstName: "Tunde", lastName: "Ade", gender: "M", dateOfBirth: "2011-05-05" },
      { admissionNo: `Q-2-${s}`, firstName: "Bisi", lastName: "Cole", gender: "F", dateOfBirth: "2012-06-06" },
      { admissionNo: `Q-3-${s}`, firstName: "Bad", lastName: "Row", gender: "?", dateOfBirth: "2011-01-01" },
    ];

    const { jobId } = await imports.enqueueStudents(rows, schoolId, "importer");
    expect(jobId).toBeTruthy();

    let status = await imports.status(jobId!);
    for (let i = 0; i < 80 && status?.state !== "completed" && status?.state !== "failed"; i++) {
      await sleep(250);
      status = await imports.status(jobId!);
    }

    expect(status?.state).toBe("completed");
    expect(status?.result).toMatchObject({ total: 3, imported: 2, failed: 1 });

    const count = await prisma.student.count({ where: { schoolId } });
    expect(count).toBe(2);
  }, 30000);
});
