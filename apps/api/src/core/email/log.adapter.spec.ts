import { LogEmailAdapter } from "./log.adapter";

describe("LogEmailAdapter", () => {
  it("records sent messages", async () => {
    const email = new LogEmailAdapter();
    await email.send({ to: "p@example.com", subject: "Results released", html: "<b>hi</b>" });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.subject).toBe("Results released");
  });
});
