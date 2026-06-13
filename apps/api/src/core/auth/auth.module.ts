import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SmsService } from "./sms.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, SmsService, JwtStrategy],
  exports: [AuthService, SmsService],
})
export class AuthModule {}
