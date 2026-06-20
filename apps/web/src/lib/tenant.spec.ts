import { it, expect } from "vitest";
import { parseTenantHost } from "./tenant";

it("extracts slug from subdomain hosts only", () => {
  expect(parseTenantHost("ahlacademy.mymakaranta.com")).toBe("ahlacademy");
  expect(parseTenantHost("ahlacademy.localhost:3000")).toBe("ahlacademy");
  expect(parseTenantHost("app.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("www.mymakaranta.com")).toBeNull();
  expect(parseTenantHost("mymakaranta.com")).toBeNull();
});
