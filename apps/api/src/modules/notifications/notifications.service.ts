import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { EMAIL_SERVICE, type EmailService } from "../../core/email/email.types";
import { NotificationSettingsService } from "./notification-settings.service";
import { lagosDateStr, shiftDateStr } from "./notify-date.util";
import { allocatePayments, type InstallmentRow } from "../fees/installment.util";

function naira(kobo: number): string {
  return `₦${new Intl.NumberFormat("en-NG").format(Math.round(kobo / 100))}`;
}

type Recipient = { phone: string; email: string | null };

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private whatsapp: WhatsAppService,
    @Inject(EMAIL_SERVICE) private email: EmailService,
    private settings: NotificationSettingsService,
  ) {}

  /** Delivers a message to each recipient over the requested channels. Per-recipient
   *  failures are swallowed (non-fatal) so one bad phone/email doesn't block the rest. */
  async deliver(
    _schoolId: string,
    recipients: Recipient[],
    subject: string,
    message: string,
    channels: string[],
  ): Promise<{ recipientCount: number; channelsUsed: string[] }> {
    const channelsUsed = new Set<string>();
    let recipientCount = 0;
    for (const r of recipients) {
      let delivered = false;
      if (channels.includes("SMS")) {
        try {
          await this.sms.send(r.phone, message);
          channelsUsed.add("SMS");
          delivered = true;
        } catch {
          /* per-recipient failure non-fatal */
        }
      }
      if (channels.includes("EMAIL") && r.email) {
        try {
          await this.email.send({ to: r.email, subject, html: `<p>${message}</p>`, text: message });
          channelsUsed.add("EMAIL");
          delivered = true;
        } catch {
          /* per-recipient failure non-fatal */
        }
      }
      if (channels.includes("WHATSAPP")) {
        try {
          await this.whatsapp.send(r.phone, message);
          channelsUsed.add("WHATSAPP");
          delivered = true;
        } catch {
          /* per-recipient failure non-fatal */
        }
      }
      if (delivered) recipientCount++;
    }
    return { recipientCount, channelsUsed: [...channelsUsed] };
  }

  /** Nightly job: iterates all schools (no TenantContext), scoping every query by
   *  school.id explicitly, and sends installment-aware fee reminders per offset. */
  async runFeeReminders(now: Date): Promise<void> {
    const today = lagosDateStr(now);
    const schools = await this.prisma.school.findMany({ select: { id: true } });

    for (const school of schools) {
      const settings = await this.settings.get(school.id);
      if (!settings.feeRemindersEnabled) continue;

      for (const offset of settings.reminderOffsetDays) {
        const targetDate = shiftDateStr(today, -offset);
        await this.processFeeReminderOffset(school.id, offset, targetDate, settings.channels);
      }
    }
  }

  private async processFeeReminderOffset(
    schoolId: string,
    offset: number,
    targetDate: string,
    channels: string[],
  ): Promise<void> {
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId },
      include: {
        installments: { orderBy: { order: "asc" } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            guardians: { include: { parent: { select: { phone: true, email: true } } } },
          },
        },
      },
    });

    for (const invoice of invoices) {
      const balanceKobo = invoice.totalKobo - invoice.paidKobo;
      if (balanceKobo <= 0) continue;

      if (invoice.installments.length === 0) {
        if (!invoice.dueDate || lagosDateStr(invoice.dueDate) !== targetDate) continue;
        await this.sendFeeReminder({
          schoolId,
          offset,
          targetDate,
          channels,
          dedupeId: invoice.id,
          studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
          amountKobo: balanceKobo,
          dueDate: invoice.dueDate,
          isInstallment: false,
          guardians: invoice.student.guardians,
        });
        continue;
      }

      const rows: InstallmentRow[] = invoice.installments.map((i) => ({
        order: i.order,
        label: i.label,
        amountKobo: i.amountKobo,
        dueDate: i.dueDate,
      }));
      const allocated = allocatePayments(invoice.paidKobo, rows, new Date());

      for (let idx = 0; idx < invoice.installments.length; idx++) {
        const installment = invoice.installments[idx]!;
        if (lagosDateStr(installment.dueDate) !== targetDate) continue;
        const alloc = allocated[idx]!;
        const outstanding = alloc.amountKobo - alloc.paidKobo;
        if (outstanding <= 0) continue;

        await this.sendFeeReminder({
          schoolId,
          offset,
          targetDate,
          channels,
          dedupeId: installment.id,
          studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
          amountKobo: outstanding,
          dueDate: installment.dueDate,
          isInstallment: true,
          guardians: invoice.student.guardians,
        });
      }
    }
  }

  private async sendFeeReminder(args: {
    schoolId: string;
    offset: number;
    targetDate: string;
    channels: string[];
    dedupeId: string;
    studentName: string;
    amountKobo: number;
    dueDate: Date;
    isInstallment: boolean;
    guardians: { parent: { phone: string; email: string | null } }[];
  }): Promise<void> {
    const { schoolId, offset, targetDate, channels, dedupeId, studentName, amountKobo, dueDate, isInstallment, guardians } = args;
    const dedupeKey = `FEE_REMINDER:${dedupeId}:${offset}:${targetDate}`;

    try {
      await this.prisma.notificationLog.create({
        data: { schoolId, kind: "FEE_REMINDER", dedupeKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return; // already claimed by a previous run
      }
      throw e;
    }

    const dueDateStr = dueDate.toISOString().slice(0, 10);
    const what = isInstallment ? "fees installment" : "fees balance";
    const message = `Dear Parent, ${studentName}'s ${what} of ${naira(amountKobo)} is due ${dueDateStr}. Kindly settle it. Thank you.`;
    const recipients: Recipient[] = guardians.map((g) => ({ phone: g.parent.phone, email: g.parent.email }));

    const { recipientCount, channelsUsed } = await this.deliver(
      schoolId,
      recipients,
      "Fees reminder",
      message,
      channels,
    );

    await this.prisma.notificationLog.update({
      where: { schoolId_dedupeKey: { schoolId, dedupeKey } },
      data: { recipientCount, channels: channelsUsed.join(",") },
    });
  }

  /** Called after a Release is committed (EY or numeric path). Notifies guardians of every
   *  student enrolled in (classId, termId) that results are ready. Deduped per student per
   *  release; non-fatal from the caller's perspective (caller wraps in try/catch). */
  async notifyResultsReady(schoolId: string, releaseId: string, classId: string, termId: string): Promise<void> {
    const settings = await this.settings.get(schoolId);
    if (!settings.resultsReadyEnabled) return;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, termId, class: { schoolId } },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            guardians: { include: { parent: { select: { phone: true, email: true } } } },
          },
        },
      },
    });

    for (const enrollment of enrollments) {
      const dedupeKey = `RESULTS_READY:${releaseId}:${enrollment.studentId}`;

      try {
        await this.prisma.notificationLog.create({
          data: { schoolId, kind: "RESULTS_READY", dedupeKey },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          continue; // already claimed by a previous call
        }
        throw e;
      }

      const studentName = `${enrollment.student.firstName} ${enrollment.student.lastName}`;
      const message = `Dear Parent, ${studentName}'s results are now ready. Please log in to view the report card.`;
      const recipients: Recipient[] = enrollment.student.guardians.map((g) => ({
        phone: g.parent.phone,
        email: g.parent.email,
      }));

      const { recipientCount, channelsUsed } = await this.deliver(
        schoolId,
        recipients,
        "Results ready",
        message,
        settings.channels,
      );

      await this.prisma.notificationLog.update({
        where: { schoolId_dedupeKey: { schoolId, dedupeKey } },
        data: { recipientCount, channels: channelsUsed.join(",") },
      });
    }
  }
}
