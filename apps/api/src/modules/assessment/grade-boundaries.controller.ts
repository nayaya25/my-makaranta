import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { GradeBoundariesService } from "./grade-boundaries.service";
import {
  ApplyAssessmentFormatsDto,
  ApplyTemplateDto,
  CreateGradeBoundaryDto,
  ReplaceGradeBoundariesDto,
} from "./dto/assessment.dto";

@Controller("v1/assessment/grade-boundaries")
export class GradeBoundariesController {
  constructor(private service: GradeBoundariesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query("classLevelId") classLevelId?: string) {
    return this.service.list(classLevelId);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  create(@Body() dto: CreateGradeBoundaryDto) {
    return this.service.create(dto);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceGradeBoundariesDto) {
    return this.service.replace(dto.boundaries);
  }

  @Post("apply-template")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    return this.service.applyTemplate(dto.template);
  }

  @Post("apply")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  apply(@Body() dto: ApplyAssessmentFormatsDto) {
    return this.service.apply(dto);
  }
}
