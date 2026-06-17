# Announcement Receipts + Staff Audience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An author can target staff (SMS/email) alongside parents, and sees a per-recipient delivery/read receipts breakdown for any announcement.

**Architecture:** Generalize `AnnouncementRecipient` to polymorphic (`recipientType` + `recipientId`) via a data-preserving migration; extend `AnnouncementsService.create` with a `roles` axis + per-type fan-out; add `getRecipients` (receipts) + `GET /v1/announcements/:id`; the parent inbox shifts its queries from `parentId` to `recipientType="PARENT"`. Web: role toggles on compose + a receipts detail page. No new npm deps.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS); Next.js 15 / React 19; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-6-slice-2-announcement-receipts-design.md`

**Branch:** `sprint-6-announcement-receipts` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; per-type recipient re-validation; uniform 404 on a foreign announcement id; e2e service-level inside `TenantContext.run`; `noUncheckedIndexedAccess`. `SmsService` (core/auth) + `EMAIL_SERVICE`/`EmailService` (core/email). `Staff` has non-null `phone` + `email`; `Parent.email` is nullable. Seeded perms `announcements.create`/`.view`. **Windows: stop any `pnpm dev` before `prisma migrate`/`build`; if EPERM engine-lock, kill stray jest workers.**

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (generalize `AnnouncementRecipient`, drop `Parent.announcementRecipients`); create 1 data-preserving migration
- Modify: `apps/api/src/modules/announcements/{announcements.service.ts (full rewrite), dto.ts, announcements.controller.ts}`, `apps/api/test/announcements.e2e-spec.ts`
- Web — Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/announcements/page.tsx` (role toggles + link to receipts); Create: `apps/web/src/app/(app)/announcements/[id]/page.tsx`

---

## Task 1: Schema — polymorphic recipient + data-preserving migration  *(orchestrator-executed)*

**Files:** Modify `apps/api/prisma/schema.prisma`; create a migration. **Stop any dev server first.**

- [ ] **Step 1: Edit `model AnnouncementRecipient`** in `schema.prisma` — replace `parentId`/`parent` with the polymorphic columns:
```prisma
model AnnouncementRecipient {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  announcementId String
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  recipientType  String
  recipientId    String
  readAt         DateTime?
  smsSent        Boolean      @default(false)
  emailSent      Boolean      @default(false)

  @@unique([announcementId, recipientType, recipientId])
  @@index([schoolId, recipientType, recipientId])
}
```
And remove the `announcementRecipients AnnouncementRecipient[]` back-relation line from `model Parent` (keep it on `School`).

- [ ] **Step 2: Create the migration shell** — `cd apps/api && pnpm prisma migrate dev --create-only --name announcement_recipient_polymorphic`. Prisma generates destructive SQL (drops `parentId`, adds NOT-NULL columns with no backfill).

