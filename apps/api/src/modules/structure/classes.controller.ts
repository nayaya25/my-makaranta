import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ClassesService } from "./classes.service";
import { CreateClassDto } from "./dto/classes.dto";

@Controller("v1/classes")
export class ClassesController {
  constructor(private service: ClassesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.manage")
  create(@Body() dto: CreateClassDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("classes.view")
  findAll() {
    return this.service.findAll();
  }
}
