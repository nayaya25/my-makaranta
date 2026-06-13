import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_KEY = "required_permissions";

/** Declare the permission keys a route requires, enforced by PermissionGuard. */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);
