import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { TenantGuard } from "./tenant.guard";

function makeCtx(schoolId: string | null | undefined, header: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: schoolId !== undefined ? { schoolId } : undefined,
        headers: header !== undefined ? { "x-tenant-school-id": header } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("TenantGuard", () => {
  const guard = new TenantGuard();

  it("returns true when header matches JWT.sch (schoolId)", () => {
    const ctx = makeCtx("school-1", "school-1");
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when header does not match JWT.sch", () => {
    const ctx = makeCtx("school-1", "school-2");
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("returns true when x-tenant-school-id header is absent (legacy/no-subdomain clients)", () => {
    const ctx = makeCtx("school-1", undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("returns true when x-tenant-school-id header is empty string (treated as absent)", () => {
    const ctx = makeCtx("school-1", "");
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
