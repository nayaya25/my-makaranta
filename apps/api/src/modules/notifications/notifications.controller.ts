import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { TenantContext } from "../../core/tenant/tenant.context";
import { NotificationSettingsService } from "./notification-settings.service";
import { UpdateNotificationSettingsDto } from "./dto/notifications.dto";

@Controller("v1/notifications")
export class NotificationsController {
  constructor(private settings: NotificationSettingsService) {}

  @Get("settings")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  getSettings() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.settings.get(schoolId);
  }

  @Put("settings")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  updateSettings(@Body() dto: UpdateNotificationSettingsDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.settings.update(schoolId, dto);
  }
}
