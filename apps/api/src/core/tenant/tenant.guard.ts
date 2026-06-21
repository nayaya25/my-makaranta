import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Asserts that the `x-tenant-school-id` request header (set by the web subdomain middleware)
 * matches the `schoolId` encoded in the bearer JWT (`sch` claim → `request.user.schoolId`).
 *
 * - No header / empty header → no-op (returns true). This keeps existing `app.` clients and
 *   all current tests working: they don't send the header and must not be broken.
 * - Header present but `user.schoolId` differs → 403 ForbiddenException.
 *
 * Apply this guard after `JwtAuthGuard` on authenticated routes, or register it as an
 * APP_GUARD (it short-circuits to true whenever the header is absent, so public + legacy
 * routes are unaffected).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      user?: { schoolId?: string | null };
      headers: Record<string, string | string[] | undefined>;
    }>();

    const headerValue = req.headers["x-tenant-school-id"];
    const tenantId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    // No header (or empty) → allow (legacy / non-subdomain client)
    if (!tenantId) return true;

    const jwtSchoolId = req.user?.schoolId;

    // No authenticated user yet (public / unauthenticated route) → allow.
    if (!jwtSchoolId) return true;

    if (tenantId !== jwtSchoolId) {
      throw new ForbiddenException("Tenant mismatch: the requested school does not match your session.");
    }

    return true;
  }
}
