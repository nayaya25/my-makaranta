import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { ApplyTemplateDto, ReplaceGradeBoundariesDto } from "./dto/assessment.dto";

@Controller("v1/assessment/grade-boundaries")
export class GradeBoundariesController {
  constructor(private service: GradeBoundariesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.service.list();
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceGradeBoundariesDto) {
    return this.service.replace(dto.boundaries);
  }

  @Post("apply-template")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    return this.service.applyTemplate(dto.template);
  }
}
