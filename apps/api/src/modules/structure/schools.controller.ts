import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, RequestUser } from "../../core/auth/current-user.decorator";
import { SchoolsService } from "./schools.service";
import { CreateSchoolDto, UpdateBrandingDto, UpdateSchoolDto } from "./dto/schools.dto";

/** Public endpoint — no authentication required. */
@Controller("v1/public")
export class PublicTenantController {
  constructor(private schools: SchoolsService) {}

  /** Resolve a school's public branding by slug. Returns only public fields; 404 if not found. */
  @Get("tenant/:slug")
  resolveTenant(@Param("slug") slug: string) {
    return this.schools.findPublicBySlug(slug);
  }
}

@Controller("v1/schools")
export class SchoolsController {
  constructor(private schools: SchoolsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateSchoolDto, @CurrentUser() user: RequestUser) {
    return this.schools.createSchool(dto, user.id);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.schools.getMySchool(user.schoolId);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  update(@Body() dto: UpdateSchoolDto, @CurrentUser() user: RequestUser) {
    return this.schools.updateMySchool(user.schoolId, dto);
  }

  @Post("me/logo")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  @UseInterceptors(FileInterceptor("file"))
  setLogo(@CurrentUser() user: RequestUser, @UploadedFile() file?: Express.Multer.File) {
    return this.schools.setLogo(user.schoolId, file);
  }

  @Patch("branding")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("school.manage")
  updateBranding(@Body() dto: UpdateBrandingDto, @CurrentUser() user: RequestUser) {
    return this.schools.updateBranding(user.schoolId, dto);
  }
}
