import { Body, Controller, ForbiddenException, Get, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { RemarksService } from "./remarks.service";
import { UpsertRemarkDto } from "./dto/remarks.dto";

@Controller("v1/assessment")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RemarksController {
  constructor(private service: RemarksService) {}

  @Put("remarks")
  @RequirePermissions("skills.record")
  upsertRemark(@Body() dto: UpsertRemarkDto, @CurrentUser() user: RequestUser) {
    const perms = user.perms;
    const caps = {
      canForm: perms?.includes("skills.record") ?? false,
      canPrincipal: perms?.includes("results.review") ?? false,
    };
    return this.service.upsertRemark(dto, caps);
  }

  @Get("remarks")
  @RequirePermissions("skills.record")
  getRemark(
    @Query("studentId") studentId: string,
    @Query("termId") termId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = user.perms;
    const hasAny = perms?.includes("skills.record") || perms?.includes("results.review");
    if (!hasAny) {
      throw new ForbiddenException("Requires skills.record or results.review permission.");
    }
    return this.service.getRemark(studentId, termId);
  }
}
