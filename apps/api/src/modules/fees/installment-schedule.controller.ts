import { Body, Controller, Get, HttpCode, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { InstallmentScheduleService } from "./installment-schedule.service";
import { SetScheduleDto } from "./dto/installments.dto";

@Controller("v1/fees")
export class InstallmentScheduleController {
  constructor(private service: InstallmentScheduleService) {}

  @Get("installment-schedule")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  getSchedule(@Query("classLevelId") classLevelId: string, @Query("termId") termId: string) {
    return this.service.getSchedule(classLevelId, termId);
  }

  @Put("installment-schedule")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  setSchedule(@Body() dto: SetScheduleDto) {
    return this.service.setSchedule(dto.classLevelId, dto.termId, dto.installments);
  }
}
