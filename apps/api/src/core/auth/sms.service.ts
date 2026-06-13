import { Injectable, Logger } from "@nestjs/common";

/** Phone SMS sender. Provider chosen by SMS_PROVIDER: "mock" (dev/test) or "termii" (prod). */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider = process.env.SMS_PROVIDER ?? "mock";
  private readonly lastCode = new Map<string, string>();

  async send(phone: string, message: string): Promise<void> {
    const code = message.match(/(\d{6})/)?.[1];
    if (code) this.lastCode.set(phone, code);

    if (this.provider === "termii") {
      await this.sendViaTermii(phone, message);
      return;
    }
    this.logger.log(`[MOCK SMS] to ${phone}: ${message}`);
  }

  /** Test-only: read the last 6-digit code sent to a phone. Disabled outside NODE_ENV=test. */
  lastCodeForTest(phone: string): string | undefined {
    if (process.env.NODE_ENV !== "test") return undefined;
    return this.lastCode.get(phone);
  }

  private async sendViaTermii(phone: string, message: string): Promise<void> {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: phone.replace(/^\+/, ""),
        from: process.env.TERMII_SENDER_ID ?? "myMakaranta",
        sms: message,
        type: "plain",
        channel: "generic",
        api_key: process.env.TERMII_API_KEY,
      }),
    });
    if (!res.ok) {
      throw new Error(`Termii send failed: ${res.status} ${await res.text()}`);
    }
  }
}
