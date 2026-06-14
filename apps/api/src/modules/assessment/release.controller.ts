import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ReleaseService } from "./release.service";

class ReleaseDto {
  @IsString() @IsNotEmpty() classId!: string;
  @IsString() @IsNotEmpty() termId!: string;
}

@Controller("v1/assessment/release")
export class ReleaseController {
  constructor(private service: ReleaseService) {}

  @Get("status")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  status(@Query("termId") termId: string) {
    return this.service.getStatus(termId);
  }

  @Get("sheet")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  sheet(@Query("classId") classId: string, @Query("termId") termId: string) {
    return this.service.getSheet(classId, termId);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  release(@Body() dto: ReleaseDto, @CurrentUser() user: RequestUser) {
    return this.service.release(dto.classId, dto.termId, user.id);
  }
}
