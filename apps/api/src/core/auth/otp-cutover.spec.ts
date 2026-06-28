/**
 * Task 1 (P4): OTP verify issues a Person JWT with legacy fallback.
 *
 * Stubbing strategy mirrors password-login.spec.ts — no DB, no HTTP, no real bcrypt for the
 * OTP itself (we intercept at the Prisma layer).  JwtService uses a test secret so we can
 * decode and assert the payload shape.
 */
import * as bcryptLib from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

const CODE = "123456";

/** Build a minimal Prisma mock that simulates a successful OTP verify path. */
function buildPrisma(
  userOverride: Record<string, unknown> = {},
  linkResult?: Record<string, unknown>,
) {
  const baseUser = {
    id: "user-1",
    phone: "+2348012345678",
    email: null,
    schoolId: "school-1",
    identityType: "STAFF",
    identityId: "staff-1",
    tokenVersion: 1,
    ...userOverride,
  };
  const linkedUser = linkResult ?? baseUser;
  return {
    otpRequest: {
      findFirst: jest.fn().mockResolvedValue({
        id: "otp-1",
        codeHash: bcryptLib.hashSync(CODE, 10),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(baseUser),
      create: jest.fn().mockResolvedValue(baseUser),
      update: jest.fn().mockResolvedValue({}),
    },
    person: {
      update: jest.fn().mockResolvedValue({}),
    },
    // linkIdentityIfMatch checks identityType; if it's not PENDING it returns immediately
    parent: { findMany: jest.fn().mockResolvedValue([]) },
    staff: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
}

describe("AuthService.verifyOtp — Person JWT cutover (P4)", () => {
  const jwt = new JwtService({ secret: "test-p4" });
  const pwd = new PasswordService();

  // ─── scenario A: phone maps to a Person + Membership ──────────────────────
  it("issues a Person-shape JWT when identity.resolvePerson returns a match", async () => {
    const prisma = buildPrisma();

    const identity = {
      resolvePerson: jest.fn().mockResolvedValue({
        person: { id: "person-1", tokenVersion: 2, firstName: "Ada", lastName: "Obi" },
        membership: { id: "mbr-1", schoolId: "school-1" },
      }),
      deriveAuthz: jest.fn().mockResolvedValue({
        roles: ["teacher"],
        perms: ["students.view"],
      }),
    };

    const svc = new AuthService(
      prisma,
      /* sms */ {} as never,
      jwt,
      /* email */ {} as never,
      pwd,
      identity as never,
    );

    const result = await svc.verifyOtp("+2348012345678", CODE);
    const decoded = jwt.verify(result.token) as Record<string, unknown>;

    expect(decoded.sub).toBe("person-1");
    expect(decoded.mbr).toBe("mbr-1");
    expect(decoded.sch).toBe("school-1");
    expect(decoded.roles).toEqual(["teacher"]);
    expect(decoded.perms).toEqual(["students.view"]);
    expect(decoded.tv).toBe(2);
    // Must NOT carry legacy identityType field
    expect(decoded.identityType).toBeUndefined();

    expect(identity.resolvePerson).toHaveBeenCalledWith("school-1", "+2348012345678");
    expect(identity.deriveAuthz).toHaveBeenCalledWith("mbr-1");
  });

  // ─── scenario B: phone has NO Person/Membership — legacy fallback ──────────
  it("issues the legacy JWT shape when identity.resolvePerson returns null", async () => {
    const prisma = buildPrisma();

    const identity = {
      resolvePerson: jest.fn().mockResolvedValue(null),
      deriveAuthz: jest.fn(),
    };

    const svc = new AuthService(
      prisma,
      {} as never,
      jwt,
      {} as never,
      pwd,
      identity as never,
    );

    const result = await svc.verifyOtp("+2348012345678", CODE);
    const decoded = jwt.verify(result.token) as Record<string, unknown>;

    // Legacy shape MUST carry identityType and sub == user.id
    expect(decoded.sub).toBe("user-1");
    expect(decoded.identityType).toBe("STAFF");
    // Person-shape fields must be absent
    expect(decoded.mbr).toBeUndefined();
    expect(decoded.roles).toBeUndefined();
    expect(decoded.perms).toBeUndefined();

    expect(identity.resolvePerson).toHaveBeenCalledWith("school-1", "+2348012345678");
    expect(identity.deriveAuthz).not.toHaveBeenCalled();
  });

  // ─── scenario C: PENDING user (no schoolId yet) — resolvePerson NOT called ─
  it("skips resolvePerson and issues legacy JWT when user has no schoolId", async () => {
    const pendingUser = {
      id: "user-pending",
      phone: "+2348099999999",
      email: null,
      schoolId: null,
      identityType: "PENDING",
      identityId: "",
      tokenVersion: 0,
    };
    const prisma = buildPrisma(pendingUser);

    const identity = {
      resolvePerson: jest.fn().mockResolvedValue(null),
      deriveAuthz: jest.fn(),
    };

    const svc = new AuthService(
      prisma,
      {} as never,
      jwt,
      {} as never,
      pwd,
      identity as never,
    );

    const result = await svc.verifyOtp("+2348099999999", CODE);
    const decoded = jwt.verify(result.token) as Record<string, unknown>;

    // Still legacy shape, no crash
    expect(decoded.sub).toBe("user-pending");
    expect(decoded.identityType).toBe("PENDING");
    expect(decoded.mbr).toBeUndefined();
    // resolvePerson should not be called with a null schoolId
    expect(identity.resolvePerson).not.toHaveBeenCalled();
  });
});
