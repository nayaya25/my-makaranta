import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { LessonPlansService } from "./lesson-plans.service";
import { PutLessonPlanDto, ReviewLessonPlanDto } from "./dto/lesson-plans.dto";

/** True when the caller's JWT carries the lessonplans.review permission. */
function canReviewAll(req: Request): boolean {
  const perms = (req.user as { perms?: string[] } | undefined)?.perms;
  return Array.isArray(perms) && perms.includes("lessonplans.review");
}

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

  // Read routes take no fixed permission (the @RequirePermissions guard is AND-only and
  // both authors and reviewers must reach them). Authentication is still required, and the
  // service enforces owner-or-reviewer so a teacher cannot read a colleague's plans.
  @Get("assignment/:assignmentId")
  @UseGuards(JwtAuthGuard)
  getForAssignment(@Param("assignmentId") assignmentId: string, @Query("termId") termId: string, @Req() req: Request) {
    return this.lessonPlans.getForAssignment(assignmentId, termId, canReviewAll(req));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  getOne(@Param("id") id: string, @Req() req: Request) {
    return this.lessonPlans.getOne(id, canReviewAll(req));
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
