import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

describe("AuthService.switchContext", () => {
  const jwt = new JwtService({ secret: "test" });
  const pwd = new PasswordService();

  it("rejects switching to a membership not owned by the person", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = { membership: { findFirst } } as any;

    const svc = new AuthService(
      mockPrisma,
      /* sms */ {} as never,
      jwt,
      /* email */ {} as never,
      pwd,
      /* identity */ {} as never,
    );

    await expect(svc.switchContext("personA", "membershipOwnedByB")).rejects.toThrow(
      ForbiddenException,
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "membershipOwnedByB", personId: "personA" },
    });
  });

  it("re-issues a token for an owned membership with fresh roles/perms", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: "m1", schoolId: "s1", personId: "personA" }),
      },
      person: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "personA", tokenVersion: 2 }),
      },
    } as any;

    const identity = {
      deriveAuthz: jest.fn().mockResolvedValue({ roles: ["teacher"], perms: ["students.view"] }),
    };

    const svc = new AuthService(
      mockPrisma,
      /* sms */ {} as never,
      jwt,
      /* email */ {} as never,
      pwd,
      identity as never,
    );

    const result = await svc.switchContext("personA", "m1");

    expect(result).toHaveProperty("token");
    const decoded = jwt.verify(result.token) as Record<string, unknown>;
    expect(decoded.sub).toBe("personA");
    expect(decoded.mbr).toBe("m1");
    expect(decoded.sch).toBe("s1");
    expect(decoded.roles).toEqual(["teacher"]);
    expect(decoded.perms).toEqual(["students.view"]);
    expect(decoded.tv).toBe(2);
  });
});
