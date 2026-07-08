/**
 * Engagement EN-3a Task 2 — NotificationDispatchService
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest notification-dispatch.service --runInBand
 */
import { SmsService } from "../auth/sms.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { LogEmailAdapter } from "../email/log.adapter";
import { NotificationDispatchService } from "./notification-dispatch.service";

let sms: SmsService;
let whatsapp: WhatsAppService;
let email: LogEmailAdapter;
let service: NotificationDispatchService;

beforeEach(() => {
  sms = new SmsService();
  whatsapp = new WhatsAppService();
  email = new LogEmailAdapter();
  service = new NotificationDispatchService(sms, email, whatsapp);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("NotificationDispatchService.sendToRecipient", () => {
  it("sends only the requested channels and reports what was sent", async () => {
    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);
    const emailSpy = jest.spyOn(email, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await service.sendToRecipient(
      { phone: "+2348020000001", email: "parent@example.com" },
      "Subject",
      "Message body",
      ["EMAIL", "WHATSAPP"],
    );

    expect(smsSpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledWith({
      to: "parent@example.com",
      subject: "Subject",
      html: "<p>Message body</p>",
      text: "Message body",
    });
    expect(whatsappSpy).toHaveBeenCalledWith("+2348020000001", "Message body");
    expect(result).toEqual({ smsSent: false, emailSent: true, whatsappSent: true });
  });

  it("sends SMS when requested", async () => {
    const smsSpy = jest.spyOn(sms, "send").mockResolvedValue(undefined);

    const result = await service.sendToRecipient(
      { phone: "+2348020000002", email: null },
      "Subject",
      "Message",
      ["SMS"],
    );

    expect(smsSpy).toHaveBeenCalledWith("+2348020000002", "Message");
    expect(result.smsSent).toBe(true);
  });

  it("does not send EMAIL when recipient has no email, even if requested", async () => {
    const emailSpy = jest.spyOn(email, "send").mockResolvedValue(undefined);

    const result = await service.sendToRecipient(
      { phone: "+2348020000003", email: null },
      "Subject",
      "Message",
      ["EMAIL"],
    );

    expect(emailSpy).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
  });

  it("isolates a throwing channel — its flag is false but others still succeed", async () => {
    jest.spyOn(sms, "send").mockRejectedValue(new Error("sms provider down"));
    const emailSpy = jest.spyOn(email, "send").mockResolvedValue(undefined);
    const whatsappSpy = jest.spyOn(whatsapp, "send").mockResolvedValue(undefined);

    const result = await service.sendToRecipient(
      { phone: "+2348020000004", email: "parent4@example.com" },
      "Subject",
      "Message",
      ["SMS", "EMAIL", "WHATSAPP"],
    );

    expect(result.smsSent).toBe(false);
    expect(result.emailSent).toBe(true);
    expect(result.whatsappSent).toBe(true);
    expect(emailSpy).toHaveBeenCalled();
    expect(whatsappSpy).toHaveBeenCalled();
  });

  it("returns all-false when no channels are requested", async () => {
    const result = await service.sendToRecipient(
      { phone: "+2348020000005", email: "parent5@example.com" },
      "Subject",
      "Message",
      [],
    );
    expect(result).toEqual({ smsSent: false, emailSent: false, whatsappSent: false });
  });
});
