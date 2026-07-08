import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PreferenceService } from "../../core/notification-dispatch/preference.service";
import { NotificationDispatchService } from "../../core/notification-dispatch/notification-dispatch.service";
import { NotificationSettingsService } from "../notifications/notification-settings.service";
import { computeInvoiceStatus } from "./invoice-status.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

function naira(kobo: number): string {
  return `₦${new Intl.NumberFormat("en-NG").format(Math.round(kobo / 100))}`;
}

type Recipient = { parentId?: string | null; phone: string; email: string | null };

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private settings: NotificationSettingsService,
    private preferences: PreferenceService,
    private dispatch: NotificationDispatchService,
  ) {}

  private async termOr404(schoolId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId }, include: { academicYear: { select: { name: true } } } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    return term;
  }

  async setDueDate(termId: string, dueDate: Date) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const r = await this.prisma.invoice.updateMany({ where: { schoolId, termId }, data: { dueDate } });
    return { updated: r.count };
  }

  async getCollections(termId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        reminders: { orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } },
      },
    });
    const rows = invoices.map((i) => ({
      invoiceId: i.id,
      studentId: i.studentId,
      name: `${i.student.firstName} ${i.student.lastName}`,
      totalKobo: i.totalKobo,
      paidKobo: i.paidKobo,
      balanceKobo: i.totalKobo - i.paidKobo,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      status: computeInvoiceStatus({ totalKobo: i.totalKobo, paidKobo: i.paidKobo, dueDate: i.dueDate, now }),
      lastRemindedAt: i.reminders[0]?.sentAt.toISOString() ?? null,
    }));
    const rank = (s: string) => (s === "OVERDUE" ? 0 : 1);
    rows.sort((a, b) => rank(a.status) - rank(b.status) || b.balanceKobo - a.balanceKobo);
    return rows;
  }

  async sendReminder(invoiceId: string, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        term: { select: { number: true, academicYear: { select: { name: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found in this school.");
    const balance = invoice.totalKobo - invoice.paidKobo;
    if (balance <= 0) throw new BadRequestException("Nothing outstanding on this invoice.");

    const guardians = await this.prisma.guardian.findMany({
      where: { studentId: invoice.student.id },
      include: { parent: { select: { phone: true, email: true } } },
    });
    const termLabel = `${invoice.term.academicYear.name} · Term ${invoice.term.number}`;
    const msg = `Dear Parent, ${invoice.student.firstName} ${invoice.student.lastName}'s ${termLabel} fees balance is ${naira(balance)}. Kindly settle it. Thank you.`;

    const base = (await this.settings.get(schoolId)).channels;
    const recipients: Recipient[] = guardians.map((g) => ({
      parentId: g.parentId,
      phone: g.parent.phone,
      email: g.parent.email,
    }));
    const parentIds = recipients.map((r) => r.parentId).filter((id): id is string => Boolean(id));
    const prefs = await this.preferences.loadPreferences(schoolId, parentIds);

    const channels = new Set<string>();
    let recipientCount = 0;
    for (const r of recipients) {
      const eff = this.preferences.effectiveChannels(
        r.parentId ? prefs.get(r.parentId) : undefined,
        "FEE_REMINDER",
        base,
      );
      if (eff.length === 0) continue;

      const res = await this.dispatch.sendToRecipient(r, `Fees reminder — ${termLabel}`, msg, eff);
      let delivered = false;
      if (res.smsSent) {
        channels.add("SMS");
        delivered = true;
      }
      if (res.emailSent) {
        channels.add("EMAIL");
        delivered = true;
      }
      if (res.whatsappSent) {
        channels.add("WHATSAPP");
        delivered = true;
      }
      if (delivered) recipientCount++;
    }
    await this.prisma.feeReminder.create({ data: { schoolId, invoiceId, sentBy: actor.id, recipientCount, channels: [...channels].join(",") } });
    return { recipientCount };
  }

  async sendBulkReminders(termId: string, actor: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.termOr404(schoolId, termId);
    const invoices = await this.prisma.invoice.findMany({ where: { schoolId, termId }, select: { id: true, totalKobo: true, paidKobo: true } });
    let remindersSent = 0, totalRecipients = 0;
    for (const i of invoices) {
      if (i.totalKobo - i.paidKobo <= 0) continue;
      const r = await this.sendReminder(i.id, actor);
      remindersSent++;
      totalRecipients += r.recipientCount;
    }
    return { remindersSent, totalRecipients };
  }
}
