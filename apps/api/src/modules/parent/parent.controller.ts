import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsEmail, IsInt, IsNotEmpty, IsString, Min } from "class-validator";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ParentService } from "./parent.service";
import { renderStatementPdf } from "./statement-pdf";

class ParentPayDto {
  @IsString() @IsNotEmpty() invoiceId!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsEmail() email!: string;
}

class ParentPayVerifyDto {
  @IsString() @IsNotEmpty() reference!: string;
}

@Controller("v1/parent")
export class ParentController {
  constructor(private service: ParentService) {}

  @Get("children")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  children(@CurrentUser() user: RequestUser) {
    return this.service.getChildren(user);
  }

  @Get("invoices")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  invoices(@CurrentUser() user: RequestUser) {
    return this.service.getInvoices(user);
  }

  @Get("invoices/:invoiceId")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  invoiceDetail(@Param("invoiceId") invoiceId: string, @CurrentUser() user: RequestUser) {
    return this.service.getInvoiceDetail(invoiceId, user);
  }

  @Get("receipts")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  receipts(@CurrentUser() user: RequestUser) {
    return this.service.getReceipts(user);
  }

  @Get("children/:studentId/statement.pdf")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  async statement(
    @Param("studentId") studentId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.service.buildStatement(studentId, user);
    const buffer = await renderStatementPdf(data);

    const rawFilename = `statement-${data.student.admissionNo}.pdf`;
    const filename = rawFilename.replace(/[^a-zA-Z0-9.\-_]/g, "-");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }

  @Post("pay")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  pay(@Body() dto: ParentPayDto, @CurrentUser() user: RequestUser) {
    return this.service.pay(dto, user);
  }

  @Post("pay/verify")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("fees.pay.own")
  payVerify(@Body() dto: ParentPayVerifyDto, @CurrentUser() user: RequestUser) {
    return this.service.payVerify(dto.reference, user);
  }
}