- [ ] **Step 3: Replace the generated `migration.sql`** with the data-preserving version below (KEEP the exact new-index names Prisma generated in the file — copy them from the generated SQL if they differ from these, since Postgres truncates >63-char names):
```sql
-- Generalize AnnouncementRecipient to a polymorphic recipient, preserving slice-1 PARENT rows.
ALTER TABLE "AnnouncementRecipient" ADD COLUMN "recipientType" TEXT;
ALTER TABLE "AnnouncementRecipient" ADD COLUMN "recipientId" TEXT;
UPDATE "AnnouncementRecipient" SET "recipientType" = 'PARENT', "recipientId" = "parentId";
ALTER TABLE "AnnouncementRecipient" ALTER COLUMN "recipientType" SET NOT NULL;
ALTER TABLE "AnnouncementRecipient" ALTER COLUMN "recipientId" SET NOT NULL;

ALTER TABLE "AnnouncementRecipient" DROP CONSTRAINT "AnnouncementRecipient_parentId_fkey";
DROP INDEX "AnnouncementRecipient_announcementId_parentId_key";
DROP INDEX "AnnouncementRecipient_schoolId_parentId_idx";
ALTER TABLE "AnnouncementRecipient" DROP COLUMN "parentId";

CREATE UNIQUE INDEX "AnnouncementRecipient_announcementId_recipientType_recipi_key" ON "AnnouncementRecipient"("announcementId", "recipientType", "recipientId");
CREATE INDEX "AnnouncementRecipient_schoolId_recipientType_recipientId_idx" ON "AnnouncementRecipient"("schoolId", "recipientType", "recipientId");
```
(If Prisma's generated file used different truncated names for the two new indexes, use ITS names verbatim so future migrate runs see no drift — the orchestrator reconciles this when running.)

- [ ] **Step 4: Apply** — `cd apps/api && pnpm prisma migrate dev` → applies the migration + regenerates the client. (If EPERM: kill stray `node .../jest/bin/jest.js` workers, retry.) Verify any pre-existing slice-1 `AnnouncementRecipient` rows now have `recipientType='PARENT'`, `recipientId` = the old parentId (e.g. via `pnpm prisma studio` or a quick count — optional).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(announcements): polymorphic AnnouncementRecipient (PARENT/STAFF), data-preserving migration"
```

---

## Task 2: API — service rewrite + DTO + receipts route + e2e

**Files:** Modify `apps/api/src/modules/announcements/{announcements.service.ts, dto.ts, announcements.controller.ts}`, `apps/api/test/announcements.e2e-spec.ts`

- [ ] **Step 1: Extend the e2e** — in `apps/api/test/announcements.e2e-spec.ts`, (a) seed staff in the existing `broadcast` describe's `beforeAll` (add after the parents are created):
```ts
      await prisma.staff.createMany({ data: [
        { schoolId, staffNo: `ST1-${suffix}`, firstName: "Staff", lastName: "One", email: `st1-${suffix}@e.test`, phone: `+234870${String(suffix).slice(-7)}` },
        { schoolId, staffNo: `ST2-${suffix}`, firstName: "Staff", lastName: "Two", email: `st2-${suffix}@e.test`, phone: `+234871${String(suffix).slice(-7)}` },
      ] });
```
(b) Update EXISTING `create(...)` calls in this file to pass `roles: ["PARENT"]` (the create signature now takes roles; omitting defaults to PARENT, but be explicit in the existing assertions that target parents). Then add new tests inside the `broadcast` describe:
```ts
    it("targets PARENT + STAFF: class parents (deduped) + all staff, each delivered", async () => {
      const r = await asA(() => svc.create({ title: "Both", body: "All hands.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"], roles: ["PARENT", "STAFF"] }, author()));
      expect(r.recipientCount).toBe(3); // 1 deduped class parent + 2 staff
      const rows = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(rows.filter((x) => x.recipientType === "PARENT").length).toBe(1);
      expect(rows.filter((x) => x.recipientType === "STAFF").length).toBe(2);
      expect(rows.every((x) => x.smsSent && x.emailSent)).toBe(true);
    });

    it("STAFF-only audience resolves all staff, no parents", async () => {
      const r = await asA(() => svc.create({ title: "Staff memo", body: "Meeting 4pm.", audienceType: "ALL", audienceIds: [], channels: ["SMS"], roles: ["STAFF"] }, author()));
      const rows = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(rows.length).toBe(2);
      expect(rows.every((x) => x.recipientType === "STAFF")).toBe(true);
    });

    it("getRecipients returns the per-recipient breakdown + aggregates; foreign id 404", async () => {
      const created = await asA(() => svc.create({ title: "Receipts", body: "Check.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"], roles: ["PARENT", "STAFF"] }, author()));
      const rec = await asA(() => svc.getRecipients(created.id));
      expect(rec.aggregates.total).toBe(3);
      expect(rec.aggregates.readCount).toBe(0);
      expect(rec.aggregates.smsCount).toBe(3);
      expect(rec.aggregates.emailCount).toBe(3); // staff have email; the 2-kids parent has an email
      expect(rec.recipients.every((x) => x.name && x.name !== "Unknown")).toBe(true);
      await expect(asB(() => svc.getRecipients(created.id))).rejects.toThrow(NotFoundException);
      // a parent reads → readCount bumps, that row's readAt set; staff rows stay null
      const parentUser = { id: "pu", phone: "+2348094000001", schoolId, identityType: "PARENT" as const, identityId: parentTwoKidsId };
      await asA(() => svc.markRead(created.id, parentUser));
      const rec2 = await asA(() => svc.getRecipients(created.id));
      expect(rec2.aggregates.readCount).toBe(1);
      expect(rec2.recipients.find((x) => x.recipientType === "STAFF")!.readAt).toBeNull();
    });
