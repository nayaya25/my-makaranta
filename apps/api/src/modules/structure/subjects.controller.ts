import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { SubjectsService } from "./subjects.service";
import { CreateSubjectDto, UpdateSubjectDto } from "./dto/subjects.dto";

@Controller("v1/subjects")
export class SubjectsController {
  constructor(private service: SubjectsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  create(@Body() dto: CreateSubjectDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  update(@Param("id") id: string, @Body() dto: UpdateSubjectDto) {
    return this.service.update(id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.service.findAll();
  }
}
