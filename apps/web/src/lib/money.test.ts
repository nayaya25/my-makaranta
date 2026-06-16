import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats NGN kobo as naira with thousands + 2dp", () => {
    expect(formatMoney(5000000, "NGN")).toBe("₦50,000.00");
  });
  it("formats zero", () => {
    expect(formatMoney(0, "NGN")).toBe("₦0.00");
  });
  it("falls back to the ISO code for unknown currencies", () => {
    expect(formatMoney(150000, "GHS")).toMatch(/^GH₵\s?1,500\.00$|^GHS\s?1,500\.00$/);
  });
});
