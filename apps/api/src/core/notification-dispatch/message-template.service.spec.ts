/**
 * Engagement EN-3b Task 2 — MessageTemplateService
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest message-template.service --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MessageTemplateService } from "./message-template.service";

const rawPrisma = new PrismaClient();
const prisma = rawPrisma as unknown as PrismaService;

async function seedSchool(suffix: string): Promise<string> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const school = await rawPrisma.school.create({
    data: { name: `MT-${suffix}-${ts}`, slug: `mt-${suffix}-${ts}-${Math.random().toString(36).slice(2)}` } as never,
  });
  return school.id;
}

async function cleanupSchool(schoolId: string): Promise<void> {
  await rawPrisma.messageTemplate.deleteMany({ where: { schoolId } }).catch(() => undefined);
  await rawPrisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
}

let service: MessageTemplateService;
const schoolIds: string[] = [];

beforeAll(() => {
  service = new MessageTemplateService(prisma);
});

afterAll(async () => {
  for (const id of schoolIds) await cleanupSchool(id);
  await rawPrisma.$disconnect();
});

describe("MessageTemplateService.render", () => {
  it("renders the code default when no override row exists", async () => {
    const schoolId = await seedSchool("no-override");
    schoolIds.push(schoolId);

    const rendered = await service.render(schoolId, "RESULTS_READY", { studentName: "Ada" });
    expect(rendered).toBe("Dear Parent, Ada's results are now ready. Please log in to view the report card.");
  });

  it("renders the custom body after set()", async () => {
    const schoolId = await seedSchool("custom-render");
    schoolIds.push(schoolId);

    await service.set(schoolId, "RESULTS_READY", "Hello {{studentName}}");
    const rendered = await service.render(schoolId, "RESULTS_READY", { studentName: "Ada" });
    expect(rendered).toBe("Hello Ada");
  });
});

describe("MessageTemplateService.set", () => {
  it("throws BadRequestException for a body referencing an unknown variable, without persisting", async () => {
    const schoolId = await seedSchool("bad-var");
    schoolIds.push(schoolId);

    await expect(service.set(schoolId, "RESULTS_READY", "{{amount}}")).rejects.toThrow(BadRequestException);

    const rows = await rawPrisma.messageTemplate.findMany({ where: { schoolId, key: "RESULTS_READY" } });
    expect(rows).toHaveLength(0);
  });
});

describe("MessageTemplateService.reset", () => {
  it("reverts a customized template back to the code default", async () => {
    const schoolId = await seedSchool("reset");
    schoolIds.push(schoolId);

    await service.set(schoolId, "RESULTS_READY", "Custom {{studentName}}");
    await service.reset(schoolId, "RESULTS_READY");

    const rendered = await service.render(schoolId, "RESULTS_READY", { studentName: "Ada" });
    expect(rendered).toBe("Dear Parent, Ada's results are now ready. Please log in to view the report card.");
  });
});

describe("MessageTemplateService.list", () => {
  it("returns all 3 keys, with isCustomized reflecting overrides", async () => {
    const schoolId = await seedSchool("list");
    schoolIds.push(schoolId);

    await service.set(schoolId, "RESULTS_READY", "Custom {{studentName}}");

    const list = await service.list(schoolId);
    expect(list).toHaveLength(3);

    const keys = list.map((t) => t.key).sort();
    expect(keys).toEqual(["FEE_BALANCE_REMINDER", "FEE_INSTALLMENT_REMINDER", "RESULTS_READY"].sort());

    const resultsReady = list.find((t) => t.key === "RESULTS_READY")!;
    expect(resultsReady.isCustomized).toBe(true);
    expect(resultsReady.body).toBe("Custom {{studentName}}");
    expect(resultsReady.allowedVariables).toEqual(["studentName"]);
    expect(resultsReady.defaultBody).toBe(
      "Dear Parent, {{studentName}}'s results are now ready. Please log in to view the report card.",
    );

    const feeInstallment = list.find((t) => t.key === "FEE_INSTALLMENT_REMINDER")!;
    expect(feeInstallment.isCustomized).toBe(false);
    expect(feeInstallment.body).toBe(feeInstallment.defaultBody);
  });
});

describe("MessageTemplateService schoolId scoping", () => {
  it("a customization in one school does not affect another", async () => {
    const schoolA = await seedSchool("scope-a");
    const schoolB = await seedSchool("scope-b");
    schoolIds.push(schoolA, schoolB);

    await service.set(schoolA, "RESULTS_READY", "A-only {{studentName}}");

    const renderedB = await service.render(schoolB, "RESULTS_READY", { studentName: "Ada" });
    expect(renderedB).toBe("Dear Parent, Ada's results are now ready. Please log in to view the report card.");

    const listB = await service.list(schoolB);
    expect(listB.find((t) => t.key === "RESULTS_READY")!.isCustomized).toBe(false);
  });
});
