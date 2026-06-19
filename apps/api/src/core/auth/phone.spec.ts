import { normalizePhone, phoneMatchVariants } from "./phone";

describe("normalizePhone", () => {
  it("canonicalises Nigerian 0-prefixed local numbers to +234", () => {
    expect(normalizePhone("08012345678")).toBe("+2348012345678");
    expect(normalizePhone("0801 234 5678")).toBe("+2348012345678");
    expect(normalizePhone("0801-234-5678")).toBe("+2348012345678");
  });

  it("canonicalises 234-prefixed (no +) to +234", () => {
    expect(normalizePhone("2348012345678")).toBe("+2348012345678");
  });

  it("leaves already-international numbers untouched (separators stripped)", () => {
    expect(normalizePhone("+2348012345678")).toBe("+2348012345678");
    expect(normalizePhone("+234 801 234 5678")).toBe("+2348012345678");
  });

  it("leaves ambiguous/non-NG input as cleaned digits", () => {
    expect(normalizePhone("8012345678")).toBe("8012345678");
  });
});

describe("phoneMatchVariants", () => {
  it("includes local, bare, and + forms for a +234 number", () => {
    const v = phoneMatchVariants("+2348012345678");
    expect(v).toEqual(
      expect.arrayContaining(["+2348012345678", "2348012345678", "08012345678", "8012345678"]),
    );
  });
});
