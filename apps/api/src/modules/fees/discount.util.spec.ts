import { computeDiscount, type DiscountInput } from "./discount.util";

describe("computeDiscount", () => {
  it("single PERCENT 50 on gross 100000 → 50000", () => {
    const schemes: DiscountInput[] = [{ id: "s1", name: "Sibling", method: "PERCENT", value: 50 }];
    const r = computeDiscount(100000, schemes);
    expect(r.discountKobo).toBe(50000);
    expect(r.breakdown).toEqual([{ schemeId: "s1", name: "Sibling", amountKobo: 50000 }]);
  });

  it("single FIXED 20000 on gross 100000 → 20000", () => {
    const schemes: DiscountInput[] = [{ id: "s1", name: "Bursary", method: "FIXED", value: 20000 }];
    const r = computeDiscount(100000, schemes);
    expect(r.discountKobo).toBe(20000);
    expect(r.breakdown).toEqual([{ schemeId: "s1", name: "Bursary", amountKobo: 20000 }]);
  });

  it("stacked [PERCENT 50, PERCENT 20, FIXED 20000] on 100000 → 90000 with 3 rows", () => {
    const schemes: DiscountInput[] = [
      { id: "p1", name: "Percent50", method: "PERCENT", value: 50 },
      { id: "p2", name: "Percent20", method: "PERCENT", value: 20 },
      { id: "f1", name: "Fixed20000", method: "FIXED", value: 20000 },
    ];
    const r = computeDiscount(100000, schemes);
    expect(r.discountKobo).toBe(90000);
    expect(r.breakdown).toEqual([
      { schemeId: "p1", name: "Percent50", amountKobo: 50000 },
      { schemeId: "p2", name: "Percent20", amountKobo: 20000 },
      { schemeId: "f1", name: "Fixed20000", amountKobo: 20000 },
    ]);
    expect(r.breakdown.reduce((sum, b) => sum + b.amountKobo, 0)).toBe(r.discountKobo);
  });

  it("clamp [PERCENT 80, FIXED 50000] on 100000 → 100000 (net 0)", () => {
    const schemes: DiscountInput[] = [
      { id: "p1", name: "Percent80", method: "PERCENT", value: 80 },
      { id: "f1", name: "Fixed50000", method: "FIXED", value: 50000 },
    ];
    const r = computeDiscount(100000, schemes);
    expect(r.discountKobo).toBe(100000);
    expect(r.breakdown).toEqual([
      { schemeId: "p1", name: "Percent80", amountKobo: 80000 },
      { schemeId: "f1", name: "Fixed50000", amountKobo: 20000 },
    ]);
    const net = 100000 - r.discountKobo;
    expect(net).toBe(0);
  });

  it("empty schemes → 0, []", () => {
    const r = computeDiscount(100000, []);
    expect(r.discountKobo).toBe(0);
    expect(r.breakdown).toEqual([]);
  });

  it("PERCENT floor: gross 999, PERCENT 33 → floor(329.67)=329", () => {
    const schemes: DiscountInput[] = [{ id: "s1", name: "Odd", method: "PERCENT", value: 33 }];
    const r = computeDiscount(999, schemes);
    expect(r.discountKobo).toBe(329);
    expect(r.breakdown).toEqual([{ schemeId: "s1", name: "Odd", amountKobo: 329 }]);
  });
});
