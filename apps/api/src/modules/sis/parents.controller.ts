import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ParentsService } from "./parents.service";
import { CreateParentDto, CreateGuardianDto } from "./dto/parent.dto";
import { SetPreferenceDto } from "../../core/notification-dispatch/dto/preference.dto";

@Controller()
export class ParentsController {
  constructor(private parents: ParentsService) {}

  @Post("v1/parents")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.create")
  createParent(@Body() dto: CreateParentDto) {
    return this.parents.createParent(dto);
  }

  @Post("v1/students/:id/guardians")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  createGuardian(@Param("id") id: string, @Body() dto: CreateGuardianDto) {
    return this.parents.createGuardian(id, dto);
  }

  @Get("v1/students/:id/guardians")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.view")
  findGuardians(@Param("id") id: string) {
    return this.parents.findGuardians(id);
  }

  @Get("v1/parents/:parentId/notification-preferences")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  getNotificationPreferences(@Param("parentId") parentId: string) {
    return this.parents.getNotificationPreferences(parentId);
  }

  @Put("v1/parents/:parentId/notification-preferences")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  setNotificationPreferences(@Param("parentId") parentId: string, @Body() dto: SetPreferenceDto) {
    return this.parents.setNotificationPreferences(parentId, dto);
  }
}
