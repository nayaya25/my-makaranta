# Direct Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent and their child's form teacher exchange on-record, in-app messages, bounded to the form-teacher relationship (bidirectional).

**Architecture:** New `apps/api/src/modules/messaging/` + two tenant models (`Conversation`, `Message`) with RLS. A `canConverse` form-teacher gate (bidirectional). Identity-based `/v1/me/...` endpoints serve PARENT + STAFF. One shared web `/messages` page. In-app only. No new npm deps.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-6-slice-3-direct-messaging-design.md`

**Branch:** `sprint-6-direct-messaging` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; `canConverse` gate (form-teacher, current term) on create + participant-gate (404) on read/post; e2e service-level inside `TenantContext.run` (model on `test/announcements.e2e-spec.ts`); `noUncheckedIndexedAccess`. Identity from JWT: PARENT→`identityId`=parentId, STAFF→`identityId`=staffId. Seeded perms unaffected (messaging is identity-gated, not perm-gated). **Windows: stop `pnpm dev` before `prisma migrate`/`build`; kill stray jest workers on EPERM.**

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (2 models + 2 School back-relations), `apps/api/src/core/prisma/prisma.service.ts` (TENANT_MODELS), `apps/api/src/app.module.ts`; create 2 migrations
- Create: `apps/api/src/modules/messaging/{messaging.module.ts, messaging.service.ts, messaging.controller.ts, dto.ts}`, `apps/api/test/messaging.e2e-spec.ts`
- Web — Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx` (Messages nav × both); Create: `apps/web/src/app/(app)/messages/page.tsx`

---

## Task 1: Schema — models + migrations  *(orchestrator-executed)*

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`; create 2 migrations. **Stop any dev server first.**

- [ ] **Step 1: Add the models** to `schema.prisma` (after the announcements models):
```prisma
model Conversation {
  id            String    @id @default(cuid())
  schoolId      String
  school        School    @relation(fields: [schoolId], references: [id])
  parentId      String
  staffId       String
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())
  messages      Message[]

  @@unique([schoolId, parentId, staffId])
  @@index([schoolId, parentId])
  @@index([schoolId, staffId])
}

model Message {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderType     String
  senderId       String
  body           String
  readAt         DateTime?
  sentAt         DateTime     @default(now())

  @@index([schoolId, conversationId, sentAt])
}
```

- [ ] **Step 2: Add `School` back-relations** — in `model School { ... }`:
```prisma
  conversations          Conversation[]
  messages               Message[]
```

- [ ] **Step 3: Register in `TENANT_MODELS`** — in `apps/api/src/core/prisma/prisma.service.ts`, add after `"AnnouncementRecipient"`:
```ts
  "Conversation",
  "Message",
```

- [ ] **Step 4: Models migration** — `cd apps/api && pnpm prisma migrate dev --name messaging_models` (additive — non-interactive OK). Regenerates the client.

- [ ] **Step 5: RLS migration** — `cd apps/api && pnpm prisma migrate dev --create-only --name rls_messaging`, then REPLACE the generated `migration.sql` with:
```sql
-- Defense-in-depth tenant isolation for Conversation + Message.
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Conversation";
CREATE POLICY tenant_isolation ON "Conversation"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO mymakaranta_app;

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Message";
CREATE POLICY tenant_isolation ON "Message"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Message" TO mymakaranta_app;
```
Then `cd apps/api && pnpm prisma migrate dev` to apply. (If `--create-only` errors non-interactively, hand-author the migration dir + `prisma migrate deploy`, as in the slice-2 receipts migration.)

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/core/prisma/prisma.service.ts
git commit -m "feat(messaging): Conversation + Message models + RLS"
```

---

## Task 2: API — service + controller + module + e2e

**Files:** Create `apps/api/src/modules/messaging/{dto.ts, messaging.service.ts, messaging.controller.ts, messaging.module.ts}`, `apps/api/test/messaging.e2e-spec.ts`; modify `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing e2e** — `apps/api/test/messaging.e2e-spec.ts` (service-level, two-school A/B):
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json messaging`
Expected: FAIL — cannot find `messaging.module`.

- [ ] **Step 3: DTOs** — `apps/api/src/modules/messaging/dto.ts`:
```ts
import { IsString, IsNotEmpty, MinLength } from "class-validator";

export class CreateConversationDto {
  @IsString() @IsNotEmpty() counterpartId!: string;
}

export class PostMessageDto {
  @IsString() @MinLength(1) body!: string;
}
```

- [ ] **Step 4: Service** — `apps/api/src/modules/messaging/messaging.service.ts`:
```ts
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
```

