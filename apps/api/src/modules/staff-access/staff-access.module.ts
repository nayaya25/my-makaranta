import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { StaffAccessController } from "./staff-access.controller";
import { StaffAccessService } from "./staff-access.service";

@Module({ imports: [AuthModule], controllers: [StaffAccessController], providers: [StaffAccessService] })
export class StaffAccessModule {}
