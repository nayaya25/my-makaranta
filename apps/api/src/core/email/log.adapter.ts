import { Logger } from "@nestjs/common";
import type { EmailMessage, EmailService } from "./email.types";

/** Dev/test email: logs instead of sending. */
export class LogEmailAdapter implements EmailService {
  private readonly logger = new Logger("Email");
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`[LOG EMAIL] to ${message.to}: ${message.subject}`);
  }
}
