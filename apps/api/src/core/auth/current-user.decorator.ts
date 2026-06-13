import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface RequestUser {
  id: string;
  phone?: string;
  schoolId: string | null;
  identityType: string;
}

/** Inject the authenticated user (set by JwtStrategy) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest().user as RequestUser,
);
