import { paletteVars, PALETTE_KEYS } from "./palettes";

it("returns brand vars for known keys and falls back to teal", () => {
  expect(PALETTE_KEYS).toContain("teal");
  expect(paletteVars("teal")["--brand-500"]).toMatch(/^#/);
  expect(paletteVars("nope")).toEqual(paletteVars("teal")); // fallback
});

it("teal palette mirrors tokens.ts colors.brand exactly", () => {
  const t = paletteVars("teal");
  expect(t["--brand-50"]).toBe("#DEF6F3");
  expect(t["--brand-100"]).toBe("#B1F0E7");
  expect(t["--brand-300"]).toBe("#51E0CD");
  expect(t["--brand-500"]).toBe("#066666");
  expect(t["--brand-700"]).toBe("#003D3D");
  expect(t["--brand-900"]).toBe("#002626");
});

it("PALETTE_KEYS has exactly the 8 curated keys", () => {
  const expected = ["teal", "emerald", "indigo", "violet", "rose", "amber", "slate", "sky"];
  expect(PALETTE_KEYS).toEqual(expected);
});

it("each key produces an object with all 6 brand vars", () => {
  const vars = ["--brand-50", "--brand-100", "--brand-300", "--brand-500", "--brand-700", "--brand-900"];
  for (const key of PALETTE_KEYS) {
    const result = paletteVars(key);
    for (const v of vars) {
      expect(result[v], `${key} missing ${v}`).toMatch(/^#/);
    }
  }
});
