import type { EmailMessage, EmailService } from "./email.types";

/** Production email via the Mailgun HTTP API. */
export class MailgunEmailAdapter implements EmailService {
  private readonly domain = process.env.MAILGUN_DOMAIN!;
  private readonly apiKey = process.env.MAILGUN_API_KEY!;
  private readonly from = process.env.MAILGUN_FROM ?? "noreply@mymakaranta.com";
  // US by default; set https://api.eu.mailgun.net for EU-region Mailgun domains.
  // We append /v3 ourselves, so tolerate a base that already includes a trailing /v3
  // (the value other Mailgun setups use) to avoid a double /v3 -> 404.
  private readonly base = (process.env.MAILGUN_BASE_URL ?? "https://api.mailgun.net")
    .replace(/\/+$/, "")
    .replace(/\/v3$/, "");

  async send(message: EmailMessage): Promise<void> {
    const form = new URLSearchParams({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (message.text) form.set("text", message.text);

    const res = await fetch(`${this.base}/v3/${this.domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      throw new Error(`Mailgun send failed: ${res.status} ${await res.text()}`);
    }
  }
}
