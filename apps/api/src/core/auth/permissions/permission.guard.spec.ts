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

  // --- JWT fast-path (Task 7) ---

  it("JWT fast-path: allows when user.perms contains the required permission (no DB call)", async () => {
    const { reflector, execCtx } = ctx({ id: "u1", perms: ["students.view"] }, ["students.view"]);
    // permissions service would throw if invoked — proves the DB path is never reached
    const throwingPermissions = {
      keysFor: () => { throw new Error("DB must NOT be called on the JWT fast-path"); },
    } as unknown as PermissionsService;
    const guard = new PermissionGuard(reflector, throwingPermissions);
    expect(await guard.canActivate(execCtx)).toBe(true);
  });

  it("JWT fast-path: forbids when user.perms does NOT contain a required permission (no DB call)", async () => {
    const { reflector, execCtx } = ctx({ id: "u1", perms: ["fees.view"] }, ["students.view"]);
    const throwingPermissions = {
      keysFor: () => { throw new Error("DB must NOT be called on the JWT fast-path"); },
    } as unknown as PermissionsService;
    const guard = new PermissionGuard(reflector, throwingPermissions);
    expect(await guard.canActivate(execCtx)).toBe(false);
  });

  it("DB fallback: user.perms undefined → existing DB path runs and grants access", async () => {
    const { reflector, execCtx } = ctx({ id: "u1" /* no perms */ }, ["students.view"]);
    // DB stub returns the required permission — proves the fallback branch is exercised
    expect(await guardWith(reflector, ["students.view"]).canActivate(execCtx)).toBe(true);
  });

  it("DB fallback: user.perms undefined → existing DB path runs and denies access when missing", async () => {
    const { reflector, execCtx } = ctx({ id: "u1" }, ["results.release"]);
    await expect(guardWith(reflector, ["students.view"]).canActivate(execCtx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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
