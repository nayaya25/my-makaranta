import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RequestOtpDto, VerifyOtpDto, PasswordLoginDto, SwitchContextDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, type RequestUser } from "./current-user.decorator";

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("auth/login")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  login(@Body() dto: PasswordLoginDto) {
    return this.auth.loginWithPassword(dto.schoolId, dto.identifier, dto.password);
  }

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

  @Post("v1/auth/context")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  switchContext(@CurrentUser() user: RequestUser, @Body() dto: SwitchContextDto) {
    return this.auth.switchContext(user.personId ?? user.id, dto.membershipId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return req.user;
  }
}
