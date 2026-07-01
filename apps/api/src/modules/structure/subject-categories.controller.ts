import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { SubjectCategoriesService } from "./subject-categories.service";
import { CreateSubjectCategoryDto, UpdateSubjectCategoryDto } from "./dto/subject-categories.dto";

@Controller("v1/subject-categories")
export class SubjectCategoriesController {
  constructor(private service: SubjectCategoriesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.service.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  create(@Body() dto: CreateSubjectCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  update(@Param("id") id: string, @Body() dto: UpdateSubjectCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
