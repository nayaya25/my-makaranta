import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { EnrollmentService } from "./enrollment.service";
import { CreateEnrollmentDto } from "./dto/enrollment.dto";

@Controller("v1/enrollments")
export class EnrollmentController {
  constructor(private enrollment: EnrollmentService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollment.create(dto);
  }
}
