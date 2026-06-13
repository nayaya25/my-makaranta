import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ClassLevelsService } from "./class-levels.service";
import { CreateClassLevelsDto } from "./dto/class-levels.dto";

@Controller("v1/class-levels")
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
}
