import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { TenantContext } from "../../core/tenant/tenant.context";
import { StudentsService } from "./students.service";
import { CreateStudentDto, UpdateStudentDto } from "./dto/student.dto";

@Controller("v1/students")
export class StudentsController {
  constructor(private students: StudentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.create")
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.view")
  findAll() {
    return this.students.findAll();
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.view")
  findOne(@Param("id") id: string) {
    return this.students.findOne(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  update(@Param("id") id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  remove(@Param("id") id: string) {
    return this.students.remove(id);
  }

  @Post(":id/photo")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  @UseInterceptors(FileInterceptor("file"))
  setPhoto(@Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.students.setPhoto(id, file);
  }

  @Post(":id/login")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.manage")
  provisionLogin(@Param("id") id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.students.provisionLogin(id, schoolId);
  }
}
