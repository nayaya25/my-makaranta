import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { FeesService } from "./fees.service";
import { SetFeeItemsDto, GenerateInvoicesDto } from "./dto/fees.dto";

@Controller("v1/fees")
export class FeesController {
  constructor(private service: FeesService) {}

  @Get("items")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  items(@Query("classLevelId") classLevelId: string, @Query("termId") termId: string) {
    return this.service.getFeeItems(classLevelId, termId);
  }

  @Post("items")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  setItems(@Body() dto: SetFeeItemsDto) {
    return this.service.setFeeItems(dto.classLevelId, dto.termId, dto.items);
  }

  @Post("generate")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.service.generateInvoices(dto.termId);
  }

  @Get("invoices")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  invoices(@Query("termId") termId: string, @Query("classId") classId?: string) {
    return this.service.getInvoices(termId, classId);
  }

  @Get("invoice")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  invoice(@Query("studentId") studentId: string, @Query("termId") termId: string) {
    return this.service.getInvoice(studentId, termId);
  }
}
