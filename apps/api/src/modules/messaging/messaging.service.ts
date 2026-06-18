import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  private async currentTermId(schoolId: string): Promise<string | null> {
    const t = await this.prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
    return t?.id ?? null;
  }

  private async canConverse(parentId: string, staffId: string, schoolId: string): Promise<boolean> {
    const termId = await this.currentTermId(schoolId);
    if (!termId) return false;
    const cls = await this.prisma.class.findFirst({
      where: {
        schoolId,
        formTeacherId: staffId,
        enrollments: { some: { termId, student: { schoolId, guardians: { some: { parentId } } } } },
      },
      select: { id: true },
    });
    return cls !== null;
  }

  /** Resolve (parentId, staffId) from the caller's identity + the counterpart id. */
  private pair(user: RequestUser, counterpartId: string): { parentId: string; staffId: string } | null {
    if (user.identityType === "PARENT" && user.identityId) return { parentId: user.identityId, staffId: counterpartId };
    if (user.identityType === "STAFF" && user.identityId) return { parentId: counterpartId, staffId: user.identityId };
    return null;
  }

  async getMessageable(user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const termId = await this.currentTermId(schoolId);
    if (!termId) return [];
    if (user.identityType === "PARENT" && user.identityId) {
      const guardians = await this.prisma.guardian.findMany({
        where: { parentId: user.identityId, student: { schoolId } },
        select: {
          student: {
            select: {
              firstName: true, lastName: true,
              enrollments: { where: { termId }, select: { class: { select: { name: true, formTeacherId: true } } } },
            },
          },
        },
      });
      const rows: { staffId: string; childName: string; className: string }[] = [];
      for (const g of guardians) {
        const childName = `${g.student.firstName} ${g.student.lastName}`;
        for (const e of g.student.enrollments) {
          if (e.class.formTeacherId) rows.push({ staffId: e.class.formTeacherId, childName, className: e.class.name });
        }
      }
      const staffIds = [...new Set(rows.map((r) => r.staffId))];
      const staff = staffIds.length ? await this.prisma.staff.findMany({ where: { schoolId, id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
      const nameBy = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
      return rows
        .filter((r) => nameBy.has(r.staffId))
        .map((r) => ({ staffId: r.staffId, staffName: nameBy.get(r.staffId)!, childName: r.childName, className: r.className }));
    }
    if (user.identityType === "STAFF" && user.identityId) {
      const classes = await this.prisma.class.findMany({
        where: { schoolId, formTeacherId: user.identityId },
        select: {
          enrollments: {
            where: { termId },
            select: { student: { select: { firstName: true, lastName: true, guardians: { select: { parentId: true, parent: { select: { firstName: true, lastName: true } } } } } } },
          },
        },
      });
      const seen = new Set<string>();
      const out: { parentId: string; parentName: string; studentName: string }[] = [];
      for (const c of classes) {
        for (const e of c.enrollments) {
          const studentName = `${e.student.firstName} ${e.student.lastName}`;
          for (const g of e.student.guardians) {
            const key = `${g.parentId}:${studentName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ parentId: g.parentId, parentName: `${g.parent.firstName} ${g.parent.lastName}`, studentName });
          }
        }
      }
      return out;
    }
    return [];
  }

  async createConversation(user: RequestUser, counterpartId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const p = this.pair(user, counterpartId);
    if (!p) throw new ForbiddenException("Not allowed.");
    if (!(await this.canConverse(p.parentId, p.staffId, schoolId))) {
      throw new ForbiddenException("You can only message your child's form teacher.");
    }
    const convo = await this.prisma.conversation.upsert({
      where: { schoolId_parentId_staffId: { schoolId, parentId: p.parentId, staffId: p.staffId } },
      create: { schoolId, parentId: p.parentId, staffId: p.staffId },
      update: {},
    });
    return { conversationId: convo.id };
  }

  async getConversations(user: RequestUser) {
    if ((user.identityType !== "PARENT" && user.identityType !== "STAFF") || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const mine = user.identityType === "PARENT" ? { parentId: user.identityId } : { staffId: user.identityId };
    const convos = await this.prisma.conversation.findMany({ where: { schoolId, ...mine }, orderBy: { lastMessageAt: "desc" } });
    if (convos.length === 0) return [];
    const otherType = user.identityType === "PARENT" ? "STAFF" : "PARENT";
    const unread = await this.prisma.message.groupBy({
      by: ["conversationId"],
      where: { schoolId, conversationId: { in: convos.map((c) => c.id) }, senderType: otherType, readAt: null },
      _count: { _all: true },
    });
    const unreadBy = new Map(unread.map((u) => [u.conversationId, u._count._all]));
    // Counterpart names: the OTHER party per conversation.
    const parentIds = [...new Set(convos.map((c) => c.parentId))];
    const staffIds = [...new Set(convos.map((c) => c.staffId))];
    const [parents, staff] = await Promise.all([
      parentIds.length ? this.prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
      staffIds.length ? this.prisma.staff.findMany({ where: { schoolId, id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    ]);
    const parentName = new Map(parents.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const staffName = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    return convos.map((c) => ({
      id: c.id,
      counterpartName: user.identityType === "PARENT" ? (staffName.get(c.staffId) ?? "Unknown") : (parentName.get(c.parentId) ?? "Unknown"),
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      unreadCount: unreadBy.get(c.id) ?? 0,
    }));
  }

  private async assertParticipant(user: RequestUser, conversationId: string, schoolId: string) {
    if ((user.identityType !== "PARENT" && user.identityType !== "STAFF") || !user.identityId) {
      throw new NotFoundException("Conversation not found.");
    }
    const convo = await this.prisma.conversation.findFirst({ where: { id: conversationId, schoolId } });
    if (!convo) throw new NotFoundException("Conversation not found.");
    const ok = user.identityType === "PARENT" ? convo.parentId === user.identityId : convo.staffId === user.identityId;
    if (!ok) throw new NotFoundException("Conversation not found.");
    return convo;
  }

  async getMessages(user: RequestUser, conversationId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertParticipant(user, conversationId, schoolId);
    const otherType = user.identityType === "PARENT" ? "STAFF" : "PARENT";
    await this.prisma.message.updateMany({
      where: { schoolId, conversationId, senderType: otherType, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await this.prisma.message.findMany({ where: { schoolId, conversationId }, orderBy: { sentAt: "asc" } });
    return messages.map((m) => ({ id: m.id, senderType: m.senderType, body: m.body, sentAt: m.sentAt.toISOString(), readAt: m.readAt ? m.readAt.toISOString() : null }));
  }

  async postMessage(user: RequestUser, conversationId: string, body: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    if (!body || !body.trim()) throw new BadRequestException("Message cannot be empty.");
    await this.assertParticipant(user, conversationId, schoolId);
    const msg = await this.prisma.message.create({
      data: { schoolId, conversationId, senderType: user.identityType, senderId: user.identityId!, body: body.trim() },
    });
    await this.prisma.conversation.updateMany({ where: { id: conversationId, schoolId }, data: { lastMessageAt: msg.sentAt } });
    return { id: msg.id, sentAt: msg.sentAt.toISOString() };
  }
}
