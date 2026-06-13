import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { RequestOtpDto, VerifyOtpDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("auth/otp/request")
  @HttpCode(204)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp(dto.phone);
  }

  @Post("auth/otp/verify")
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return req.user;
  }
}
