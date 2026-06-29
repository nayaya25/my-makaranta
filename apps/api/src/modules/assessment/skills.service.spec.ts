import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SkillsService } from "./skills.service";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("SkillsService", () => {
  let service: SkillsService;
  let schoolId: string;

  beforeAll(async () => {
    const school = await prisma.school.create({ data: { name: "SkillsSvcTest", slug: `skills-svc-${Date.now()}` } as never });
    schoolId = school.id;
    await seedSkillDefaults(prisma, schoolId);
    service = new SkillsService(prisma as unknown as PrismaService);
  });

  it("listConfig returns 2 domains with ordered items + 5 scale points after seedSkillDefaults", async () => {
    const result = await TenantContext.run({ schoolId, userId: null }, async () => service.listConfig());

    expect(result.domains).toHaveLength(2);
    expect(result.scale).toHaveLength(5);

    // Domains are ordered
    expect(result.domains[0]!.name).toBe("Affective");
    expect(result.domains[1]!.name).toBe("Psychomotor");

    // Items are nested under domains
    expect(result.domains[0]!.items.length).toBeGreaterThan(0);
    expect(result.domains[1]!.items.length).toBeGreaterThan(0);

    // Scale points ordered
    expect(result.scale[0]!.value).toBe(5);
    expect(result.scale[4]!.value).toBe(1);
  });

  it("createDomain adds a new domain scoped to the school", async () => {
    const domain = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.createDomain({ name: "Cognitive", order: 2 }),
    );
    expect(domain.name).toBe("Cognitive");
    expect(domain.schoolId).toBe(schoolId);
  });

  it("updateDomain renames a domain", async () => {
    const domain = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.createDomain({ name: "TempDomain", order: 99 }),
    );
    const updated = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.updateDomain(domain.id, { name: "RenamedDomain" }),
    );
    expect(updated!.name).toBe("RenamedDomain");
  });

  it("deleteDomain removes the domain", async () => {
    const domain = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.createDomain({ name: "DeleteMe", order: 100 }),
    );
    await TenantContext.run({ schoolId, userId: null }, async () =>
      service.deleteDomain(domain.id),
    );
    const found = await prisma.skillDomain.findFirst({ where: { id: domain.id } });
    expect(found).toBeNull();
  });

  it("createItem adds item under the correct domain", async () => {
    const config = await TenantContext.run({ schoolId, userId: null }, async () => service.listConfig());
    const domainId = config.domains[0]!.id;
    const item = await TenantContext.run({ schoolId, userId: null }, async () =>
      service.createItem({ domainId, name: "Responsibility", order: 99 }),
    );
    expect(item.domainId).toBe(domainId);
    expect(item.schoolId).toBe(schoolId);
  });

  it("getScale returns 5 points ordered", async () => {
    const scale = await TenantContext.run({ schoolId, userId: null }, async () => service.getScale());
    expect(scale).toHaveLength(5);
    expect(scale[0]!.value).toBe(5);
  });

  it("setScale replaces all scale points", async () => {
    const newPoints = [
      { value: 3, label: "High" },
      { value: 2, label: "Mid" },
      { value: 1, label: "Low" },
    ];
    const scale = await TenantContext.run({ schoolId, userId: null }, async () => service.setScale(newPoints));
    expect(scale).toHaveLength(3);
    expect(scale[0]!.label).toBe("High");
  });
});
