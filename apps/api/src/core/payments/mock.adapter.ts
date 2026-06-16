import { Injectable } from "@nestjs/common";
import type { InitializeArgs, PaymentProvider, VerifyResult } from "./payments.types";

@Injectable()
export class MockPaymentAdapter implements PaymentProvider {
  async initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }> {
    return { authorizationUrl: `/pay/mock/${args.reference}` };
  }
  async verify(reference: string): Promise<VerifyResult> {
    return { status: reference ? "success" : "failed", amountKobo: 0 };
  }
  verifySignature(_rawBody: Buffer, signature: string): boolean {
    return signature === (process.env.PAYMENTS_MOCK_WEBHOOK_TOKEN ?? "mock-signature");
  }
}
