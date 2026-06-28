import { Module } from "@nestjs/common";
import { SignupController } from "./signup.controller";
import { SignupService } from "./signup.service";
import { PasswordService } from "../../core/auth/password.service";

@Module({
  controllers: [SignupController],
  providers: [SignupService, PasswordService],
})
export class SignupModule {}
