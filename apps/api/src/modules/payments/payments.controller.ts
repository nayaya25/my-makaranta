import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { PaymentsService } from "./payments.service";
import { RecordPaymentDto, InitializeOnlineDto, VerifyPaymentDto } from "./dto/payments.dto";

@Controller("v1/payments")
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post("record")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  record(@Body() dto: RecordPaymentDto, @CurrentUser() user: RequestUser) {
    return this.service.recordOfflinePayment(dto, user);
  }

  @Post("initialize")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  initialize(@Body() dto: InitializeOnlineDto, @CurrentUser() user: RequestUser) {
    return this.service.initializeOnline(dto, user);
  }

  @Post("verify")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.manage")
  verify(@Body() dto: VerifyPaymentDto, @CurrentUser() user: RequestUser) {
    return this.service.verifyPayment(dto.reference, user);
  }

  @Get("by-invoice")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.view")
  byInvoice(@Query("invoiceId") invoiceId: string) {
    return this.service.getPayments(invoiceId);
  }
}
