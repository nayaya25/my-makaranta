import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

const mockPrisma = {
  person: { update: jest.fn().mockResolvedValue({}) },
} as never;

describe("AuthService.loginWithPassword", () => {
  const jwt = new JwtService({ secret: "test" });
  const pwd = new PasswordService();

  it("issues a JWT with roles+perms on valid password", async () => {
    const hash = await pwd.hash("Str0ng!pass");
    const identity = {
      resolvePerson: async () => ({
        person: { id: "p1", passwordHash: hash, tokenVersion: 0, firstName: "A", lastName: "B" },
        membership: { id: "m1", schoolId: "s1" },
      }),
      deriveAuthz: async () => ({ roles: ["teacher"], perms: ["students.view"] }),
    };
    const svc = new AuthService(
      mockPrisma,
      /* sms */ {} as never,
      jwt,
      /* email */ {} as never,
      pwd,
      identity as never,
    );
    const res = await svc.loginWithPassword("s1", "a@b.io", "Str0ng!pass");
    const decoded = jwt.verify(res.token) as Record<string, unknown>;
    expect(decoded.sub).toBe("p1");
    expect(decoded.mbr).toBe("m1");
    expect(decoded.roles).toEqual(["teacher"]);
    expect(decoded.perms).toEqual(["students.view"]);
  });

  it("rejects a wrong password with a generic error", async () => {
    const identity = {
      resolvePerson: async () => ({
        person: { id: "p1", passwordHash: await pwd.hash("right"), tokenVersion: 0, firstName: "A", lastName: "B" },
        membership: { id: "m1", schoolId: "s1" },
      }),
      deriveAuthz: async () => ({ roles: [], perms: [] }),
    };
    const svc = new AuthService(
      {} as never,
      {} as never,
      jwt,
      {} as never,
      pwd,
      identity as never,
    );
    await expect(svc.loginWithPassword("s1", "a@b.io", "wrong")).rejects.toThrow("Invalid credentials");
  });

  it("rejects when person not found", async () => {
    const identity = {
      resolvePerson: async () => null,
      deriveAuthz: async () => ({ roles: [], perms: [] }),
    };
    const svc = new AuthService(
      {} as never,
      {} as never,
      jwt,
      {} as never,
      pwd,
      identity as never,
    );
    await expect(svc.loginWithPassword("s1", "nobody@b.io", "any")).rejects.toThrow("Invalid credentials");
  });
});
