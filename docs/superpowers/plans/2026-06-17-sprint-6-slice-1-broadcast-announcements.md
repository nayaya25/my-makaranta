# Broadcast Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A principal/proprietor broadcasts an announcement to an audience (all / class-level / class); targeted students' parents get an in-app inbox entry + optional SMS/email, read it in their portal, and the author sees a read count.

**Architecture:** New `apps/api/src/modules/announcements/` module + two tenant-scoped models (`Announcement`, `AnnouncementRecipient`) with RLS. `AnnouncementsService` resolves recipient parents from the audience, persists recipient rows, and fans out SMS/email synchronously (reusing `SmsService`/`EmailService`, best-effort). Web: a staff `/announcements` page (compose + sent list) and a parent `/parent/announcements` inbox. No new npm deps.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts`).

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-6-slice-1-broadcast-announcements-design.md`

**Branch:** `sprint-6-announcements` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; tenant-IDOR validate audience ids; uniform 404 on a parent's foreign mark-read; per-recipient send failures non-fatal (fee-reminder pattern); e2e service-level inside `TenantContext.run` (model on `test/fees.e2e-spec.ts`); `noUncheckedIndexedAccess`. `SmsService` from `core/auth` (via `AuthModule`); `EMAIL_SERVICE`/`EmailService` from `core/email` (via `EmailModule`). Seeded perms `announcements.create` + `announcements.view` (proprietor-granted). **Windows: stop any `pnpm dev` before `prisma migrate`/`build` (engine DLL lock).**

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (2 models + 3 back-relations), `apps/api/src/core/prisma/prisma.service.ts` (TENANT_MODELS), `apps/api/src/app.module.ts` (register module)
- Create: 2 migrations (`*_announcements_models`, `*_rls_announcements`); `apps/api/src/modules/announcements/{announcements.module.ts, announcements.service.ts, announcements.controller.ts, dto.ts}`; `apps/api/test/announcements.e2e-spec.ts`
- Web — Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx` (staff + parent nav); Create: `apps/web/src/app/(app)/announcements/page.tsx`, `apps/web/src/app/(app)/parent/announcements/page.tsx`

---

## Task 1: Schema — models + migrations + TENANT_MODELS

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`; create 2 migrations

- [ ] **Step 1: Add the models** to `apps/api/prisma/schema.prisma` (anywhere after `model Parent`):
```prisma
model Announcement {
  id           String                  @id @default(cuid())
  schoolId     String
  school       School                  @relation(fields: [schoolId], references: [id])
  authorId     String
  title        String
  body         String
  audienceType String
  audienceIds  String[]
  channels     String[]
  sentAt       DateTime                @default(now())
  recipients   AnnouncementRecipient[]

  @@index([schoolId, sentAt])
}

model AnnouncementRecipient {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  announcementId String
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  parentId       String
  parent         Parent       @relation(fields: [parentId], references: [id])
  readAt         DateTime?
  smsSent        Boolean      @default(false)
  emailSent      Boolean      @default(false)

  @@unique([announcementId, parentId])
  @@index([schoolId, parentId])
}
```

- [ ] **Step 2: Add back-relations.** In `model School { ... }` add:
```prisma
  announcements         Announcement[]
  announcementRecipients AnnouncementRecipient[]
```
In `model Parent { ... }` add:
```prisma
  announcementRecipients AnnouncementRecipient[]
```

- [ ] **Step 3: Register in `TENANT_MODELS`** — in `apps/api/src/core/prisma/prisma.service.ts`, add to the `TENANT_MODELS` Set (after `"FeeReminder"`):
```ts
  "Announcement",
  "AnnouncementRecipient",
```

- [ ] **Step 4: Generate the models migration** (stop any dev server first)

Run: `cd apps/api && pnpm prisma migrate dev --name announcements_models`
Expected: a new migration under `prisma/migrations/*_announcements_models/` creating both tables; Prisma Client regenerated; no errors.

- [ ] **Step 5: Create the RLS migration (empty, then fill)**

