import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReportCardConfigService } from "./report-card-config.service";
import { UpdateReportCardConfigDto } from "./dto/report-card-config.dto";

@Controller("v1/assessment")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportCardConfigController {
  constructor(private service: ReportCardConfigService) {}

  @Get("report-card-config")
  getOrCreate() {
    return this.service.getOrCreate();
  }

  @Put("report-card-config")
  @RequirePermissions("school.manage")
  update(@Body() dto: UpdateReportCardConfigDto) {
    return this.service.update(dto);
  }
}
