/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { MessagingModule } from "../src/modules/messaging/messaging.module";
import { MessagingService } from "../src/modules/messaging/messaging.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Messaging (e2e)", () => {
  let prisma: PrismaService;
  let svc: MessagingService;
  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "u";

  let parentP: string; // P: child in class C (form teacher S)
  let parentQ: string; // Q: child NOT in C
  let staffS: string;  // S: form teacher of C
  let staffU: string;  // U: not C's form teacher
  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);
  const parent = (id: string) => ({ id: "pu", phone: "+2340000000001", schoolId, identityType: "PARENT" as const, identityId: id });
  const staff = (id: string) => ({ id: "su", phone: "+2340000000002", schoolId, identityType: "STAFF" as const, identityId: id });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule, PrismaModule, AuthModule, MessagingModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    svc = moduleRef.get(MessagingService);
    const a = await prisma.school.create({ data: { name: `Msg A ${suffix}`, slug: `msg-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Msg B ${suffix}`, slug: `msg-b-${suffix}` } });
    schoolBId = b.id;

    const ay = await prisma.academicYear.create({ data: { schoolId, name: `MsgYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
    const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
    const lvl = await prisma.classLevel.create({ data: { schoolId, name: `MsgL-${suffix}`, order: 1 } });
    const s = await prisma.staff.create({ data: { schoolId, staffNo: `S-${suffix}`, firstName: "Form", lastName: "Teacher", email: `s-${suffix}@e.test`, phone: `+234870${String(suffix).slice(-7)}` } });
    const u = await prisma.staff.create({ data: { schoolId, staffNo: `U-${suffix}`, firstName: "Other", lastName: "Staff", email: `u-${suffix}@e.test`, phone: `+234871${String(suffix).slice(-7)}` } });
    staffS = s.id; staffU = u.id;
    const c = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `MsgC-${suffix}`, formTeacherId: s.id } });
    const cOther = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `MsgC2-${suffix}` } }); // no form teacher
    const p = await prisma.parent.create({ data: { schoolId, phone: `+234880${String(suffix).slice(-7)}`, firstName: "Pat", lastName: "Rent", email: `p-${suffix}@e.test` } });
    const q = await prisma.parent.create({ data: { schoolId, phone: `+234881${String(suffix).slice(-7)}`, firstName: "Que", lastName: "Rent" } });
    parentP = p.id; parentQ = q.id;
    const stuP = await prisma.student.create({ data: { schoolId, admissionNo: `SP-${suffix}`, firstName: "Kid", lastName: "P", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
    const stuQ = await prisma.student.create({ data: { schoolId, admissionNo: `SQ-${suffix}`, firstName: "Kid", lastName: "Q", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
    await prisma.guardian.create({ data: { studentId: stuP.id, parentId: p.id, relationship: "FATHER" } });
    await prisma.guardian.create({ data: { studentId: stuQ.id, parentId: q.id, relationship: "FATHER" } });
    await prisma.enrollment.create({ data: { studentId: stuP.id, classId: c.id, termId: term.id } });   // P's kid in C (form teacher S)
    await prisma.enrollment.create({ data: { studentId: stuQ.id, classId: cOther.id, termId: term.id } }); // Q's kid in cOther (no S)
  });
  afterAll(async () => { await prisma.onModuleDestroy(); });

  it("messageable: parent P sees form teacher S; staff S sees parent P", async () => {
    const pMsgable = await asA(() => svc.getMessageable(parent(parentP)));
    expect(pMsgable.some((m: any) => m.staffId === staffS)).toBe(true);
    expect(pMsgable.some((m: any) => m.staffId === staffU)).toBe(false);
    const sMsgable = await asA(() => svc.getMessageable(staff(staffS)));
    expect(sMsgable.some((m: any) => m.parentId === parentP)).toBe(true);
  });

  it("parent P can start a thread with S; cannot with U (403); Q cannot with S (403)", async () => {
    const convo = await asA(() => svc.createConversation(parent(parentP), staffS));
    expect(convo.conversationId).toBeTruthy();
    // idempotent
    const again = await asA(() => svc.createConversation(parent(parentP), staffS));
    expect(again.conversationId).toBe(convo.conversationId);
    await expect(asA(() => svc.createConversation(parent(parentP), staffU))).rejects.toThrow(ForbiddenException);
    await expect(asA(() => svc.createConversation(parent(parentQ), staffS))).rejects.toThrow(ForbiddenException);
  });

  it("message round-trip: post, unread, read, reply", async () => {
    const { conversationId } = await asA(() => svc.createConversation(parent(parentP), staffS));
    await asA(() => svc.postMessage(parent(parentP), conversationId, "Hello teacher"));
    // S sees it unread
    const sConvos = await asA(() => svc.getConversations(staff(staffS)));
    const row = sConvos.find((c: any) => c.id === conversationId)!;
    expect(row.unreadCount).toBe(1);
    expect(row.counterpartName).toContain("Pat");
    // S reads (marks P's msg read) + replies
    const msgs = await asA(() => svc.getMessages(staff(staffS), conversationId));
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.senderType).toBe("PARENT");
    await asA(() => svc.postMessage(staff(staffS), conversationId, "Hello parent"));
    // P now has 1 unread (S's reply); P's earlier read state cleared S's unread
    const pConvos = await asA(() => svc.getConversations(parent(parentP)));
    expect(pConvos.find((c: any) => c.id === conversationId)!.unreadCount).toBe(1);
    const sConvos2 = await asA(() => svc.getConversations(staff(staffS)));
    expect(sConvos2.find((c: any) => c.id === conversationId)!.unreadCount).toBe(0);
  });

  it("rejects empty body (400), non-participant read (404), cross-tenant (404)", async () => {
    const { conversationId } = await asA(() => svc.createConversation(parent(parentP), staffS));
    await expect(asA(() => svc.postMessage(parent(parentP), conversationId, "   "))).rejects.toThrow(BadRequestException);
    await expect(asA(() => svc.getMessages(parent(parentQ), conversationId))).rejects.toThrow(NotFoundException); // Q not a participant
    await expect(asB(() => svc.getMessages({ ...parent(parentP), schoolId: schoolBId }, conversationId))).rejects.toThrow(NotFoundException);
  });
});
