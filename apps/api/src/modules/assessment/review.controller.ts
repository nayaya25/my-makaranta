import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReviewService } from "./review.service";

@Controller("v1/assessment/review")
export class ReviewController {
  constructor(private service: ReviewService) {}

  @Get("class-master")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.review")
  classMaster(@Query("classId") classId: string, @Query("termId") termId: string) {
    return this.service.classMaster(classId, termId);
  }

  @Get("subject-master")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.review")
  subjectMaster(@Query("subjectId") subjectId: string, @Query("termId") termId: string) {
    return this.service.subjectMaster(subjectId, termId);
  }
}
