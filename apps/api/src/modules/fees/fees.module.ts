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
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { DiscountsController } from "./discounts.controller";
import { DiscountsService } from "./discounts.service";
import { InstallmentScheduleController } from "./installment-schedule.controller";
import { InstallmentScheduleService } from "./installment-schedule.service";

@Module({
  imports: [AuthModule, EmailModule, PaymentsModule],
  controllers: [
    FeesController,
    CollectionsController,
    ReconciliationController,
    FinanceController,
    DiscountsController,
    InstallmentScheduleController,
  ],
  providers: [FeesService, CollectionsService, ReconciliationService, FinanceService, DiscountsService, InstallmentScheduleService],
})
export class FeesModule {}
