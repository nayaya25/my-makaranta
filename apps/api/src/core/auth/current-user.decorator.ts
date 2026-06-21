import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface RequestUser {
  id: string;
  phone?: string;
  schoolId: string | null;
  identityType: string;
  identityId?: string;
  // Password-login enriched fields (optional — not present in OTP-issued tokens)
  personId?: string;
  membershipId?: string;
  roles?: string[];
  perms?: string[];
}

/** Inject the authenticated user (set by JwtStrategy) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest().user as RequestUser,
);
