import { generateVerificationCode } from "./verification.util";

describe("generateVerificationCode", () => {
  it("returns a 16-char code from the unambiguous alphabet", () => {
    const c = generateVerificationCode();
    expect(c).toHaveLength(16);
    expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it("returns distinct codes across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateVerificationCode()));
    expect(seen.size).toBe(50);
  });
});
