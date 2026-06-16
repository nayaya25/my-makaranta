import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { InitializeArgs, PaymentProvider, VerifyResult } from "./payments.types";

const BASE = "https://api.paystack.co";

@Injectable()
export class PaystackPaymentAdapter implements PaymentProvider {
  private get key(): string {
    const k = process.env.PAYSTACK_SECRET_KEY;
    if (!k) throw new Error("PAYSTACK_SECRET_KEY is not set");
    return k;
  }

  async initialize(args: InitializeArgs): Promise<{ authorizationUrl: string }> {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: args.reference, amount: args.amountKobo, email: args.email, metadata: args.metadata }),
    });
    if (!res.ok) throw new Error(`Paystack initialize failed: ${res.status}`);
    const json = (await res.json()) as { data?: { authorization_url?: string } };
    const url = json.data?.authorization_url;
    if (!url) throw new Error("Paystack initialize returned no authorization_url");
    return { authorizationUrl: url };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok) throw new Error(`Paystack verify failed: ${res.status}`);
    const json = (await res.json()) as { data?: { status?: string; amount?: number } };
    const s = json.data?.status;
    const status: VerifyResult["status"] = s === "success" ? "success" : s === "failed" ? "failed" : "pending";
    return { status, amountKobo: json.data?.amount ?? 0 };
  }

  verifySignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac("sha512", this.key).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
