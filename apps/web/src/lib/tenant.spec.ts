import { it, expect } from "vitest";
import { parseTenantHost, brandStyle } from "./tenant";

it("extracts slug from subdomain hosts only", () => {
  expect(parseTenantHost("ahlacademy.mymakaranta.com")).toBe("ahlacademy");
  expect(parseTenantHost("ahlacademy.localhost:3000")).toBe("ahlacademy");
  expect(parseTenantHost("app.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("www.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("mymakaranta.com")).toBeNull();
});

it("brandStyle returns --brand-500 for teal", () => {
  const style = brandStyle("teal");
  expect((style as Record<string, string>)["--brand-500"]).toBe("#066666");
});

it("brandStyle falls back to teal for unknown themeKey", () => {
  const style = brandStyle("unknown-key");
  expect((style as Record<string, string>)["--brand-500"]).toBe("#066666");
});
