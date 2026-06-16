import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsNotEmpty, IsString } from "class-validator";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { CollectionsService } from "./collections.service";

class SetDueDateDto { @IsString() @IsNotEmpty() termId!: string; @IsDateString() dueDate!: string; }
class RemindDto { @IsString() @IsNotEmpty() invoiceId!: string; }
class BulkRemindDto { @IsString() @IsNotEmpty() termId!: string; }

@Controller("v1/fees/collections")
export class CollectionsController {
  constructor(private service: CollectionsService) {}

  @Get() @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.view")
  list(@Query("termId") termId: string) { return this.service.getCollections(termId); }

  @Post("due-date") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  setDueDate(@Body() dto: SetDueDateDto) { return this.service.setDueDate(dto.termId, new Date(dto.dueDate)); }

  @Post("remind") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  remind(@Body() dto: RemindDto, @CurrentUser() user: RequestUser) { return this.service.sendReminder(dto.invoiceId, user); }

  @Post("remind-all") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  remindAll(@Body() dto: BulkRemindDto, @CurrentUser() user: RequestUser) { return this.service.sendBulkReminders(dto.termId, user); }
}
