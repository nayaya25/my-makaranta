import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { DashboardService } from "./dashboard.service";

@Controller("v1/dashboard")
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get("proprietor")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  proprietor(@Query("termId") termId?: string) {
    return this.service.getProprietorSummary(termId);
  }

  @Get("principal")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  principal(@Query("termId") termId?: string) {
    return this.service.getPrincipalSummary(termId);
  }

  @Get("alerts")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  alerts(@Query("termId") termId?: string) {
    return this.service.getAlerts(termId);
  }
}
