import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { TenantContext } from "./tenant.context";

interface AuthedRequest extends Request {
  user?: { id?: string; schoolId?: string | null };
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: AuthedRequest, _res: Response, next: NextFunction): void {
    const schoolId = req.user?.schoolId ?? null;
    const userId = req.user?.id ?? null;
    void TenantContext.run({ schoolId, userId }, async () => next());
  }
}
