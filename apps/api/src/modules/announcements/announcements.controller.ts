import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { AnnouncementsService } from "./announcements.service";
import { CreateAnnouncementDto } from "./dto";

@Controller("v1")
export class AnnouncementsController {
  constructor(private service: AnnouncementsService) {}

  @Post("announcements")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.create")
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Get("announcements")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.view")
  list() {
    return this.service.list();
  }

  @Get("announcements/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.view")
  receipts(@Param("id") id: string) {
    return this.service.getRecipients(id);
  }

  @Get("parent/announcements")
  @UseGuards(JwtAuthGuard)
  parentInbox(@CurrentUser() user: RequestUser) {
    return this.service.getForParent(user);
  }

  @Post("parent/announcements/:announcementId/read")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  markRead(@Param("announcementId") announcementId: string, @CurrentUser() user: RequestUser) {
    return this.service.markRead(announcementId, user);
  }
}
