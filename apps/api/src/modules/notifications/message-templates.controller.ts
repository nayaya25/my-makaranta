import { Body, Controller, Delete, Get, Param, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { TenantContext } from "../../core/tenant/tenant.context";
import { MessageTemplateService } from "../../core/notification-dispatch/message-template.service";
import { SetMessageTemplateDto } from "../../core/notification-dispatch/dto/message-template.dto";

@Controller("v1/notifications/templates")
export class MessageTemplatesController {
  constructor(private templates: MessageTemplateService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  list() {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.templates.list(schoolId);
  }

  @Put(":key")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  set(@Param("key") key: string, @Body() dto: SetMessageTemplateDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.templates.set(schoolId, key, dto.body);
  }

  @Delete(":key")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  reset(@Param("key") key: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    return this.templates.reset(schoolId, key);
  }
}
