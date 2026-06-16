import { Global, Module } from "@nestjs/common";
import { PAYMENT_SERVICE } from "./payments.types";
import { MockPaymentAdapter } from "./mock.adapter";
import { PaystackPaymentAdapter } from "./paystack.adapter";

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_SERVICE,
      useFactory: () =>
        process.env.PAYMENTS_PROVIDER === "paystack" ? new PaystackPaymentAdapter() : new MockPaymentAdapter(),
    },
  ],
  exports: [PAYMENT_SERVICE],
})
export class PaymentsProviderModule {}
