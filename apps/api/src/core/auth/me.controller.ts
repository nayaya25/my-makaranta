// apps/api/src/core/auth/me.controller.ts
import { BadRequestException, Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, type RequestUser } from "./current-user.decorator";
import { IdentityService } from "../identity/identity.service";

@Controller("v1/me")
export class MeController {
  constructor(private identityService: IdentityService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: RequestUser) {
    if (!user.personId) {
      // Legacy-shape token fallback
      return { legacy: true, identityType: user.identityType, schoolId: user.schoolId };
    }
    if (!user.membershipId) {
      throw new BadRequestException('Active membership id missing from token');
    }
    return this.identityService.getMeContext(user.personId, user.membershipId);
  }
}