Run: `cd apps/api && pnpm prisma migrate dev --create-only --name rls_announcements`
Then REPLACE the generated `prisma/migrations/*_rls_announcements/migration.sql` contents with (mirrors `*_rls_fee_reminder`):
```sql
-- Defense-in-depth tenant isolation for Announcement + AnnouncementRecipient.
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Announcement";
CREATE POLICY tenant_isolation ON "Announcement"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Announcement" TO mymakaranta_app;

ALTER TABLE "AnnouncementRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementRecipient" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AnnouncementRecipient";
CREATE POLICY tenant_isolation ON "AnnouncementRecipient"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "AnnouncementRecipient" TO mymakaranta_app;
```

- [ ] **Step 6: Apply the RLS migration**

Run: `cd apps/api && pnpm prisma migrate dev`
Expected: the `rls_announcements` migration applies cleanly (dev connects as superuser; `mymakaranta_app` role exists from prior migrations).

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/core/prisma/prisma.service.ts
git commit -m "feat(announcements): Announcement + AnnouncementRecipient models + RLS"
```

---

## Task 2: API — service + controller + module + e2e

**Files:** Create `apps/api/src/modules/announcements/{dto.ts, announcements.service.ts, announcements.controller.ts, announcements.module.ts}`, `apps/api/test/announcements.e2e-spec.ts`; modify `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing e2e** — `apps/api/test/announcements.e2e-spec.ts` (service-level, two-school A/B; model on `test/fees.e2e-spec.ts`):
```ts
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { EmailModule } from "../src/core/email/email.module";
import { AnnouncementsModule } from "../src/modules/announcements/announcements.module";
import { AnnouncementsService } from "../src/modules/announcements/announcements.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Announcements (e2e)", () => {
  let prisma: PrismaService;
  let svc: AnnouncementsService;
  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "author-user";
  const author = () => ({ id: userId, phone: "+2348000000000", schoolId, identityType: "STAFF" as const, identityId: "staff-1" });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        EmailModule,
        AnnouncementsModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    svc = moduleRef.get(AnnouncementsService);
    const a = await prisma.school.create({ data: { name: `Ann A ${suffix}`, slug: `ann-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Ann B ${suffix}`, slug: `ann-b-${suffix}` } });
    schoolBId = b.id;
  });
  afterAll(async () => { await prisma.onModuleDestroy(); });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("broadcast", () => {
    let classId: string;
    let otherClassId: string;
    let parentTwoKidsId: string;
    let parentOtherId: string;
    let foreignClassId: string;

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `AnnYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `AnnL-${suffix}`, order: 1 } });
      const c1 = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `AnnC1-${suffix}` } });
      const c2 = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `AnnC2-${suffix}` } });
      classId = c1.id; otherClassId = c2.id;
      // parentTwoKids: TWO students in c1 → must dedup to ONE recipient.
      const pk = await prisma.parent.create({ data: { schoolId, phone: `+234810${String(suffix).slice(-7)}`, firstName: "Two", lastName: "Kids", email: `pk-${suffix}@e.test` } });
      parentTwoKidsId = pk.id;
      const po = await prisma.parent.create({ data: { schoolId, phone: `+234820${String(suffix).slice(-7)}`, firstName: "Other", lastName: "Class", email: `po-${suffix}@e.test` } });
      parentOtherId = po.id;
      const mkStudent = async (label: string, cls: string, parentId: string) => {
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "S", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
        await prisma.guardian.create({ data: { studentId: stu.id, parentId, relationship: "FATHER" } });
        await prisma.enrollment.create({ data: { studentId: stu.id, classId: cls, termId: term.id } });
        return stu.id;
      };
      await mkStudent("K1", classId, parentTwoKidsId);
      await mkStudent("K2", classId, parentTwoKidsId); // same parent, same class → dedup
      await mkStudent("O1", otherClassId, parentOtherId);
      const fc = await prisma.class.create({ data: { schoolId: schoolBId, classLevelId: (await prisma.classLevel.create({ data: { schoolId: schoolBId, name: `FL-${suffix}`, order: 1 } })).id, name: `FC-${suffix}` } });
      foreignClassId = fc.id;
    });

    it("creates an announcement to a CLASS, dedups recipients, sets channels + flags", async () => {
      const r = await asA(() => svc.create({ title: "Closure", body: "School closed Friday.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"] }, author()));
      expect(r.recipientCount).toBe(1); // parentTwoKids deduped from 2 students
      const recips = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(recips.length).toBe(1);
      expect(recips[0]!.parentId).toBe(parentTwoKidsId);
      expect(recips[0]!.smsSent).toBe(true);     // mock SMS succeeds
      expect(recips[0]!.emailSent).toBe(true);   // parent has an email
      const ann = await prisma.announcement.findFirstOrThrow({ where: { schoolId, id: r.id } });
      expect(ann.channels).toEqual(["IN_APP", "SMS", "EMAIL"]);
      expect(ann.sentAt).toBeInstanceOf(Date);
    });

    it("rejects a foreign class id (tenant-IDOR)", async () => {
      await expect(asA(() => svc.create({ title: "x", body: "y", audienceType: "CLASS", audienceIds: [foreignClassId], channels: [] }, author()))).rejects.toThrow(BadRequestException);
    });

    it("lists sent announcements with recipient + read counts", async () => {
      const list = await asA(() => svc.list());
      expect(list.length).toBeGreaterThanOrEqual(1);
      const closure = list.find((a) => a.title === "Closure")!;
      expect(closure.recipientCount).toBe(1);
      expect(closure.readCount).toBe(0);
    });

    it("parent inbox returns only the parent's own rows; mark-read sets readAt; bumps readCount", async () => {
      const parentUser = (pid: string) => ({ id: "pu", phone: "+2348094000001", schoolId, identityType: "PARENT" as const, identityId: pid });
      const inbox = await asA(() => svc.getForParent(parentUser(parentTwoKidsId)));
      expect(inbox.length).toBe(1);
      expect(inbox[0]!.readAt).toBeNull();
      const annId = inbox[0]!.announcementId;
      // a DIFFERENT parent (not a recipient) → mark-read 404
      await expect(asA(() => svc.markRead(annId, parentUser(parentOtherId)))).rejects.toThrow(NotFoundException);
      // the real recipient → ok, readAt set
      await asA(() => svc.markRead(annId, parentUser(parentTwoKidsId)));
      const after = await asA(() => svc.getForParent(parentUser(parentTwoKidsId)));
      expect(after[0]!.readAt).not.toBeNull();
      const list = await asA(() => svc.list());
      expect(list.find((a) => a.id === annId)!.readCount).toBe(1);
    });

    it("ALL audience resolves every parent in the school (deduped)", async () => {
      const r = await asA(() => svc.create({ title: "All", body: "Hello everyone.", audienceType: "ALL", audienceIds: [], channels: [] }, author()));
      expect(r.recipientCount).toBe(2); // parentTwoKids + parentOther
    });

    it("isolates tenants — school B sees none of A's announcements", async () => {
      const list = await asB(() => svc.list());
      expect(list.every((a) => a.title !== "Closure")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: FAIL — cannot find `../src/modules/announcements/announcements.module`.

- [ ] **Step 3: DTOs** — `apps/api/src/modules/announcements/dto.ts`:
```ts
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAnnouncementDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsIn(["ALL", "LEVEL", "CLASS"]) audienceType!: "ALL" | "LEVEL" | "CLASS";
  @IsOptional() @IsArray() @IsString({ each: true }) audienceIds?: string[];
  @IsOptional() @IsArray() @IsIn(["SMS", "EMAIL"], { each: true }) channels?: ("SMS" | "EMAIL")[];
}
```

- [ ] **Step 4: Service** — `apps/api/src/modules/announcements/announcements.service.ts`:
```ts
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
```

- [ ] **Step 5: Controller** — `apps/api/src/modules/announcements/announcements.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { AnnouncementsService } from "./announcements.service";
import { CreateAnnouncementDto } from "./dto";

@Controller("v1")
export class AnnouncementsController {
  constructor(private service: AnnouncementsService) {}

  @Post("announcements")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.create")
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Get("announcements")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.view")
  list() {
    return this.service.list();
  }

  @Get("parent/announcements")
  @UseGuards(JwtAuthGuard)
  parentInbox(@CurrentUser() user: RequestUser) {
    return this.service.getForParent(user);
  }

  @Post("parent/announcements/:announcementId/read")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  markRead(@Param("announcementId") announcementId: string, @CurrentUser() user: RequestUser) {
    return this.service.markRead(announcementId, user);
  }
}
```

- [ ] **Step 6: Module** — `apps/api/src/modules/announcements/announcements.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { EmailModule } from "../../core/email/email.module";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";

@Module({ imports: [AuthModule, EmailModule], controllers: [AnnouncementsController], providers: [AnnouncementsService] })
export class AnnouncementsModule {}
```

- [ ] **Step 7: Register in `app.module.ts`** — add the import and list `AnnouncementsModule` in `imports` (after `ParentModule`):
```ts
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
```

- [ ] **Step 8: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: PASS (6 tests).

- [ ] **Step 9: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (25 suites / 167 tests), build + typecheck clean.

- [ ] **Step 10: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/announcements apps/api/src/app.module.ts apps/api/test/announcements.e2e-spec.ts
git commit -m "feat(announcements): broadcast create + recipient fan-out + parent inbox + read tracking"
```

---

## Task 3: Web — api client + staff `/announcements` page + nav

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`; create `apps/web/src/app/(app)/announcements/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add types + methods:
```ts
export interface SentAnnouncement {
  id: string;
  title: string;
  body: string;
  audienceType: "ALL" | "LEVEL" | "CLASS";
  audienceIds: string[];
  channels: string[];
  sentAt: string;
  recipientCount: number;
  readCount: number;
}
export interface ParentAnnouncement {
  recipientId: string;
  announcementId: string;
  title: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}
```
```ts
  createAnnouncement: (input: { title: string; body: string; audienceType: "ALL" | "LEVEL" | "CLASS"; audienceIds: string[]; channels: ("SMS" | "EMAIL")[] }) =>
    authedRequest<{ id: string; recipientCount: number }>("/v1/announcements", { method: "POST", body: JSON.stringify(input) }),
  listAnnouncements: () => authedRequest<SentAnnouncement[]>("/v1/announcements"),
  getParentAnnouncements: () => authedRequest<ParentAnnouncement[]>("/v1/parent/announcements"),
  markAnnouncementRead: (announcementId: string) =>
    authedRequest<{ ok: boolean }>(`/v1/parent/announcements/${announcementId}/read`, { method: "POST" }),
```

- [ ] **Step 2: Staff nav entry** — in `apps/web/src/app/(app)/layout.tsx`, add `Megaphone` to the lucide import and a `NAV_ITEMS` entry (after Release, before Fees):
```tsx
  { href: "/announcements", label: "Announcements", icon: Megaphone },
```
(Import: add `Megaphone,` to the existing `lucide-react` import list.)

- [ ] **Step 3: Create the staff page** — `apps/web/src/app/(app)/announcements/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button, Input, Spinner } from "@mymakaranta/ui";
import { api, type AcademicYear, type SentAnnouncement } from "@/lib/api";

type Audience = "ALL" | "LEVEL" | "CLASS";
interface Opt { id: string; label: string; }

export default function AnnouncementsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<Audience>("ALL");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(false);
  const [levels, setLevels] = useState<Opt[]>([]);
  const [classes, setClasses] = useState<Opt[]>([]);
  const [sent, setSent] = useState<SentAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function loadSent() {
    api.listAnnouncements().then(setSent).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => {
    loadSent();
    api.listClassLevels().then((ls) => setLevels(ls.map((l) => ({ id: l.id, label: l.name })))).catch(() => {});
    api.listClasses().then((cs) => setClasses(cs.map((c) => ({ id: c.id, label: c.name })))).catch(() => {});
  }, []);

  const options = audienceType === "LEVEL" ? levels : audienceType === "CLASS" ? classes : [];

  function toggleId(id: string) {
    setAudienceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send() {
    setError(null); setMsg(null);
    if (!title.trim() || !body.trim()) { setError("Title and message are required."); return; }
    if (audienceType !== "ALL" && audienceIds.length === 0) { setError("Pick at least one target."); return; }
    setBusy(true);
    try {
      const channels: ("SMS" | "EMAIL")[] = [];
      if (sms) channels.push("SMS");
      if (email) channels.push("EMAIL");
      const r = await api.createAnnouncement({ title: title.trim(), body: body.trim(), audienceType, audienceIds: audienceType === "ALL" ? [] : audienceIds, channels });
      setMsg(`Sent to ${r.recipientCount} parent${r.recipientCount === 1 ? "" : "s"}.`);
      setTitle(""); setBody(""); setAudienceIds([]);
      loadSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">Announcements</h1>

      <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 flex flex-col gap-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select value={audienceType} onChange={(e) => { setAudienceType(e.target.value as Audience); setAudienceIds([]); }} className="rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100">
            <option value="ALL">Everyone</option>
            <option value="LEVEL">By class level</option>
            <option value="CLASS">By class</option>
          </select>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
        </div>
        {audienceType !== "ALL" && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => toggleId(o.id)} className={`rounded-input border px-2.5 py-1 text-caption ${audienceIds.includes(o.id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 dark:border-white/10 text-ink-700 dark:text-ink-300"}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-caption text-error">{error}</p>}
        {msg && <p className="text-caption text-success">{msg}</p>}
        <div><Button onClick={send} disabled={busy}>{busy ? <Spinner size="sm" /> : "Send announcement"}</Button></div>
      </div>

      <h2 className="text-small font-semibold text-ink-700 dark:text-ink-300 mt-8 mb-3">Sent</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : sent.length === 0 ? (
        <p className="text-small text-ink-500">No announcements yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sent.map((a) => (
            <div key={a.id} className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                <span className="text-caption text-ink-500 tabular-nums">{a.readCount}/{a.recipientCount} read</span>
              </div>
              <p className="text-small text-ink-500 line-clamp-2">{a.body}</p>
              <p className="text-caption text-ink-300 mt-1">{a.audienceType.toLowerCase()} · {new Date(a.sentAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```
(Confirm `api.listClassLevels()` and `api.listClasses()` exist in `api.ts` returning arrays of `{ id, name }`. If the method names differ, reconcile — search `api.ts` for the class-level + class list calls used by Settings/Classes pages and use those. If a class list method doesn't exist, fetch via the existing classes endpoint the `/classes` page uses.)

- [ ] **Step 4: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean (pre-existing `no-page-custom-font` warning unrelated); `/announcements` builds. Reconcile `listClassLevels`/`listClasses` names, `Input`/`Button`/`Spinner` imports, tokens (`bg-paper`/`bg-surface`/`text-error`/`text-success`/`text-caption`/`rounded-card`/`rounded-input`/`brand-500` real).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/announcements"
git commit -m "feat(announcements): staff compose + sent list page + nav"
```

---

## Task 4: Web — parent inbox + parent nav

**Files:** Modify `apps/web/src/app/(app)/layout.tsx`; create `apps/web/src/app/(app)/parent/announcements/page.tsx`

- [ ] **Step 1: Parent nav entry** — in `apps/web/src/app/(app)/layout.tsx`, extend `PARENT_NAV`:
```tsx
const PARENT_NAV = [
  { href: "/parent", label: "Fees", icon: Wallet },
  { href: "/parent/announcements", label: "Announcements", icon: Megaphone },
];
```
(`Megaphone` is already imported from Task 3 Step 2.)

- [ ] **Step 2: Create the parent inbox** — `apps/web/src/app/(app)/parent/announcements/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@mymakaranta/ui";
import { api, type ParentAnnouncement } from "@/lib/api";

export default function ParentAnnouncementsPage() {
  const [items, setItems] = useState<ParentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    api.getParentAnnouncements().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function open(a: ParentAnnouncement) {
    setOpenId(a.announcementId === openId ? null : a.announcementId);
    if (!a.readAt) {
      try {
        await api.markAnnouncementRead(a.announcementId);
        setItems((prev) => prev.map((x) => (x.announcementId === a.announcementId ? { ...x, readAt: new Date().toISOString() } : x)));
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Announcements</h1>
        <p className="text-small text-ink-500">Messages from your school.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-8 text-center">
          <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">No announcements yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((a) => (
            <button
              key={a.announcementId}
              onClick={() => open(a)}
              className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-body font-medium text-ink-1000 dark:text-ink-100">{a.title}</p>
                {!a.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
              </div>
              <p className="text-caption text-ink-300 mt-0.5">{new Date(a.sentAt).toLocaleString()}</p>
              {openId === a.announcementId && <p className="text-small text-ink-700 dark:text-ink-300 mt-2 whitespace-pre-wrap">{a.body}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean; `/parent/announcements` builds. Confirm `Spinner` import + tokens.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/parent/announcements"
git commit -m "feat(announcements): parent inbox + parent nav entry"
```

---

## Task 5: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs` Prisma script, deleted after) a school + current term + a class + a student + a guardian→parent with a loginable phone, AND onboard a proprietor (gets `announcements.create`/`.view`). As the proprietor: `POST /v1/announcements` (audienceType CLASS or ALL, channels ["SMS","EMAIL"]) → assert `recipientCount` > 0 + mock SMS/email logged in the API output; `GET /v1/announcements` → the sent item with `recipientCount`/`readCount: 0`. OTP-login as the recipient parent → `GET /v1/parent/announcements` → the item, `readAt: null` → `POST /v1/parent/announcements/:id/read` → 200 → re-list shows `readAt` set → `GET /v1/announcements` (proprietor) shows `readCount: 1`. Negatives: a foreign-school class id → 400; mark-read a non-recipient announcement → 404. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 6 slice 1 entry (announcements: 2 models + RLS, `POST/GET /v1/announcements`, parent inbox + mark-read, SMS/email fan-out, staff + parent web, e2e count 167). Note **Sprint 6 (Communication) in progress — slice 2 (receipts + staff/student audiences) + slice 3 (direct messaging) remain**. Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit (`pnpm exec jest`) + web vitest + UI vitest + builds, then merge `sprint-6-announcements` → main per the user's choice.

---

## Notes for the implementer
- **Two models + 2 migrations.** Stop any `pnpm dev` before `prisma migrate`/`build` (Windows engine DLL lock). The RLS migration is created `--create-only` then hand-filled (mirror `*_rls_fee_reminder`), then applied.
- **Explicit tenant scoping** — every read/write carries `where: { schoolId }`; the `enrollment` reads scope via `class: { schoolId }` / `classId in` school-validated ids; guardians via `student: { schoolId }`. Validate audience ids belong to the school (count match) → 400 on a foreign id.
- **Dedup recipients by `parentId`** — a parent with multiple targeted children gets ONE `AnnouncementRecipient`. The `@@unique([announcementId, parentId])` is the backstop; the `[...new Set(...)]` does it up front.
- **Fan-out is best-effort + synchronous** — per-recipient SMS/email failures are swallowed (the recipient row persists; the flag stays false), mirroring `collections.service.sendReminder`. `sms.send(phone, text)`; `email.send({ to, subject, html, text })`.
- **Parent routes are identity-gated** (`JwtAuthGuard` + an in-handler `identityType === "PARENT"` check), NOT perm-gated — parents aren't granted `announcements.*`. Non-parents get `[]` (inbox) / 404 (mark-read).
- **`announcements.create`/`announcements.view`** are already seeded + proprietor-granted (grant-all at onboarding) — no new permission, no backfill.
- **Web reconciliation** — confirm `api.listClassLevels()`/`api.listClasses()` exist (the Settings/Classes pages use them); if names differ, use the actual ones. `Megaphone` from `lucide-react`. Tokens: `bg-paper`/`bg-surface`(+`-dark`), `text-ink-{300,500,700,1000}`, `text-error`/`text-success`/`text-caption`, `rounded-card`/`rounded-input`, `brand-500` are real; `bg-canvas`/`text-brand-600` are not.
- **No new npm deps, no Prisma enum** (audienceType/channels are plain strings — avoids the enum-pruning gotcha).
```
