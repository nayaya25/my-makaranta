import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { LessonPlansService } from "./lesson-plans.service";
import { PutLessonPlanDto, ReviewLessonPlanDto } from "./dto/lesson-plans.dto";

@Controller("v1/lesson-plans")
export class LessonPlansController {
  constructor(private lessonPlans: LessonPlansService) {}

  // Static segment routes must come before ":id" to avoid capture.

  @Get("review-queue")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.review")
  reviewQueue(@Query("termId") termId?: string) {
    return this.lessonPlans.reviewQueue(termId);
  }

  @Get("assignment/:assignmentId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.record")
  getForAssignment(@Param("assignmentId") assignmentId: string, @Query("termId") termId: string) {
    return this.lessonPlans.getForAssignment(assignmentId, termId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.record")
  getOne(@Param("id") id: string) {
    return this.lessonPlans.getOne(id);
  }

  @Put()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.record")
  putDraft(@Body() dto: PutLessonPlanDto) {
    return this.lessonPlans.putDraft(dto);
  }

  @Post(":id/submit")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.record")
  submit(@Param("id") id: string) {
    return this.lessonPlans.submit(id);
  }

  @Post(":id/review")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("lessonplans.review")
  review(@Param("id") id: string, @Body() dto: ReviewLessonPlanDto) {
    return this.lessonPlans.review(id, dto);
  }
}
