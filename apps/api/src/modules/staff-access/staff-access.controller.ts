import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { PermissionsService } from "../../core/auth/permissions/permissions.service";
import { StaffAccessService } from "./staff-access.service";
import { SetStaffPermissionsDto } from "./dto";

@Controller("v1")
export class StaffAccessController {
  constructor(
    private service: StaffAccessService,
    private permissions: PermissionsService,
  ) {}

  @Get("permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  catalog() {
    return this.service.getCatalog();
  }

  @Get("staff/:id/permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  getStaffPermissions(@Param("id") id: string) {
    return this.service.getStaffPermissions(id);
  }

  @Put("staff/:id/permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  setStaffPermissions(@Param("id") id: string, @Body() dto: SetStaffPermissionsDto) {
    return this.service.setStaffPermissions(id, dto.keys);
  }

  @Get("me/permissions")
  @UseGuards(JwtAuthGuard)
  async myPermissions(@CurrentUser() user: RequestUser) {
    const keys = await this.permissions.keysFor({ id: user.id, identityType: user.identityType, identityId: user.identityId });
    return { keys: [...keys].sort() };
  }
}