```
(The existing "creates an announcement to a CLASS…", "ALL audience…", parent-inbox, foreign-class, and tenant-isolation tests remain — just add `roles: ["PARENT"]` to their `create` calls. The parent-inbox test still asserts the slice-1 path works after the migration.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: FAIL — `svc.getRecipients is not a function` and/or recipientType assertions (parentId removed).

- [ ] **Step 3: Update the DTO** — `apps/api/src/modules/announcements/dto.ts`:
```ts
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAnnouncementDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsIn(["ALL", "LEVEL", "CLASS"]) audienceType!: "ALL" | "LEVEL" | "CLASS";
  @IsOptional() @IsArray() @IsString({ each: true }) audienceIds?: string[];
  @IsOptional() @IsArray() @IsIn(["SMS", "EMAIL"], { each: true }) channels?: ("SMS" | "EMAIL")[];
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(["PARENT", "STAFF"], { each: true }) roles?: ("PARENT" | "STAFF")[];
}
```
(roles is optional → defaults to `["PARENT"]` in the service for back-compat; an explicit empty array is rejected by `@ArrayNotEmpty`.)

- [ ] **Step 4: Rewrite the service** — replace `apps/api/src/modules/announcements/announcements.service.ts` with:
```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { SmsService } from "../../core/auth/sms.service";
import { EMAIL_SERVICE, type EmailService } from "../../core/email/email.types";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import type { CreateAnnouncementDto } from "./dto";

