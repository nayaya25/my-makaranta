export type DiscountInput = { id: string; name: string; method: "PERCENT" | "FIXED"; value: number };
export type DiscountBreakdownItem = { schemeId: string; name: string; amountKobo: number };

/** Applies all PERCENT schemes first, then FIXED, each capped at the remaining gross.
 *  Per-scheme amounts sum exactly to discountKobo; net (gross − discountKobo) never goes below 0. */
export function computeDiscount(
  grossKobo: number,
  schemes: DiscountInput[],
): { discountKobo: number; breakdown: DiscountBreakdownItem[] } {
  const ordered = [
    ...schemes.filter((s) => s.method === "PERCENT"),
    ...schemes.filter((s) => s.method === "FIXED"),
  ];
  let remaining = grossKobo;
  const breakdown: DiscountBreakdownItem[] = [];
  for (const s of ordered) {
    if (remaining <= 0) break;
    const nominal = s.method === "PERCENT" ? Math.floor((grossKobo * s.value) / 100) : s.value;
    const applied = Math.max(0, Math.min(remaining, nominal));
    if (applied > 0) {
      breakdown.push({ schemeId: s.id, name: s.name, amountKobo: applied });
      remaining -= applied;
    }
  }
  return { discountKobo: grossKobo - remaining, breakdown };
}
