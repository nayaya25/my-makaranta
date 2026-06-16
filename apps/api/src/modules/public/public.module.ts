import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [PaymentsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
