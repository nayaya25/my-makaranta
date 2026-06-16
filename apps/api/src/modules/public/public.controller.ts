import { Controller, Get, Headers, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsService } from "../payments/payments.service";
import { PublicService } from "./public.service";

@Controller("v1/public")
export class PublicController {
  constructor(
    private service: PublicService,
    private payments: PaymentsService,
  ) {}

  @Get("verify/:code")
  verify(@Param("code") code: string) {
    return this.service.verify(code);
  }

  @Post("payments/webhook")
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-paystack-signature") signature: string) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    try {
      return await this.payments.handleWebhook(raw, signature ?? "");
    } catch {
      throw new UnauthorizedException("Invalid signature.");
    }
  }

  @Get("receipt/:code")
  receipt(@Param("code") code: string) {
    return this.payments.getReceipt(code);
  }
}
