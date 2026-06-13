import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SmsService } from "./sms.service";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsService } from "./permissions/permissions.service";
import { PermissionGuard } from "./permissions/permission.guard";

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, SmsService, JwtStrategy, PermissionsService, PermissionGuard],
  exports: [AuthService, SmsService, PermissionsService, PermissionGuard],
})
export class AuthModule {}
