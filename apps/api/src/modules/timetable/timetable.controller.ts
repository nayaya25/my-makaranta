import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { PutEntryDto } from "./dto/timetable.dto";
import { TimetableService } from "./timetable.service";

@Controller("v1/timetable")
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get("class/:classId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.view")
  getClassGrid(
    @Param("classId") classId: string,
    @Query("academicYearId") academicYearId: string,
  ) {
    return this.timetable.getClassGrid(classId, academicYearId);
  }

  @Get("teacher/:staffId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.view")
  getTeacherGrid(
    @Param("staffId") staffId: string,
    @Query("academicYearId") academicYearId: string,
  ) {
    return this.timetable.getTeacherGrid(staffId, academicYearId);
  }

  @Put("entry")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  putEntry(@Body() dto: PutEntryDto) {
    return this.timetable.putEntry(dto);
  }

  @Delete("entry/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  deleteEntry(@Param("id") id: string) {
    return this.timetable.deleteEntry(id);
  }
}