- [ ] **Step 5: Controller** — `apps/api/src/modules/messaging/messaging.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { MessagingService } from "./messaging.service";
import { CreateConversationDto, PostMessageDto } from "./dto";

@Controller("v1/me")
export class MessagingController {
  constructor(private service: MessagingService) {}

  @Get("messageable")
  @UseGuards(JwtAuthGuard)
  messageable(@CurrentUser() user: RequestUser) {
    return this.service.getMessageable(user);
  }

  @Post("conversations")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  createConversation(@Body() dto: CreateConversationDto, @CurrentUser() user: RequestUser) {
    return this.service.createConversation(user, dto.counterpartId);
  }

  @Get("conversations")
  @UseGuards(JwtAuthGuard)
  conversations(@CurrentUser() user: RequestUser) {
    return this.service.getConversations(user);
  }

  @Get("conversations/:id/messages")
  @UseGuards(JwtAuthGuard)
  messages(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.service.getMessages(user, id);
  }

  @Post("conversations/:id/messages")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  postMessage(@Param("id") id: string, @Body() dto: PostMessageDto, @CurrentUser() user: RequestUser) {
    return this.service.postMessage(user, id, dto.body);
  }
}
```
(NOTE: this `@Controller("v1/me")` coexists with the announcements controller's `v1/me/announcements` routes — different controllers/modules, distinct paths, no conflict.)

- [ ] **Step 6: Module** — `apps/api/src/modules/messaging/messaging.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";

@Module({ imports: [AuthModule], controllers: [MessagingController], providers: [MessagingService] })
export class MessagingModule {}
```

- [ ] **Step 7: Register in `app.module.ts`** — add the import + list `MessagingModule` in `imports` (after `AnnouncementsModule`):
```ts
import { MessagingModule } from "./modules/messaging/messaging.module";
```

- [ ] **Step 8: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json messaging`
Expected: PASS (4 tests).

- [ ] **Step 9: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (27 suites / 180 tests), build + typecheck clean.

- [ ] **Step 10: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/messaging apps/api/src/app.module.ts apps/api/test/messaging.e2e-spec.ts
git commit -m "feat(messaging): form-teacher-gated conversations + messages (parent <-> staff)"
```

---

## Task 3: Web — api client + shared `/messages` page + nav

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`; create `apps/web/src/app/(app)/messages/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add types + methods:
```ts
export interface Messageable { staffId?: string; staffName?: string; childName?: string; className?: string; parentId?: string; parentName?: string; studentName?: string; }
export interface ConversationRow { id: string; counterpartName: string; lastMessageAt: string | null; unreadCount: number; }
export interface ChatMessage { id: string; senderType: "PARENT" | "STAFF"; body: string; sentAt: string; readAt: string | null; }
```
```ts
  getMessageable: () => authedRequest<Messageable[]>("/v1/me/messageable"),
  createConversation: (counterpartId: string) =>
    authedRequest<{ conversationId: string }>("/v1/me/conversations", { method: "POST", body: JSON.stringify({ counterpartId }) }),
  getConversations: () => authedRequest<ConversationRow[]>("/v1/me/conversations"),
  getMessages: (id: string) => authedRequest<ChatMessage[]>(`/v1/me/conversations/${id}/messages`),
  postMessage: (id: string, body: string) =>
    authedRequest<{ id: string; sentAt: string }>(`/v1/me/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
```

- [ ] **Step 2: Messages nav** — in `apps/web/src/app/(app)/layout.tsx`, add `MessageSquare` to the lucide import; add a `NAV_ITEMS` entry (after Inbox, before Settings):
```tsx
  { href: "/messages", label: "Messages", icon: MessageSquare },
```
and add the same entry to `PARENT_NAV` (after Announcements):
```tsx
  { href: "/messages", label: "Messages", icon: MessageSquare },
```

- [ ] **Step 3: Create the shared `/messages` page** — `apps/web/src/app/(app)/messages/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, type ChatMessage, type ConversationRow, type Messageable } from "@/lib/api";
import { session } from "@/lib/auth";

