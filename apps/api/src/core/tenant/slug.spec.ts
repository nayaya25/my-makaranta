import { validateSlug, slugify, RESERVED_SUBDOMAINS } from "./slug";
describe("slug", () => {
  it("accepts valid slugs", () => {
    expect(validateSlug("ahlacademy")).toBeNull();
    expect(validateSlug("st-marys-2")).toBeNull();
  });
  it("rejects invalid + reserved", () => {
    expect(validateSlug("ab")).toMatch(/3/);              // too short
    expect(validateSlug("-bad")).toMatch(/hyphen/i);
    expect(validateSlug("Bad_Caps")).toMatch(/lowercase|letters/i);
    expect(validateSlug("app")).toMatch(/reserved/i);
    expect(RESERVED_SUBDOMAINS.has("api")).toBe(true);
  });
  it("slugifies names", () => {
    expect(slugify("St. Mary's Academy")).toBe("st-marys-academy");
  });
});
