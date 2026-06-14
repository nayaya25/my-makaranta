import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { SubjectAssignmentsService } from "./subject-assignments.service";
import { CreateSubjectAssignmentDto, UpdateSubjectAssignmentDto } from "./dto/assessment.dto";

@Controller("v1/assessment/subject-assignments")
export class SubjectAssignmentsController {
  constructor(private service: SubjectAssignmentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query("classId") classId?: string, @Query("academicYearId") academicYearId?: string) {
    return this.service.list({ classId, academicYearId });
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  create(@Body() dto: CreateSubjectAssignmentDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  update(@Param("id") id: string, @Body() dto: UpdateSubjectAssignmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
