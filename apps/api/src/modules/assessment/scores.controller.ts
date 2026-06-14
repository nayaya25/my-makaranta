import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ScoresService } from "./scores.service";
import { SaveScoresDto } from "./dto/assessment.dto";

@Controller("v1/assessment/scores")
export class ScoresController {
  constructor(private service: ScoresService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.record")
  gradebook(
    @Query("classId") classId: string,
    @Query("subjectId") subjectId: string,
    @Query("termId") termId: string,
  ) {
    return this.service.getGradebook(classId, subjectId, termId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.record")
  save(@Body() dto: SaveScoresDto, @CurrentUser() user: RequestUser) {
    return this.service.saveScores(dto, user.id);
  }
}
