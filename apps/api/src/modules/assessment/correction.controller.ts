import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { CorrectionService } from "./correction.service";
import { CorrectScoreDto, CorrectionConfigDto } from "./dto/assessment.dto";

@Controller("v1/assessment/correction")
export class CorrectionController {
  constructor(private service: CorrectionService) {}

  @Get("config")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  getConfig() {
    return this.service.getConfig();
  }

  @Patch("config")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  setConfig(@Body() dto: CorrectionConfigDto) {
    return this.service.setConfig(dto.requireCorrectionOtp);
  }

  @Get("scores")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  scores(@Query("classId") classId: string, @Query("termId") termId: string, @Query("studentId") studentId: string, @Query("subjectId") subjectId: string) {
    return this.service.getCorrectableScores(classId, termId, studentId, subjectId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.correct")
  correct(@Body() dto: CorrectScoreDto, @CurrentUser() user: RequestUser) {
    return this.service.correct(dto, user);
  }
}
