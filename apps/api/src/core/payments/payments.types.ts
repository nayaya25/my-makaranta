export const PAYMENT_SERVICE = Symbol("PAYMENT_SERVICE");

export interface InitializeArgs { reference: string; amountKobo: number; email: string; metadata?: Record<string, unknown>; }
export interface VerifyResult { status: "success" | "failed" | "pending"; amountKobo: number; }

export interface PaymentProvider {
  initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<VerifyResult>;
  verifySignature(rawBody: Buffer, signature: string): boolean;
}
