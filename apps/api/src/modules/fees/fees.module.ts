import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { EmailModule } from "../../core/email/email.module";
import { PaymentsModule } from "../payments/payments.module";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";
import { CollectionsController } from "./collections.controller";
import { CollectionsService } from "./collections.service";
import { ReconciliationController } from "./reconciliation.controller";
import { ReconciliationService } from "./reconciliation.service";

@Module({
  imports: [AuthModule, EmailModule, PaymentsModule],
  controllers: [FeesController, CollectionsController, ReconciliationController],
  providers: [FeesService, CollectionsService, ReconciliationService],
})
export class FeesModule {}
