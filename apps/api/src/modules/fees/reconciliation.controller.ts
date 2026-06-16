import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ReconciliationService } from "./reconciliation.service";
import { ProposeMatchesDto, ConfirmMatchesDto } from "./dto/reconcile.dto";

@Controller("v1/fees/reconcile")
export class ReconciliationController {
  constructor(private service: ReconciliationService) {}

  @Post("propose") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  propose(@Body() dto: ProposeMatchesDto) { return this.service.proposeMatches(dto.termId, dto.rows); }

  @Post("confirm") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  confirm(@Body() dto: ConfirmMatchesDto, @CurrentUser() user: RequestUser) { return this.service.confirmMatches(dto.confirmations, user); }
}
