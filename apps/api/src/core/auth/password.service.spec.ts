// apps/api/src/core/auth/password.service.spec.ts
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const svc = new PasswordService();

  it("hashes and verifies", async () => {
    const h = await svc.hash("Str0ng!pass");
    expect(h).not.toBe("Str0ng!pass");
    expect(await svc.verify(h, "Str0ng!pass")).toBe(true);
    expect(await svc.verify(h, "wrong")).toBe(false);
  });

  describe("verifySafe", () => {
    it("returns false (no throw) when hash is null", async () => {
      await expect(svc.verifySafe(null, "x")).resolves.toBe(false);
    });

    it("returns false when hash is undefined", async () => {
      await expect(svc.verifySafe(undefined, "x")).resolves.toBe(false);
    });

    it("returns true for correct password", async () => {
      const h = await svc.hash("p");
      await expect(svc.verifySafe(h, "p")).resolves.toBe(true);
    });

    it("returns false for wrong password", async () => {
      const h = await svc.hash("p");
      await expect(svc.verifySafe(h, "wrong")).resolves.toBe(false);
    });
  });

  it("enforces policy", () => {
    expect(svc.validatePolicy("Str0ng!pass")).toBeNull();
    expect(svc.validatePolicy("weak")).toMatch(/8/);
    expect(svc.validatePolicy("alllowercase1!")).toMatch(/uppercase/i);
    expect(svc.validatePolicy("NOLOWER1!")).toMatch(/lowercase/i);
    expect(svc.validatePolicy("NoNumber!")).toMatch(/number/i);
    expect(svc.validatePolicy("NoSpecial1")).toMatch(/special/i);
  });
});
