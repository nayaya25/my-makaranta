import { Injectable, Logger } from "@nestjs/common";

/** Phone SMS sender. Provider chosen by SMS_PROVIDER: "mock" (dev/test) or "termii" (prod). */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider = process.env.SMS_PROVIDER ?? "mock";
  // Termii issues a per-account base URL (regulatory region) — read it from the dashboard.
  private readonly termiiBase = (process.env.TERMII_BASE_URL ?? "https://v3.api.termii.com").replace(/\/$/, "");
  // OTPs MUST go via the "dnd" route: "generic" won't deliver to DND numbers and is
  // time-restricted on MTN (8PM–8AM). The dnd route must be activated on the Termii account.
  private readonly termiiChannel = process.env.TERMII_CHANNEL ?? "dnd";
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
    const res = await fetch(`${this.termiiBase}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: phone.replace(/^\+/, ""), // international format, no leading +
        from: process.env.TERMII_SENDER_ID ?? "myMakaranta",
        sms: message,
        type: "plain",
        channel: this.termiiChannel,
        api_key: process.env.TERMII_API_KEY,
      }),
    });
    if (!res.ok) {
      throw new Error(`Termii send failed: ${res.status} ${await res.text()}`);
    }
  }
}