export default function MessagesPage() {
  const myType = session.user()?.identityType; // "PARENT" | "STAFF"
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<Messageable[]>([]);
  const [busy, setBusy] = useState(false);

  function loadConvos() {
    api.getConversations().then(setConvos).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { loadConvos(); }, []);

  async function openConvo(id: string) {
    setActiveId(id);
    setPicking(false);
    setMessages(await api.getMessages(id).catch(() => []));
    loadConvos(); // refresh unread counts after marking read
  }

  async function openPicker() {
    setPicking(true);
    setActiveId(null);
    setPeople(await api.getMessageable().catch(() => []));
  }

  async function startWith(counterpartId: string) {
    setBusy(true);
    try {
      const { conversationId } = await api.createConversation(counterpartId);
      await openConvo(conversationId);
      loadConvos();
    } catch { /* not allowed */ } finally { setBusy(false); }
  }

  async function send() {
    if (!activeId || !draft.trim()) return;
    setBusy(true);
    try {
      await api.postMessage(activeId, draft.trim());
      setDraft("");
      setMessages(await api.getMessages(activeId));
      loadConvos();
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Messages</h1>
        <Button size="sm" onClick={openPicker}>New message</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
          {/* Conversation list */}
          <div className="flex flex-col gap-1">
            {convos.length === 0 && !picking && <p className="text-small text-ink-500">No conversations yet.</p>}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={`rounded-input border px-3 py-2 text-left ${activeId === c.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-ink-100 dark:border-white/10"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{c.counterpartName}</span>
                  {c.unreadCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-caption text-white tabular-nums">{c.unreadCount}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Thread / picker */}
          <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 min-h-[300px] flex flex-col">
            {picking ? (
              <div className="flex flex-col gap-2">
                <p className="text-small font-semibold text-ink-700 dark:text-ink-300">Start a conversation</p>
                {people.length === 0 ? (
                  <p className="text-small text-ink-500">No one to message yet.</p>
                ) : people.map((p, i) => {
                  const id = p.staffId ?? p.parentId!;
                  const name = p.staffName ?? p.parentName!;
                  const sub = p.className ? `${p.childName} · ${p.className}` : p.studentName;
                  return (
                    <button key={`${id}-${i}`} onClick={() => startWith(id)} disabled={busy} className="rounded-input border border-ink-100 dark:border-white/10 px-3 py-2 text-left">
                      <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{name}</span>
                      {sub && <span className="block text-caption text-ink-500">{sub}</span>}
                    </button>
                  );
                })}
              </div>
            ) : activeId ? (
              <>
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                  {messages.map((m) => {
                    const mine = m.senderType === myType;
                    return (
                      <div key={m.id} className={`max-w-[80%] rounded-card px-3 py-2 text-small ${mine ? "self-end bg-brand-500 text-white" : "self-start bg-paper dark:bg-paper-dark text-ink-1000 dark:text-ink-100"}`}>
                        {m.body}
                      </div>
                    );
                  })}
                  {messages.length === 0 && <p className="text-small text-ink-500">No messages yet — say hello.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Type a message"
                    className="flex-1 rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
                  />
                  <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Send</Button>
                </div>
              </>
            ) : (
              <p className="text-small text-ink-500 m-auto">Select a conversation or start a new one.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean (pre-existing `no-page-custom-font` warning unrelated); `/messages` builds. Confirm `MessageSquare` in lucide-react; `session.user()` from `@/lib/auth`; `Button`/`Spinner` imports; tokens (`brand-50`/`brand-500`/`bg-paper`/`bg-surface`/`rounded-card`/`rounded-input`/`text-ink-*`/`text-caption`) real.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/messages"
git commit -m "feat(messaging): shared /messages page (list + thread + picker) + nav"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real OTP + guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs`, deleted after): a school + current term + a class with a form teacher S (loginable phone) + a student + guardian→parent P (loginable phone) enrolled in that class. As P (OTP-login): `GET /v1/me/messageable` → lists S; `POST /v1/me/conversations {counterpartId: S}` → conversationId; `POST /v1/me/conversations/:id/messages {body}` → ok. As S (OTP-login → STAFF): `GET /v1/me/conversations` → the thread, unread 1; `GET /v1/me/conversations/:id/messages` → P's message (marks read); `POST .../messages` reply → P's `GET /v1/me/conversations` shows unread 1. Negative: P `POST /v1/me/conversations {counterpartId: <a non-form-teacher staff id>}` → 403; a non-participant reading → 404. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 6 slice 3 entry (Conversation/Message models + RLS, `canConverse` form-teacher gate, `/v1/me/conversations[...]` + messageable, shared `/messages` web, e2e count 180). Note **Sprint 6 (Communication) COMPLETE** (s1, s2, s2.5, s3). Update "Next steps" (next sprint per PRD, or the deferred backlog). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit + web vitest + UI vitest + builds, then merge `sprint-6-direct-messaging` → main per the user's choice.

---

## Notes for the implementer
- **Two models + 2 migrations** (models additive + RLS). Stop dev servers before `prisma`/`build`; kill stray jest workers on EPERM. RLS migration created `--create-only` then hand-filled (mirror `rls_announcements`); if `--create-only` is non-interactive-blocked, hand-author the dir + `prisma migrate deploy` (as in the slice-2 receipts migration).
- **`canConverse` is the security crux** — a single `class.findFirst` with nested `enrollments.some({ termId, student: { schoolId, guardians: { some: { parentId } } } })` validates the full parent→student→class→formTeacher chain in the current term, schoolId-scoped. Gates conversation create bidirectionally. Reads/posts are participant-gated (caller is the conversation's `parentId`/`staffId` per identity → else 404).
- **Identity:** PARENT `identityId` = Parent.id, STAFF `identityId` = Staff.id. `senderType` = `identityType`. The web labels a bubble "mine" when `message.senderType === session.user().identityType` (a conversation has exactly one PARENT + one STAFF, so this is unambiguous — no identityId needed on the web).
- **Mark-read on open** — `getMessages` marks the OTHER party's unread messages read; `unreadCount` (in `getConversations`) counts the other party's `readAt: null`.
- **Explicit tenant scoping** — every read/write carries `where: { schoolId }`; conversation create `upsert` is keyed by the `@@unique([schoolId, parentId, staffId])` compound (`schoolId_parentId_staffId`).
- **Tokens/ui** — `MessageSquare` from lucide-react; `Button`/`Spinner`; `brand-50`/`brand-500`, `bg-paper`(+`-dark`)/`bg-surface`(+`-dark`), `rounded-card`/`rounded-input`, `text-ink-{100,500,700,1000}`, `text-caption` real; `bg-canvas`/`text-brand-600` not.
- **No SMS/email** — in-app only this slice.
```
