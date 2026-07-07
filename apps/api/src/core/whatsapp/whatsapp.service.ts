import { Injectable, Logger } from "@nestjs/common";

/** WhatsApp sender. Provider chosen by WHATSAPP_PROVIDER: "mock" (dev/test) or "meta" (Cloud API).
 *  Meta requires a pre-approved template; the composed message is passed as the single body param. */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private get provider() { return process.env.WHATSAPP_PROVIDER ?? "mock"; }

  async send(phone: string, message: string): Promise<void> {
    if (this.provider === "meta") { await this.sendViaMeta(phone, message); return; }
    this.logger.log(`[MOCK WHATSAPP] to ${phone}: ${message}`);
  }

  private async sendViaMeta(phone: string, message: string): Promise<void> {
    const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: message }] }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }
}
