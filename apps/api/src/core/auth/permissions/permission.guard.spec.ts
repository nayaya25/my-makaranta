import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard";
import type { PermissionsService } from "./permissions.service";

function ctx(user: unknown, handlerMeta: string[] | undefined) {
  const reflector = {
    getAllAndOverride: () => handlerMeta,
  } as unknown as Reflector;
  const execCtx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
  return { reflector, execCtx };
}

function guardWith(reflector: Reflector, granted: string[]): PermissionGuard {
  const permissions = {
    keysFor: async () => new Set(granted),
  } as unknown as PermissionsService;
  return new PermissionGuard(reflector, permissions);
}

describe("PermissionGuard", () => {
  it("allows routes with no required permissions", async () => {
    const { reflector, execCtx } = ctx({ id: "u1" }, undefined);
    expect(await guardWith(reflector, []).canActivate(execCtx)).toBe(true);
  });

  it("allows when the user has all required permissions", async () => {
    const { reflector, execCtx } = ctx({ id: "u1" }, ["students.view"]);
    expect(await guardWith(reflector, ["students.view", "fees.view"]).canActivate(execCtx)).toBe(
      true,
    );
  });

  it("forbids when a required permission is missing", async () => {
    const { reflector, execCtx } = ctx({ id: "u1" }, ["results.release"]);
    await expect(guardWith(reflector, ["students.view"]).canActivate(execCtx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("forbids an unauthenticated request to a protected route", async () => {
    const { reflector, execCtx } = ctx(undefined, ["students.view"]);
    await expect(guardWith(reflector, []).canActivate(execCtx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
