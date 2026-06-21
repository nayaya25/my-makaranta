// apps/api/src/core/auth/me.controller.ts
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { type RequestUser } from "./current-user.decorator";
import { IdentityService } from "../identity/identity.service";

@Controller("v1/me")
export class MeController {
  constructor(private identityService: IdentityService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: Request) {
    const user = req.user as RequestUser;
    if (!user.personId) {
      // Legacy-shape token fallback
      return { legacy: true, identityType: user.identityType, schoolId: user.schoolId };
    }
    return this.identityService.getMeContext(user.personId, user.membershipId!);
  }
}
