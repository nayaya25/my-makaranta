/**
 * Unit tests: Africa/Lagos (UTC+1, no DST) date-only helpers (EN-1 Task 2)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest notify-date --runInBand
 */
import { lagosDateStr, shiftDateStr, sameLagosDay } from "./notify-date.util";

describe("lagosDateStr", () => {
  it("rolls over to the next day for a late-UTC timestamp (UTC+1)", () => {
    expect(lagosDateStr(new Date("2026-07-06T23:30:00Z"))).toBe("2026-07-07");
  });

  it("does not roll over for an early-UTC timestamp", () => {
    expect(lagosDateStr(new Date("2026-07-06T10:00:00Z"))).toBe("2026-07-06");
  });

  it("rolls over exactly at 23:00 UTC (23:00 UTC == 00:00 Lagos next day)", () => {
    expect(lagosDateStr(new Date("2026-07-06T23:00:00Z"))).toBe("2026-07-07");
  });

  it("stays on the same day just before 23:00 UTC", () => {
    expect(lagosDateStr(new Date("2026-07-06T22:59:59Z"))).toBe("2026-07-06");
  });
});

describe("shiftDateStr", () => {
  it("shifts backward by 3 days", () => {
    expect(shiftDateStr("2026-07-06", -3)).toBe("2026-07-03");
  });

  it("shifts forward by 3 days", () => {
    expect(shiftDateStr("2026-07-06", 3)).toBe("2026-07-09");
  });

  it("returns the same date for a zero shift", () => {
    expect(shiftDateStr("2026-07-06", 0)).toBe("2026-07-06");
  });

  it("crosses a month boundary", () => {
    expect(shiftDateStr("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("sameLagosDay", () => {
  it("returns true for two timestamps on the same Lagos calendar day", () => {
    const a = new Date("2026-07-06T22:00:00Z");
    const b = new Date("2026-07-06T00:00:00Z");
    expect(sameLagosDay(a, b)).toBe(true);
  });

  it("returns false when a UTC-late timestamp rolls into the next Lagos day", () => {
    const a = new Date("2026-07-06T23:30:00Z"); // Lagos 2026-07-07
    const b = new Date("2026-07-06T10:00:00Z"); // Lagos 2026-07-06
    expect(sameLagosDay(a, b)).toBe(false);
  });
});
