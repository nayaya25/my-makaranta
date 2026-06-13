import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import { MarkAttendanceDto } from "./dto/attendance.dto";

@Controller("v1/attendance")
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get("class/:classId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("attendance.view")
  getRoster(
    @Param("classId") classId: string,
    @Query("date") date: string,
  ) {
    return this.attendance.getRoster(classId, date);
  }

  @Post("mark")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("attendance.mark")
  mark(
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attendance.markAttendance(dto, user.id);
  }

  @Get("student/:studentId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("attendance.view")
  getStudentHistory(
    @Param("studentId") studentId: string,
    @Query("limit") limit?: string,
  ) {
    return this.attendance.getStudentHistory(studentId, limit ? parseInt(limit, 10) : 60);
  }

  @Get("summary")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("attendance.view")
  getSummary(
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.attendance.getSummary(from, to);
  }
}
