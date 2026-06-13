import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ImportsService } from "./imports.service";
import { ImportStudentsDto } from "./dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ImportsController {
  constructor(private imports: ImportsService) {}

  @Post("v1/imports/students")
  @RequirePermissions("students.import")
  enqueue(@Body() dto: ImportStudentsDto, @CurrentUser() user: RequestUser) {
    if (!user.schoolId) throw new NotFoundException("No school associated with this account.");
    return this.imports.enqueueStudents(dto.rows, user.schoolId, user.id);
  }

  @Get("v1/imports/:jobId")
  @RequirePermissions("students.import")
  async status(@Param("jobId") jobId: string) {
    const status = await this.imports.status(jobId);
    if (!status) throw new NotFoundException("Import job not found.");
    return status;
  }
}
