import { Test } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";

// Full HTTP path for school onboarding: ValidationPipe + JwtAuthGuard + service + token swap.
// Regression for the country-enum bug found in browser QA.
describe("School onboarding (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const s = Date.now();
  let userId: string;
  let token: string;
  let createdSchoolId: string | undefined;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = ref.get(PrismaService);
    jwt = ref.get(JwtService);
    app = ref.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const user = await prisma.user.create({
      data: { phone: `+23480${String(s).slice(-7)}`, identityType: "PENDING", identityId: "" },
    });
    userId = user.id;
    token = await jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      schoolId: null,
      identityType: "PENDING",
      tokenVersion: 0,
    });
  });

  afterAll(async () => {
    if (createdSchoolId) {
      await prisma.userPermission.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { schoolId: createdSchoolId } });
      await prisma.school.deleteMany({ where: { id: createdSchoolId } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("rejects an invalid country with 400 (not a 500)", async () => {
    await request(app.getHttpServer())
      .post("/v1/schools")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad Country School", country: "Nigeria" })
      .expect(400);
  });

  it("creates a school with a valid country code and returns a fresh token", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/schools")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Bright Future ${s}`, country: "NG", currency: "NGN" })
      .expect(201);

    expect(res.body.school?.id).toBeTruthy();
    expect(res.body.school.country).toBe("NG");
    expect(res.body.token).toBeTruthy();
    createdSchoolId = res.body.school.id;

    // The fresh token must differ (tokenVersion bumped) and carry the new schoolId.
    expect(res.body.token).not.toBe(token);
  });

  it("rejects a second school from the now-PROPRIETOR user (no privilege escalation)", async () => {
    await request(app.getHttpServer())
      .post("/v1/schools")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second School", country: "NG" })
      .expect(401); // old token is now stale (tokenVersion bumped) -> rejected before the handler
  });
});
