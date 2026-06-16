import { createHmac } from "node:crypto";
import { PaystackPaymentAdapter } from "./paystack.adapter";
describe("PaystackPaymentAdapter.verifySignature", () => {
  const prev = process.env.PAYSTACK_SECRET_KEY;
  beforeAll(() => { process.env.PAYSTACK_SECRET_KEY = "sk_test_x"; });
  afterAll(() => { process.env.PAYSTACK_SECRET_KEY = prev; });
  const a = new PaystackPaymentAdapter();
  it("accepts a correct HMAC-SHA512 signature and rejects tampered/empty", () => {
    const body = Buffer.from(JSON.stringify({ event: "charge.success" }));
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(a.verifySignature(body, sig)).toBe(true);
    expect(a.verifySignature(body, sig.replace(/.$/, "0"))).toBe(false);
    expect(a.verifySignature(body, "")).toBe(false);
  });
});
