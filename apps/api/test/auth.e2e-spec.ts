import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { SmsService } from "../src/core/auth/sms.service";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // Unique base per run so re-runs never collide on the OTP rate limit or the unique-phone constraint.
  const base = `+23480${String(Date.now()).slice(-7)}`;
  const phones: string[] = [];
  const phone = (n: number) => {
    const p = `${base}${n}`;
    phones.push(p);
    return p;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (phones.length) {
      await prisma.otpRequest.deleteMany({ where: { phone: { in: phones } } });
      await prisma.user.deleteMany({ where: { phone: { in: phones } } });
    }
    await app.close();
  });

  it("POST /auth/otp/request creates an OTP and returns 204", async () => {
    await request(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ phone: phone(1) })
      .expect(204);
  });

  it("POST /auth/otp/request rejects a malformed phone", async () => {
    await request(app.getHttpServer()).post("/auth/otp/request").send({ phone: "abc" }).expect(400);
  });

  it("verify with the correct code returns a JWT + user", async () => {
    const p = phone(2);
    await request(app.getHttpServer()).post("/auth/otp/request").send({ phone: p }).expect(204);

    const sms = app.get(SmsService);
    const code = sms.lastCodeForTest(p);
    expect(code).toMatch(/^\d{6}$/);

    const res = await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ phone: p, code })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.phone).toBe(p);
  });

  it("verify with a wrong code returns 400", async () => {
    const p = phone(3);
    await request(app.getHttpServer()).post("/auth/otp/request").send({ phone: p }).expect(204);
    await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ phone: p, code: "000000" })
      .expect(400);
  });

  it("GET /me with a valid JWT returns the user", async () => {
    const p = phone(4);
    await request(app.getHttpServer()).post("/auth/otp/request").send({ phone: p }).expect(204);
    const sms = app.get(SmsService);
    const code = sms.lastCodeForTest(p)!;
    const { body } = await request(app.getHttpServer())
      .post("/auth/otp/verify")
      .send({ phone: p, code })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", `Bearer ${body.token}`)
      .expect(200);
    expect(me.body.phone).toBe(p);
  });

  it("GET /me without a JWT returns 401", async () => {
    await request(app.getHttpServer()).get("/me").expect(401);
  });

  it("requesting a new OTP invalidates the previous code", async () => {
    const p = phone(5);
    const server = app.getHttpServer();
    const sms = app.get(SmsService);

    await request(server).post("/auth/otp/request").send({ phone: p }).expect(204);
    const firstCode = sms.lastCodeForTest(p)!;

    await request(server).post("/auth/otp/request").send({ phone: p }).expect(204);
    const secondCode = sms.lastCodeForTest(p)!;

    // The superseded first code must no longer verify; the latest one must.
    await request(server).post("/auth/otp/verify").send({ phone: p, code: firstCode }).expect(400);
    await request(server).post("/auth/otp/verify").send({ phone: p, code: secondCode }).expect(200);
  });
});
