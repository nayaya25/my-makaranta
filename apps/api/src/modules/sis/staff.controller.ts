import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { StaffService } from "./staff.service";
import { CreateStaffDto, UpdateStaffDto } from "./dto/staff.dto";

@Controller("v1/staff")
export class StaffController {
  constructor(private staff: StaffService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.view")
  findAll() {
    return this.staff.findAll();
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.view")
  findOne(@Param("id") id: string) {
    return this.staff.findOne(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  update(@Param("id") id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }
}
