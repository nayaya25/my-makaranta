import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";
import { ImportsWorker } from "./imports.worker";

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsWorker],
})
export class ImportsModule {}
