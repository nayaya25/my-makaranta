import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { FinanceService } from "./finance.service";

@Controller("v1/fees/finance")
export class FinanceController {
  constructor(private service: FinanceService) {}

  @Get("summary")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("reports.view")
  summary(@Query("termId") termId: string) {
    return this.service.getFinanceSummary(termId);
  }
}
