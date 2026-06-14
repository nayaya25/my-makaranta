import { Body, Controller, Get, HttpCode, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { AssessmentTypesService } from "./assessment-types.service";
import { ReplaceAssessmentTypesDto } from "./dto/assessment.dto";

@Controller("v1/assessment/types")
export class AssessmentTypesController {
  constructor(private service: AssessmentTypesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.service.list();
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceAssessmentTypesDto) {
    return this.service.replace(dto.types);
  }
}
