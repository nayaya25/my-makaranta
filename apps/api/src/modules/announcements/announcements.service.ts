import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { EMAIL_SERVICE, type EmailService } from "../../core/email/email.types";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import type { CreateAnnouncementDto } from "./dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
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
    return [...new Set(guardians.map((g) => g.parentId))];
  }

  async create(dto: CreateAnnouncementDto, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const parentIds = await this.resolveParentIds(dto, schoolId);
    const selected = (dto.channels ?? []).filter((c) => c === "SMS" || c === "EMAIL");
    const channels = ["IN_APP", ...selected];
    const ann = await this.prisma.announcement.create({
      data: { schoolId, authorId: user.id, title: dto.title, body: dto.body, audienceType: dto.audienceType, audienceIds: dto.audienceIds ?? [], channels },
    });
    if (parentIds.length > 0) {
      await this.prisma.announcementRecipient.createMany({ data: parentIds.map((parentId) => ({ schoolId, announcementId: ann.id, parentId })) });
    }
    const wantSms = selected.includes("SMS");
    const wantEmail = selected.includes("EMAIL");
    if ((wantSms || wantEmail) && parentIds.length > 0) {
      const parents = await this.prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { id: true, phone: true, email: true } });
      const text = `${dto.title} — ${dto.body}`;
      for (const p of parents) {
        let smsSent = false;
        let emailSent = false;
        if (wantSms) { try { await this.sms.send(p.phone, text); smsSent = true; } catch { /* non-fatal */ } }
        if (wantEmail && p.email) { try { await this.email.send({ to: p.email, subject: dto.title, html: `<p>${dto.body}</p>`, text }); emailSent = true; } catch { /* non-fatal */ } }
        if (smsSent || emailSent) {
          await this.prisma.announcementRecipient.updateMany({ where: { schoolId, announcementId: ann.id, parentId: p.id }, data: { smsSent, emailSent } });
        }
      }
    }
    return { id: ann.id, recipientCount: parentIds.length };
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
      recipientCount: a._count.recipients,
      readCount: readBy.get(a.id) ?? 0,
    }));
  }

  async getForParent(user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const rows = await this.prisma.announcementRecipient.findMany({
      where: { schoolId, parentId: user.identityId },
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

  async markRead(announcementId: string, user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) throw new NotFoundException("Announcement not found.");
    const schoolId = TenantContext.schoolIdOrThrow();
    const res = await this.prisma.announcementRecipient.updateMany({
      where: { schoolId, announcementId, parentId: user.identityId },
      data: { readAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException("Announcement not found.");
    return { ok: true };
  }
}
