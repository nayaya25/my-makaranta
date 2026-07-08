import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Announcement } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { WhatsAppService } from "../../core/whatsapp/whatsapp.service";
import { EMAIL_SERVICE, type EmailService } from "../../core/email/email.types";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import type { CreateAnnouncementDto } from "./dto";

interface Recipient { recipientType: "PARENT" | "STAFF"; recipientId: string; }

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private whatsapp: WhatsAppService,
    @Inject(EMAIL_SERVICE) private email: EmailService,
  ) {}

  private async resolveParentIds(dto: CreateAnnouncementDto, schoolId: string): Promise<string[]> {
    let studentIds: string[];
    if (dto.audienceType === "ALL") {
      studentIds = (await this.prisma.student.findMany({ where: { schoolId }, select: { id: true } })).map((s) => s.id);
    } else {
      const ids = dto.audienceIds ?? [];
      if (ids.length === 0) throw new BadRequestException("Select at least one class or level.");
      if (dto.audienceType === "LEVEL") {
        const levels = await this.prisma.classLevel.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true } });
        if (levels.length !== ids.length) throw new BadRequestException("Invalid audience.");
        const term = await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
        if (!term) return [];
        studentIds = (await this.prisma.enrollment.findMany({ where: { termId: term.id, class: { schoolId, classLevelId: { in: ids } } }, select: { studentId: true } })).map((e) => e.studentId);
      } else {
        const classes = await this.prisma.class.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true } });
        if (classes.length !== ids.length) throw new BadRequestException("Invalid audience.");
        const term = await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
        if (!term) return [];
        studentIds = (await this.prisma.enrollment.findMany({ where: { termId: term.id, classId: { in: ids } }, select: { studentId: true } })).map((e) => e.studentId);
      }
    }
    if (studentIds.length === 0) return [];
    const guardians = await this.prisma.guardian.findMany({ where: { studentId: { in: studentIds }, student: { schoolId } }, select: { parentId: true } });
    const candidateIds = [...new Set(guardians.map((g) => g.parentId))];
    if (candidateIds.length === 0) return [];
    const parents = await this.prisma.parent.findMany({ where: { schoolId, id: { in: candidateIds } }, select: { id: true } });
    return parents.map((p) => p.id);
  }

  private async resolveRecipients(dto: CreateAnnouncementDto, schoolId: string): Promise<Recipient[]> {
    const roles = dto.roles && dto.roles.length ? dto.roles : ["PARENT"];
    const out: Recipient[] = [];
    if (roles.includes("PARENT")) {
      for (const id of await this.resolveParentIds(dto, schoolId)) out.push({ recipientType: "PARENT", recipientId: id });
    }
    if (roles.includes("STAFF")) {
      const staff = await this.prisma.staff.findMany({ where: { schoolId }, select: { id: true } });
      for (const s of staff) out.push({ recipientType: "STAFF", recipientId: s.id });
    }
    return out;
  }

  /**
   * Delivers an already-persisted announcement's SMS/email to its recipients.
   * Reused by both immediate `create` delivery and `dispatchScheduledAnnouncements`.
   */
  private async deliverAnnouncement(ann: Announcement, recipients: Recipient[]): Promise<void> {
    const schoolId = ann.schoolId;
    const selected = ann.channels.filter((c) => c === "SMS" || c === "EMAIL" || c === "WHATSAPP");
    const wantSms = selected.includes("SMS");
    const wantEmail = selected.includes("EMAIL");
    const wantWhatsapp = selected.includes("WHATSAPP");
    if (!(wantSms || wantEmail || wantWhatsapp) || recipients.length === 0) return;
    const parentIds = recipients.filter((r) => r.recipientType === "PARENT").map((r) => r.recipientId);
    const staffIds = recipients.filter((r) => r.recipientType === "STAFF").map((r) => r.recipientId);
    const [parents, staff] = await Promise.all([
      parentIds.length ? this.prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { id: true, phone: true, email: true } }) : Promise.resolve([]),
      staffIds.length ? this.prisma.staff.findMany({ where: { schoolId, id: { in: staffIds } }, select: { id: true, phone: true, email: true } }) : Promise.resolve([]),
    ]);
    const contacts: { type: "PARENT" | "STAFF"; id: string; phone: string; email: string | null }[] = [
      ...parents.map((p) => ({ type: "PARENT" as const, id: p.id, phone: p.phone, email: p.email })),
      ...staff.map((s) => ({ type: "STAFF" as const, id: s.id, phone: s.phone, email: s.email })),
    ];
    const text = `${ann.title} — ${ann.body}`;
    for (const c of contacts) {
      let smsSent = false;
      let emailSent = false;
      let whatsappSent = false;
      if (wantSms) { try { await this.sms.send(c.phone, text); smsSent = true; } catch { /* non-fatal */ } }
      if (wantEmail && c.email) { try { await this.email.send({ to: c.email, subject: ann.title, html: `<p>${ann.body}</p>`, text }); emailSent = true; } catch { /* non-fatal */ } }
      if (wantWhatsapp) { try { await this.whatsapp.send(c.phone, text); whatsappSent = true; } catch { /* non-fatal */ } }
      if (smsSent || emailSent || whatsappSent) {
        await this.prisma.announcementRecipient.updateMany({ where: { schoolId, announcementId: ann.id, recipientType: c.type, recipientId: c.id }, data: { smsSent, emailSent, whatsappSent } });
      }
    }
  }

  async create(dto: CreateAnnouncementDto, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const recipients = await this.resolveRecipients(dto, schoolId);
    const selected = (dto.channels ?? []).filter((c) => c === "SMS" || c === "EMAIL" || c === "WHATSAPP");
    const channels = ["IN_APP", ...selected];
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    const isFutureSchedule = !!scheduledFor && scheduledFor.getTime() > Date.now();
    const ann = await this.prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: {
          schoolId,
          authorId: user.id,
          title: dto.title,
          body: dto.body,
          audienceType: dto.audienceType,
          audienceIds: dto.audienceIds ?? [],
          channels,
          ...(isFutureSchedule ? { scheduledFor, status: "SCHEDULED" } : {}),
        },
      });
      if (recipients.length > 0) {
        await tx.announcementRecipient.createMany({ data: recipients.map((r) => ({ schoolId, announcementId: a.id, recipientType: r.recipientType, recipientId: r.recipientId })) });
      }
      return a;
    });
    if (!isFutureSchedule) {
      await this.deliverAnnouncement(ann, recipients);
    }
    return { id: ann.id, recipientCount: recipients.length };
  }

  /**
   * Cross-tenant: iterates all due SCHEDULED announcements across schools (no TenantContext),
   * delivers each, then flips status to SENT. Idempotent — SENT rows are never matched again.
   */
  async dispatchScheduledAnnouncements(now: Date): Promise<void> {
    const due = await this.prisma.announcement.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    });
    for (const ann of due) {
      // Claim before sending: atomically flip SCHEDULED→SENT and deliver only if THIS run won
      // the claim. Prevents a crash/multi-instance overlap between delivery and the status flip
      // from re-delivering to every recipient (mirrors the NotificationLog claim used elsewhere).
      const claim = await this.prisma.announcement.updateMany({
        where: { id: ann.id, status: "SCHEDULED" },
        data: { status: "SENT" },
      });
      if (claim.count !== 1) continue;
      const rows = await this.prisma.announcementRecipient.findMany({
        where: { schoolId: ann.schoolId, announcementId: ann.id },
        select: { recipientType: true, recipientId: true },
      });
      const recipients: Recipient[] = rows.map((r) => ({ recipientType: r.recipientType as "PARENT" | "STAFF", recipientId: r.recipientId }));
      await this.deliverAnnouncement(ann, recipients);
    }
  }

  async list() {
    const schoolId = TenantContext.schoolIdOrThrow();
    const anns = await this.prisma.announcement.findMany({
      where: { schoolId },
      orderBy: { sentAt: "desc" },
      include: { _count: { select: { recipients: true } } },
    });
    const reads = await this.prisma.announcementRecipient.groupBy({ by: ["announcementId"], where: { schoolId, readAt: { not: null } }, _count: { _all: true } });
    const readBy = new Map(reads.map((r) => [r.announcementId, r._count._all]));
    return anns.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audienceType: a.audienceType,
      audienceIds: a.audienceIds,
      channels: a.channels,
      sentAt: a.sentAt.toISOString(),
      scheduledFor: a.scheduledFor ? a.scheduledFor.toISOString() : null,
      status: a.status,
      recipientCount: a._count.recipients,
      readCount: readBy.get(a.id) ?? 0,
    }));
  }

  async getRecipients(announcementId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const ann = await this.prisma.announcement.findFirst({ where: { id: announcementId, schoolId } });
    if (!ann) throw new NotFoundException("Announcement not found.");
    const rows = await this.prisma.announcementRecipient.findMany({ where: { schoolId, announcementId }, orderBy: [{ recipientType: "asc" }] });
    const parentIds = rows.filter((r) => r.recipientType === "PARENT").map((r) => r.recipientId);
    const staffIds = rows.filter((r) => r.recipientType === "STAFF").map((r) => r.recipientId);
    const [parents, staff] = await Promise.all([
      parentIds.length ? this.prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
      staffIds.length ? this.prisma.staff.findMany({ where: { schoolId, id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    ]);
    const nameBy = new Map<string, string>();
    for (const p of parents) nameBy.set(`PARENT:${p.id}`, `${p.firstName} ${p.lastName}`);
    for (const s of staff) nameBy.set(`STAFF:${s.id}`, `${s.firstName} ${s.lastName}`);
    const recipients = rows.map((r) => ({
      recipientType: r.recipientType,
      recipientId: r.recipientId,
      name: nameBy.get(`${r.recipientType}:${r.recipientId}`) ?? "Unknown",
      smsSent: r.smsSent,
      emailSent: r.emailSent,
      whatsappSent: r.whatsappSent,
      readAt: r.readAt ? r.readAt.toISOString() : null,
    }));
    return {
      id: ann.id,
      title: ann.title,
      body: ann.body,
      audienceType: ann.audienceType,
      channels: ann.channels,
      sentAt: ann.sentAt.toISOString(),
      aggregates: {
        total: rows.length,
        readCount: rows.filter((r) => r.readAt).length,
        smsCount: rows.filter((r) => r.smsSent).length,
        emailCount: rows.filter((r) => r.emailSent).length,
        whatsappCount: rows.filter((r) => r.whatsappSent).length,
      },
      recipients,
    };
  }

  async getInbox(user: RequestUser) {
    const type = user.identityType;
    if ((type !== "PARENT" && type !== "STAFF") || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const rows = await this.prisma.announcementRecipient.findMany({
      where: { schoolId, recipientType: type, recipientId: user.identityId },
      include: { announcement: { select: { title: true, body: true, sentAt: true } } },
      orderBy: { announcement: { sentAt: "desc" } },
    });
    return rows.map((r) => ({
      recipientId: r.id,
      announcementId: r.announcementId,
      title: r.announcement.title,
      body: r.announcement.body,
      sentAt: r.announcement.sentAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
    }));
  }

  async markReadForUser(announcementId: string, user: RequestUser) {
    const type = user.identityType;
    if ((type !== "PARENT" && type !== "STAFF") || !user.identityId) throw new NotFoundException("Announcement not found.");
    const schoolId = TenantContext.schoolIdOrThrow();
    const res = await this.prisma.announcementRecipient.updateMany({
      where: { schoolId, announcementId, recipientType: type, recipientId: user.identityId },
      data: { readAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException("Announcement not found.");
    return { ok: true };
  }
}
