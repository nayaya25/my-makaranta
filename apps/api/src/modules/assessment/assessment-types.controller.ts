import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { AssessmentTypesService } from "./assessment-types.service";
import { ApplyAssessmentFormatsDto, CreateAssessmentTypeDto, ReplaceAssessmentTypesDto } from "./dto/assessment.dto";

@Controller("v1/assessment/types")
export class AssessmentTypesController {
  constructor(private service: AssessmentTypesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query("classLevelId") classLevelId?: string) {
    return this.service.list(classLevelId);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  create(@Body() dto: CreateAssessmentTypeDto) {
    return this.service.create(dto);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceAssessmentTypesDto) {
    return this.service.replace(dto.types);
  }

  @Post("apply")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  apply(@Body() dto: ApplyAssessmentFormatsDto) {
    return this.service.apply(dto);
  }
}
