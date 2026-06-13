import { Injectable, type NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response, NextFunction } from "express";
import { TenantContext } from "./tenant.context";

/**
 * Establishes tenant context for the whole request by verifying the bearer JWT here —
 * NestJS middleware runs before guards, so we cannot rely on passport's req.user yet.
 * An invalid/absent token yields a null context; protected routes are still rejected by the guard.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    let schoolId: string | null = null;
    let userId: string | null = null;

    if (header?.startsWith("Bearer ")) {
      try {
        const payload = this.jwt.verify<{ sub?: string; schoolId?: string | null }>(
          header.slice(7),
        );
        schoolId = payload.schoolId ?? null;
        userId = payload.sub ?? null;
      } catch {
        // Invalid token — leave context null; the route guard will reject if auth is required.
      }
    }

    void TenantContext.run({ schoolId, userId }, async () => next());
  }
}
