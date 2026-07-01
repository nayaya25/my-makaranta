import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ClassLevelsService } from "./class-levels.service";
import { CreateClassLevelsDto, UpdateClassLevelDto } from "./dto/class-levels.dto";

@Controller("v1/structure/class-levels")
export class ClassLevelsController {
  constructor(private service: ClassLevelsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  create(@Body() dto: CreateClassLevelsDto) {
    return this.service.createMany(dto.items);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.service.findAll();
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  update(@Param("id") id: string, @Body() dto: UpdateClassLevelDto) {
    return this.service.updateLevel(id, dto);
  }
}
