import { TenantContext } from "./tenant.context";

describe("TenantContext", () => {
  it("returns null outside a run", () => {
    expect(TenantContext.current()).toBeNull();
  });

  it("propagates schoolId within run()", async () => {
    const result = await TenantContext.run({ schoolId: "school-1", userId: "u1" }, async () =>
      TenantContext.current(),
    );
    expect(result).toEqual({ schoolId: "school-1", userId: "u1" });
  });

  it("isolates concurrent runs", async () => {
    const [a, b] = await Promise.all([
      TenantContext.run({ schoolId: "A", userId: "ua" }, async () => TenantContext.current()),
      TenantContext.run({ schoolId: "B", userId: "ub" }, async () => TenantContext.current()),
    ]);
    expect(a?.schoolId).toBe("A");
    expect(b?.schoolId).toBe("B");
  });

  it("schoolIdOrThrow throws when absent", () => {
    expect(() => TenantContext.schoolIdOrThrow()).toThrow();
  });
});
