import { Inject, Injectable } from "@nestjs/common";
import { SmsService } from "../auth/sms.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { EMAIL_SERVICE, type EmailService } from "../email/email.types";

export interface DispatchRecipient {
  parentId?: string | null;
  phone: string;
  email: string | null;
}

export interface DispatchResult {
  smsSent: boolean;
  emailSent: boolean;
  whatsappSent: boolean;
}

@Injectable()
export class NotificationDispatchService {
  constructor(
    private sms: SmsService,
    @Inject(EMAIL_SERVICE) private email: EmailService,
    private whatsapp: WhatsAppService,
  ) {}

  /** Sends a message to one recipient over the given channels. Each channel is attempted
   *  independently and failures are swallowed (non-fatal) — one bad phone/email/provider
   *  outage doesn't block the others. */
  async sendToRecipient(
    recipient: DispatchRecipient,
    subject: string,
    message: string,
    channels: string[],
  ): Promise<DispatchResult> {
    const result: DispatchResult = { smsSent: false, emailSent: false, whatsappSent: false };

    if (channels.includes("SMS")) {
      try {
        await this.sms.send(recipient.phone, message);
        result.smsSent = true;
      } catch {
        /* per-recipient failure non-fatal */
      }
    }

    if (channels.includes("EMAIL") && recipient.email) {
      try {
        await this.email.send({ to: recipient.email, subject, html: `<p>${message}</p>`, text: message });
        result.emailSent = true;
      } catch {
        /* per-recipient failure non-fatal */
      }
    }

    if (channels.includes("WHATSAPP")) {
      try {
        await this.whatsapp.send(recipient.phone, message);
        result.whatsappSent = true;
      } catch {
        /* per-recipient failure non-fatal */
      }
    }

    return result;
  }
}
