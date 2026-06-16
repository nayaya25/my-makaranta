import { MockPaymentAdapter } from "./mock.adapter";
describe("MockPaymentAdapter", () => {
  const a = new MockPaymentAdapter();
  it("initializes a local url containing the reference", async () => {
    expect((await a.initialize({ reference: "REF1", amountKobo: 1000, email: "x@y.z" })).authorizationUrl).toContain("REF1");
  });
  it("verifies a non-empty reference as success", async () => {
    expect((await a.verify("REF1")).status).toBe("success");
  });
  it("accepts the mock webhook token and rejects others", () => {
    expect(a.verifySignature(Buffer.from("{}"), "mock-signature")).toBe(true);
    expect(a.verifySignature(Buffer.from("{}"), "wrong")).toBe(false);
  });
});
