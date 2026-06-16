import { Global, Module } from "@nestjs/common";
import { PAYMENT_SERVICE } from "./payments.types";
import { MockPaymentAdapter } from "./mock.adapter";
import { PaystackPaymentAdapter } from "./paystack.adapter";

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_SERVICE,
      useFactory: () => {
        const provider = process.env.PAYMENTS_PROVIDER;
        if (process.env.NODE_ENV === "production" && provider !== "paystack") {
          throw new Error('Refusing to start: PAYMENTS_PROVIDER must be "paystack" in production.');
        }
        return provider === "paystack" ? new PaystackPaymentAdapter() : new MockPaymentAdapter();
      },
    },
  ],
  exports: [PAYMENT_SERVICE],
})
export class PaymentsProviderModule {}
