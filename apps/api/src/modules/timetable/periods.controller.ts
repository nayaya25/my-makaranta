import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CreatePeriodDto, UpdatePeriodDto } from "./dto/timetable.dto";
import { PeriodsService } from "./periods.service";

@Controller("v1/timetable/periods")
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.view")
  list() {
    return this.periods.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  create(@Body() dto: CreatePeriodDto) {
    return this.periods.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  update(@Param("id") id: string, @Body() dto: UpdatePeriodDto) {
    return this.periods.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  remove(@Param("id") id: string) {
    return this.periods.remove(id);
  }
}
