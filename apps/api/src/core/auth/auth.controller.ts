import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RequestOtpDto, VerifyOtpDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("auth/otp/request")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(204)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp({ phone: dto.phone, email: dto.email });
  }

  @Post("auth/otp/verify")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp({ phone: dto.phone, email: dto.email }, dto.code);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return req.user;
  }
}
