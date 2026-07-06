import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { DiscountsService } from "./discounts.service";
import { AssignDiscountDto, CreateSchemeDto, UpdateSchemeDto } from "./dto/discounts.dto";

@Controller("v1/fees")
export class DiscountsController {
  constructor(private service: DiscountsService) {}

  @Get("discount-schemes")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  listSchemes() {
    return this.service.listSchemes();
  }

  @Post("discount-schemes")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  createScheme(@Body() dto: CreateSchemeDto) {
    return this.service.createScheme(dto);
  }

  @Patch("discount-schemes/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  updateScheme(@Param("id") id: string, @Body() dto: UpdateSchemeDto) {
    return this.service.updateScheme(id, dto);
  }

  @Delete("discount-schemes/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  deleteScheme(@Param("id") id: string) {
    return this.service.deleteScheme(id);
  }

  @Get("discount-schemes/:id/students")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  schemeRoster(@Param("id") id: string) {
    return this.service.schemeRoster(id);
  }

  @Get("students/:studentId/discounts")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  listForStudent(@Param("studentId") studentId: string) {
    return this.service.listForStudent(studentId);
  }

  @Post("students/:studentId/discounts")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  assign(@Param("studentId") studentId: string, @Body() dto: AssignDiscountDto) {
    return this.service.assign(studentId, dto.schemeId);
  }

  @Delete("student-discounts/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  revoke(@Param("id") id: string) {
    return this.service.revoke(id);
  }
}
