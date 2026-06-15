import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReportCardService } from "./report-card.service";

@Controller("v1/assessment/report-card")
export class ReportCardController {
  constructor(private service: ReportCardService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  get(@Query("studentId") studentId: string, @Query("termId") termId: string) {
    return this.service.getReportCard(studentId, termId);
  }
}