interface Recipient { recipientType: "PARENT" | "STAFF"; recipientId: string; }

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

  async create(dto: CreateAnnouncementDto, user: RequestUser) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const recipients = await this.resolveRecipients(dto, schoolId);
    const selected = (dto.channels ?? []).filter((c) => c === "SMS" || c === "EMAIL");
    const channels = ["IN_APP", ...selected];
    const ann = await this.prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: { schoolId, authorId: user.id, title: dto.title, body: dto.body, audienceType: dto.audienceType, audienceIds: dto.audienceIds ?? [], channels },
      });
      if (recipients.length > 0) {
        await tx.announcementRecipient.createMany({ data: recipients.map((r) => ({ schoolId, announcementId: a.id, recipientType: r.recipientType, recipientId: r.recipientId })) });
      }
      return a;
    });
    const wantSms = selected.includes("SMS");
    const wantEmail = selected.includes("EMAIL");
    if ((wantSms || wantEmail) && recipients.length > 0) {
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
      const text = `${dto.title} — ${dto.body}`;
      for (const c of contacts) {
        let smsSent = false;
        let emailSent = false;
        if (wantSms) { try { await this.sms.send(c.phone, text); smsSent = true; } catch { /* non-fatal */ } }
        if (wantEmail && c.email) { try { await this.email.send({ to: c.email, subject: dto.title, html: `<p>${dto.body}</p>`, text }); emailSent = true; } catch { /* non-fatal */ } }
        if (smsSent || emailSent) {
          await this.prisma.announcementRecipient.updateMany({ where: { schoolId, announcementId: ann.id, recipientType: c.type, recipientId: c.id }, data: { smsSent, emailSent } });
        }
      }
    }
    return { id: ann.id, recipientCount: recipients.length };
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
      },
      recipients,
    };
  }

  async getForParent(user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const rows = await this.prisma.announcementRecipient.findMany({
      where: { schoolId, recipientType: "PARENT", recipientId: user.identityId },
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
      where: { schoolId, announcementId, recipientType: "PARENT", recipientId: user.identityId },
      data: { readAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException("Announcement not found.");
    return { ok: true };
  }
}
```

- [ ] **Step 5: Add the receipts route** — in `apps/api/src/modules/announcements/announcements.controller.ts`, add `Param` to the `@nestjs/common` import if missing, and add below the `list` handler:
```ts
  @Get("announcements/:id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("announcements.view")
  receipts(@Param("id") id: string) {
    return this.service.getRecipients(id);
  }
```
(`Param` is already imported for the parent mark-read route — confirm; if not, add it.)

- [ ] **Step 6: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: PASS (9 tests — 6 updated slice-1 + 3 new).

- [ ] **Step 7: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (25 suites / 170 tests), build + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/announcements apps/api/test/announcements.e2e-spec.ts
git commit -m "feat(announcements): roles axis (PARENT/STAFF) + receipts breakdown endpoint"
```

---

## Task 3: Web — compose role toggles + receipts detail page

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/announcements/page.tsx`; create `apps/web/src/app/(app)/announcements/[id]/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts`: (a) change `createAnnouncement`'s input to include `roles`; (b) add a receipts type + method:
```ts
  createAnnouncement: (input: { title: string; body: string; audienceType: "ALL" | "LEVEL" | "CLASS"; audienceIds: string[]; channels: ("SMS" | "EMAIL")[]; roles: ("PARENT" | "STAFF")[] }) =>
    authedRequest<{ id: string; recipientCount: number }>("/v1/announcements", { method: "POST", body: JSON.stringify(input) }),
```
```ts
export interface AnnouncementReceipts {
  id: string;
  title: string;
  body: string;
  audienceType: string;
  channels: string[];
  sentAt: string;
  aggregates: { total: number; readCount: number; smsCount: number; emailCount: number };
  recipients: { recipientType: "PARENT" | "STAFF"; recipientId: string; name: string; smsSent: boolean; emailSent: boolean; readAt: string | null }[];
}
```
```ts
  getAnnouncementReceipts: (id: string) => authedRequest<AnnouncementReceipts>(`/v1/announcements/${id}`),
```

- [ ] **Step 2: Compose role toggles** — in `apps/web/src/app/(app)/announcements/page.tsx`: add `parents`/`staff` role state (default parents true), checkboxes next to the SMS/Email toggles, pass `roles` to `createAnnouncement`, guard "pick at least one group", and link each sent-list item to the receipts page. Concretely:
  - Add state: `const [toParents, setToParents] = useState(true); const [toStaff, setToStaff] = useState(false);`
  - In `send()`, build `const roles: ("PARENT"|"STAFF")[] = []; if (toParents) roles.push("PARENT"); if (toStaff) roles.push("STAFF");` then `if (roles.length === 0) { setError("Pick at least one recipient group."); return; }` and pass `roles` in the `createAnnouncement({...})` call. (The audience selector still drives parents only; if only Staff is selected, audience is ignored server-side.)
  - Add the toggles in the channel row:
```tsx
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toParents} onChange={(e) => setToParents(e.target.checked)} /> Parents</label>
          <label className="flex items-center gap-1.5 text-small text-ink-700 dark:text-ink-300"><input type="checkbox" checked={toStaff} onChange={(e) => setToStaff(e.target.checked)} /> Staff</label>
```
  - Wrap each sent-list card in a link to the receipts page: change the sent-list `<div key={a.id} ...>` to a Next `<Link href={`/announcements/${a.id}`} ...>` (import `Link` from `next/link`) so clicking opens the breakdown. Keep the inner markup.

- [ ] **Step 3: Create the receipts page** — `apps/web/src/app/(app)/announcements/[id]/page.tsx`:
```tsx
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Spinner } from "@mymakaranta/ui";
import { api, type AnnouncementReceipts } from "@/lib/api";

export default function AnnouncementReceiptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AnnouncementReceipts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAnnouncementReceipts(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/announcements" className="text-small text-brand-500">← Announcements</Link>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error || !data ? (
        <div className="mt-4 rounded-card border border-error/40 bg-error/10 p-4 text-small text-error">{error ?? "Not found."}</div>
      ) : (
        <>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mt-3">{data.title}</h1>
          <p className="text-small text-ink-700 dark:text-ink-300 mt-1 whitespace-pre-wrap">{data.body}</p>
          <p className="text-caption text-ink-500 mt-2">{new Date(data.sentAt).toLocaleString()} · {data.channels.join(" + ")}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-small text-ink-700 dark:text-ink-300">
            <span><strong className="tabular-nums">{data.aggregates.readCount}</strong>/{data.aggregates.total} read</span>
            <span className="tabular-nums">{data.aggregates.smsCount} SMS</span>
            <span className="tabular-nums">{data.aggregates.emailCount} email</span>
          </div>

          <div className="mt-6 overflow-x-auto rounded-card border border-ink-100 dark:border-white/10">
            <table className="w-full text-small">
              <thead className="bg-surface dark:bg-surface-dark text-ink-500">
                <tr>
                  <th className="py-2 px-3 text-left font-medium">Recipient</th>
                  <th className="py-2 px-3 text-left font-medium">Type</th>
                  <th className="py-2 px-3 text-center font-medium">SMS</th>
                  <th className="py-2 px-3 text-center font-medium">Email</th>
                  <th className="py-2 px-3 text-center font-medium">Read</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map((r) => (
                  <tr key={`${r.recipientType}-${r.recipientId}`} className="border-t border-ink-100 dark:border-white/10">
                    <td className="py-2 px-3 text-ink-1000 dark:text-ink-100">{r.name}</td>
                    <td className="py-2 px-3"><Badge tone={r.recipientType === "STAFF" ? "info" : "neutral"}>{r.recipientType}</Badge></td>
                    <td className="py-2 px-3 text-center">{r.smsSent ? "✓" : "—"}</td>
                    <td className="py-2 px-3 text-center">{r.emailSent ? "✓" : "—"}</td>
                    <td className="py-2 px-3 text-center">{r.readAt ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```
(Next 15 passes `params` as a Promise to client pages — `use(params)` unwraps it. If the project's other dynamic pages type `params` as a plain object, mirror that instead — check `apps/web/src/app/receipt/[code]/page.tsx` or `report-card/[studentId]` for the established pattern and match it.)

- [ ] **Step 4: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean (pre-existing `no-page-custom-font` warning unrelated); `/announcements/[id]` builds. Reconcile the dynamic-route `params` typing against an existing `[param]` page; confirm `Badge` tone `info`/`neutral` real; tokens real.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/announcements"
git commit -m "feat(announcements): compose role toggles + receipts detail page"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs`, deleted after) a school + current term + a class + a student + a guardian→parent (loginable phone) + 2 staff (phone+email), AND onboard a proprietor. As proprietor: `POST /v1/announcements` with `roles: ["PARENT","STAFF"]`, `channels: ["SMS","EMAIL"]`, CLASS audience → assert recipientCount = parents + 2 staff; mock SMS/email logged for both parent and staff numbers. `GET /v1/announcements/:id` → breakdown shows staff rows (SMS ✓, Email ✓, Read —) + the parent. Parent OTP-login → reads → re-fetch receipts → readCount 1, parent row Read ✓, staff rows Read —. Negative: `GET /v1/announcements/<foreign-id>` → 404. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 6 slice 2 entry (polymorphic recipient + data migration, `roles` axis PARENT/STAFF, `GET /v1/announcements/:id` receipts, web role toggles + receipts page, e2e count 170). Note **Sprint 6 — slice 3 (direct messaging) remains**. Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit (`pnpm exec jest`) + web vitest + UI vitest + builds, then merge `sprint-6-announcement-receipts` → main per the user's choice.

---

## Notes for the implementer
- **Migration is data-preserving + hand-written** (Task 1, orchestrator-run): add nullable columns → backfill `parentId` into `recipientType='PARENT'`/`recipientId` → set NOT NULL → drop old FK/indexes/column → add new unique+index. Use Prisma's generated index NAMES verbatim (Postgres truncates >63 chars). Stop dev servers; kill stray jest workers on EPERM.
- **`roles` defaults to `["PARENT"]`** when omitted/empty-undefined (back-compat with slice-1 callers); an explicit `[]` is rejected (`@ArrayNotEmpty`). This is a deliberate refinement of the spec's "empty → 400" (omission now defaults rather than 400; explicit empty still 400).
- **STAFF = all school staff** (scope-independent); `Staff.phone`/`Staff.email` are non-null. PARENT resolution + per-type re-validation unchanged from slice 1 (Guardian has no schoolId → re-validate via `Parent {schoolId}`; staff via `Staff {schoolId}` implicitly by the scoped findMany).
- **Staff `readAt` stays null** — no staff login/read path this slice; receipts show "—". Expected, not a bug.
- **Parent inbox** must still work post-migration (queries shifted to `recipientType="PARENT"`/`recipientId`). The e2e parent-inbox test is the regression guard.
- **Tenant scoping** — every read/write carries `where: { schoolId }`; the receipts endpoint 404s a foreign announcement id.
- **Tokens/ui** — `Badge` tones `info`/`neutral`, `Spinner`, `bg-surface`(+`-dark`), `text-ink-{100,500,700,1000}`, `text-error`, `text-caption`, `rounded-card`, `brand-500`, `border-error/40 bg-error/10` are real; `bg-canvas`/`text-brand-600` are not.
```
