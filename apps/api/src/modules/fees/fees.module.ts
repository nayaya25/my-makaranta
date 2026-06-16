import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { EmailModule } from "../../core/email/email.module";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";
import { CollectionsController } from "./collections.controller";
import { CollectionsService } from "./collections.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [FeesController, CollectionsController],
  providers: [FeesService, CollectionsService],
})
export class FeesModule {}
