import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import { PermissionsService } from "./permissions.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as { id?: string; identityType?: string; identityId?: string | null; perms?: string[] } | undefined;
    if (!user?.id) throw new ForbiddenException("Not authenticated");

    // JWT fast-path: identity-issued tokens carry perms[] in the payload
    if (Array.isArray(user.perms)) {
      return required.every((p) => (user.perms as string[]).includes(p));
    }

    // Legacy DB-backed path: OTP-issued tokens have no perms in the JWT
    const granted = await this.permissions.keysFor({ id: user.id, identityType: user.identityType, identityId: user.identityId });
    const missing = required.filter((k) => !granted.has(k));
    if (missing.length) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(", ")}`);
    }
    return true;
  }
}
