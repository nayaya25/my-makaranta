import { signFileToken, verifyFileToken } from "./file-signing";

describe("file-signing", () => {
  const key = "photos/school-1/student-1.png";

  it("verifies a freshly signed token", () => {
    const exp = Date.now() + 60_000;
    expect(verifyFileToken(key, exp, signFileToken(key, exp))).toBe(true);
  });

  it("rejects an expired token", () => {
    const exp = Date.now() - 1_000;
    expect(verifyFileToken(key, exp, signFileToken(key, exp))).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const exp = Date.now() + 60_000;
    expect(verifyFileToken(key, exp, "deadbeef")).toBe(false);
  });

  it("rejects a signature minted for a different key (no cross-file reuse)", () => {
    const exp = Date.now() + 60_000;
    const sigForOther = signFileToken("photos/school-2/other.png", exp);
    expect(verifyFileToken(key, exp, sigForOther)).toBe(false);
  });
});
