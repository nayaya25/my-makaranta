import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SmsService } from "./sms.service";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsService } from "./permissions/permissions.service";
import { PermissionGuard } from "./permissions/permission.guard";
import { PasswordService } from "./password.service";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [PassportModule, IdentityModule],
  controllers: [AuthController],
  providers: [AuthService, SmsService, JwtStrategy, PermissionsService, PermissionGuard, PasswordService],
  exports: [AuthService, SmsService, PermissionsService, PermissionGuard, PasswordService],
})
export class AuthModule {}
