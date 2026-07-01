import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsPublicController } from "./admissions-public.controller";
import { AdmissionsService } from "./admissions.service";

@Module({
  imports: [AuthModule],
  controllers: [AdmissionsController, AdmissionsPublicController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
