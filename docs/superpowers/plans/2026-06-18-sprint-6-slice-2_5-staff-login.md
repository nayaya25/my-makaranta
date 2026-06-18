# Staff Login + Staff Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff member logs in via phone-OTP, is auto-linked to their `Staff` record as a `STAFF` identity, and reads announcements targeted to them (populating slice-2 staff receipts).

**Architecture:** Replace `AuthService.linkParentIfMatch` with `linkIdentityIfMatch` (handles Parent + Staff, one-total-match rule; staff gets no permissions). Generalize the announcements inbox methods to any identity + add `/v1/me/announcements` routes (parent routes kept as delegators). A staff `/inbox` web page + nav entry. No new model, no migration, no new npm deps.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-6-slice-2_5-staff-login-design.md`

**Branch:** `sprint-6-staff-login` (already created).

**KEY CONVENTIONS:** mirror `linkParentIfMatch` (atomic conditional `updateMany` claim + `tokenVersion++` + best-effort audit); only PENDING users are ever linked; explicit `schoolId` scoping; identity-gated inbox (recipientType = identityType); e2e via `AppModule` + `auth.requestOtp`/`sms.lastCodeForTest`/`auth.verifyOtp` (model on `test/parent-link.e2e-spec.ts`); `noUncheckedIndexedAccess`. `Staff` has `phone`. Seeded perms unaffected (staff gets NONE).

---

## File Structure
- Modify: `apps/api/src/core/auth/auth.service.ts` (replace `linkParentIfMatch` → `linkIdentityIfMatch` + `linkParent` + `linkStaff`); create `apps/api/test/staff-link.e2e-spec.ts`
- Modify: `apps/api/src/modules/announcements/announcements.service.ts` (rename + generalize inbox methods), `announcements.controller.ts` (parent routes delegate + new `/v1/me` routes), `apps/api/test/announcements.e2e-spec.ts` (rename call sites + a staff-inbox test)
- Web — Modify: `apps/web/src/lib/api.ts` (inbox methods), `apps/web/src/app/(app)/layout.tsx` (Inbox nav); Create: `apps/web/src/app/(app)/inbox/page.tsx`

---

## Task 1: API — `linkIdentityIfMatch` (Parent + Staff) + e2e

**Files:** Modify `apps/api/src/core/auth/auth.service.ts`; create `apps/api/test/staff-link.e2e-spec.ts`

- [ ] **Step 1: Write the failing e2e** — `apps/api/test/staff-link.e2e-spec.ts` (model on `test/parent-link.e2e-spec.ts`):
```ts
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/core/auth/auth.service";
import { SmsService } from "../src/core/auth/sms.service";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Staff link (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let sms: SmsService;
  const phones: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    sms = moduleRef.get(SmsService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await prisma.otpRequest.deleteMany({ where: { phone: { in: phones } } });
    const users = await prisma.user.findMany({ where: { phone: { in: phones } }, select: { id: true } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });

  const stamp = Date.now().toString(36);
  const login = async (phone: string) => {
    await auth.requestOtp(phone);
    const code = sms.lastCodeForTest(phone)!;
    return auth.verifyOtp(phone, code);
  };
  const mkStaff = (schoolId: string, phone: string, tag: string) =>
    prisma.staff.create({ data: { schoolId, staffNo: `SN-${tag}`, firstName: "Staff", lastName: tag, email: `sf-${tag}@e.test`, phone } });

  let schoolAId: string;
  beforeAll(async () => {
    const a = await prisma.school.create({ data: { name: `SL-A-${stamp}`, slug: `sl-a-${stamp}` } });
    schoolAId = a.id;
  });

  it("links a PENDING login to its Staff (exactly one match) with NO permissions", async () => {
    const phone = `+234812${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    const staff = await mkStaff(schoolAId, phone, `one-${stamp}`);
    const res = await login(phone);
    expect(res.user.identityType).toBe("STAFF");
    expect(res.user.schoolId).toBe(schoolAId);
    const user = await prisma.user.findFirstOrThrow({ where: { phone } });
    expect(user.identityId).toBe(staff.id);
    const perms = await prisma.userPermission.count({ where: { userId: user.id } });
    expect(perms).toBe(0);
  });

  it("stays PENDING when a phone matches one Parent AND one Staff (ambiguous)", async () => {
    const phone = `+234813${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    await mkStaff(schoolAId, phone, `amb-${stamp}`);
    await prisma.parent.create({ data: { schoolId: schoolAId, phone, firstName: "P", lastName: "A", email: `pa-${stamp}@e.test` } });
    const res = await login(phone);
    expect(res.user.identityType).toBe("PENDING");
    expect(res.user.schoolId).toBeNull();
  });

  it("stays PENDING when the phone matches two Staff", async () => {
    const phone = `+234814${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    await mkStaff(schoolAId, phone, `two1-${stamp}`);
    await mkStaff(schoolAId, phone, `two2-${stamp}`);
    const res = await login(phone);
    expect(res.user.identityType).toBe("PENDING");
  });

  it("re-login is idempotent — stays STAFF", async () => {
    const phone = `+234815${String(Date.now()).slice(-7)}`;
    phones.push(phone);
    await mkStaff(schoolAId, phone, `idem-${stamp}`);
    await login(phone);
    const res = await login(phone);
    expect(res.user.identityType).toBe("STAFF");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json staff-link`
Expected: FAIL — the staff phone logs in as `PENDING` (no staff link yet).

- [ ] **Step 3: Refactor the link logic** in `apps/api/src/core/auth/auth.service.ts`. (a) In `verifyOtp`, change the call site:
```ts
    user = await this.linkIdentityIfMatch(user);
```
(b) Replace the entire `private async linkParentIfMatch<T...>(...) { ... }` method with the three methods below:
```ts
  /**
   * Auto-claim a freshly auto-provisioned (PENDING) login when their phone matches EXACTLY ONE
   * identity total — one Parent (xor) one Staff. Zero, multiple, or a cross-type tie (one Parent
   * AND one Staff) is ambiguous and left PENDING until explicitly claimed.
   */
  private async linkIdentityIfMatch<T extends { id: string; phone: string | null; identityType: string }>(
    user: T,
  ): Promise<T> {
    if (user.identityType !== "PENDING" || !user.phone) return user;
    const [parents, staff] = await Promise.all([
      this.prisma.parent.findMany({ where: { phone: user.phone }, select: { id: true, schoolId: true } }),
      this.prisma.staff.findMany({ where: { phone: user.phone }, select: { id: true, schoolId: true } }),
    ]);
    if (parents.length + staff.length !== 1) return user;
    if (parents.length === 1) return this.linkParent(user, parents[0]!);
    return this.linkStaff(user, staff[0]!);
  }

  private async linkParent<T extends { id: string; identityType: string }>(
    user: T,
    parent: { id: string; schoolId: string },
  ): Promise<T> {
    const { linked, fresh } = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({
        where: { id: user.id, identityType: "PENDING" },
        data: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId, tokenVersion: { increment: 1 } },
      });
      if (claim.count === 0) {
        return { linked: false, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
      }
      const perms = await tx.permission.findMany({
        where: { key: { in: ["fees.pay.own", "results.view.own"] } },
        select: { id: true },
      });
      if (perms.length > 0) {
        await tx.userPermission.createMany({
          data: perms.map((p) => ({ userId: user.id, permissionId: p.id, scope: {} })),
          skipDuplicates: true,
        });
      }
      return { linked: true, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
    });
    if (linked) {
      try {
        await this.prisma.auditLog.create({
          data: { schoolId: parent.schoolId, actorId: user.id, action: "User.linkParent", resourceType: "User", resourceId: user.id, after: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId } },
        });
      } catch { /* best-effort audit; never break login */ }
    }
    return fresh as unknown as T;
  }

  private async linkStaff<T extends { id: string; identityType: string }>(
    user: T,
    staff: { id: string; schoolId: string },
  ): Promise<T> {
    const { linked, fresh } = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({
        where: { id: user.id, identityType: "PENDING" },
        data: { identityType: "STAFF", identityId: staff.id, schoolId: staff.schoolId, tokenVersion: { increment: 1 } },
      });
      if (claim.count === 0) {
        return { linked: false, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
      }
      // No permission grants — a STAFF identity is not tool access (RBAC assignment is a separate slice).
      return { linked: true, fresh: await tx.user.findFirstOrThrow({ where: { id: user.id } }) };
    });
    if (linked) {
      try {
        await this.prisma.auditLog.create({
          data: { schoolId: staff.schoolId, actorId: user.id, action: "User.linkStaff", resourceType: "User", resourceId: user.id, after: { identityType: "STAFF", identityId: staff.id, schoolId: staff.schoolId } },
        });
      } catch { /* best-effort audit; never break login */ }
    }
    return fresh as unknown as T;
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json staff-link` then `pnpm exec jest --config ./test/jest-e2e.json parent-link`
Expected: staff-link 4/4 PASS; parent-link still PASS (the single-Parent-no-Staff path is unchanged).

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/core/auth/auth.service.ts apps/api/test/staff-link.e2e-spec.ts
git commit -m "feat(auth): link STAFF identity at OTP verify (one-total-match; no perms)"
```

---

## Task 2: API — generalize the inbox + `/v1/me/announcements`

**Files:** Modify `apps/api/src/modules/announcements/announcements.service.ts`, `announcements.controller.ts`, `apps/api/test/announcements.e2e-spec.ts`

- [ ] **Step 1: Update the e2e** — in `apps/api/test/announcements.e2e-spec.ts`: (a) rename the existing `svc.getForParent(...)` calls to `svc.getInbox(...)` and `svc.markRead(...)` to `svc.markReadForUser(...)` (the parent-inbox test + the receipts mark-read in the getRecipients test). (b) Add a staff-inbox test inside the `broadcast` describe (it relies on the staff seeded for the slice-2 tests + an announcement with STAFF recipients):
```ts
    it("a STAFF recipient reads via getInbox; receipts readCount reflects it", async () => {
      const created = await asA(() => svc.create({ title: "StaffRead", body: "Read me.", audienceType: "ALL", audienceIds: [], channels: [], roles: ["STAFF"] }, author()));
      // find a staff recipient id
      const staffRow = await prisma.announcementRecipient.findFirstOrThrow({ where: { schoolId, announcementId: created.id, recipientType: "STAFF" } });
      const staffUser = { id: "su", phone: "+2340000000009", schoolId, identityType: "STAFF" as const, identityId: staffRow.recipientId };
      const inbox = await asA(() => svc.getInbox(staffUser));
      expect(inbox.some((x) => x.announcementId === created.id)).toBe(true);
      expect(inbox.find((x) => x.announcementId === created.id)!.readAt).toBeNull();
      await asA(() => svc.markReadForUser(created.id, staffUser));
      const rec = await asA(() => svc.getRecipients(created.id));
      expect(rec.aggregates.readCount).toBe(1);
      // a non-recipient staff id → mark-read 404
      await expect(asA(() => svc.markReadForUser(created.id, { ...staffUser, identityId: "no-such-staff" }))).rejects.toThrow(NotFoundException);
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: FAIL — `svc.getInbox`/`svc.markReadForUser` not a function.

- [ ] **Step 3: Rename + generalize the service methods** — in `apps/api/src/modules/announcements/announcements.service.ts`, replace `getForParent` and `markRead` with:
```ts
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
```

- [ ] **Step 4: Update the controller** — in `apps/api/src/modules/announcements/announcements.controller.ts`, point the existing parent routes at the renamed methods and add the `/v1/me` routes:
```ts
  @Get("parent/announcements")
  @UseGuards(JwtAuthGuard)
  parentInbox(@CurrentUser() user: RequestUser) {
    return this.service.getInbox(user);
  }

  @Post("parent/announcements/:announcementId/read")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  parentMarkRead(@Param("announcementId") announcementId: string, @CurrentUser() user: RequestUser) {
    return this.service.markReadForUser(announcementId, user);
  }

  @Get("me/announcements")
  @UseGuards(JwtAuthGuard)
  myInbox(@CurrentUser() user: RequestUser) {
    return this.service.getInbox(user);
  }

  @Post("me/announcements/:announcementId/read")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  myMarkRead(@Param("announcementId") announcementId: string, @CurrentUser() user: RequestUser) {
    return this.service.markReadForUser(announcementId, user);
  }
```
(Replace the old `parentInbox`/`markRead` handler bodies that called `getForParent`/`markRead`. Keep method names unique within the controller — `parentInbox`/`parentMarkRead`/`myInbox`/`myMarkRead`.)

- [ ] **Step 5: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json announcements`
Expected: PASS (10 tests — 9 prior + the staff-inbox test).

- [ ] **Step 6: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (26 suites / 175 tests), build + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/announcements apps/api/test/announcements.e2e-spec.ts
git commit -m "feat(announcements): generalize inbox to any identity + /v1/me/announcements (staff inbox)"
```

---

## Task 3: Web — api client + staff `/inbox` + nav

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`; create `apps/web/src/app/(app)/inbox/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add (reuse the existing `ParentAnnouncement` type):
```ts
  getMyAnnouncements: () => authedRequest<ParentAnnouncement[]>("/v1/me/announcements"),
  markMyAnnouncementRead: (announcementId: string) =>
    authedRequest<{ ok: boolean }>(`/v1/me/announcements/${announcementId}/read`, { method: "POST" }),
```

- [ ] **Step 2: Inbox nav entry** — in `apps/web/src/app/(app)/layout.tsx`, add `Inbox` to the lucide import and a `NAV_ITEMS` entry (after Announcements, before Settings):
```tsx
  { href: "/inbox", label: "Inbox", icon: Inbox },
```
(Import: add `Inbox,` to the `lucide-react` import list.)

- [ ] **Step 3: Create the staff inbox page** — `apps/web/src/app/(app)/inbox/page.tsx` (mirrors the parent inbox, pointed at `/v1/me`):
```tsx
"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@mymakaranta/ui";
import { api, type ParentAnnouncement } from "@/lib/api";

export default function InboxPage() {
  const [items, setItems] = useState<ParentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.getMyAnnouncements().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function open(a: ParentAnnouncement) {
    setOpenId(a.announcementId === openId ? null : a.announcementId);
    if (!a.readAt) {
      try {
        await api.markMyAnnouncementRead(a.announcementId);
        setItems((prev) => prev.map((x) => (x.announcementId === a.announcementId ? { ...x, readAt: new Date().toISOString() } : x)));
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Inbox</h1>
        <p className="text-small text-ink-500">Announcements from your school.</p>
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

- [ ] **Step 4: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean (pre-existing `no-page-custom-font` warning unrelated); `/inbox` builds. Confirm `Inbox` exists in lucide-react; `Spinner` import + tokens real.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/inbox"
git commit -m "feat(announcements): staff /inbox page + nav (uses /v1/me/announcements)"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real OTP + guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Seed (one-off `apps/api/*.mjs`, deleted after) a school + a Staff (unique loginable phone), AND onboard a proprietor; the proprietor `POST /v1/announcements` with `roles: ["STAFF"]`. Then OTP-login the staff phone → `GET /me` shows `identityType "STAFF"` + `identityId` + `schoolId`; `GET /v1/me/announcements` returns the announcement (`readAt` null) → `POST /v1/me/announcements/:id/read` → 200 → proprietor `GET /v1/announcements/:id` shows that staff row Read ✓. Negative: a staff phone that also matches a Parent → `GET /me` stays `PENDING`. Confirm a parent login still reads `/v1/parent/announcements` (or `/v1/me/announcements`). Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 6 slice 2.5 entry (staff OTP auto-link → STAFF identity, no perms; combined one-match `linkIdentityIfMatch`; generalized inbox + `/v1/me/announcements`; staff `/inbox` page; e2e count 175). Note **Sprint 6 — slice 3 (direct messaging) now unblocked**. Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit + web vitest + UI vitest + builds, then merge `sprint-6-staff-login` → main per the user's choice.

---

## Notes for the implementer
- **Mirror `linkParentIfMatch` exactly** for the claim/audit pattern — the parent branch (`linkParent`) is the existing code verbatim; `linkStaff` is the same shape minus the permission grant. Only PENDING users are linked; non-PENDING never relinked.
- **One-total-match rule:** `parents.length + staff.length !== 1` → stay PENDING (covers zero, multi, and the parent+staff cross-type tie). The existing parent-link e2e (single Parent, no Staff) still links PARENT.
- **Staff gets NO permissions** — a STAFF identity is not tool access. A staff hitting a perm-gated endpoint still 403s (expected). Inbox/DM are identity-gated, not perm-gated.
- **Inbox is identity-gated** by `identityType ∈ {PARENT, STAFF}` + `recipientId = identityId`. A PROPRIETOR/PENDING caller → `[]` (no recipient rows of that type). Parent routes kept as delegators so the slice-1 parent web is untouched.
- **No model, no migration.** Stop dev servers before `prisma`/`build`; kill stray jest workers on EPERM.
- **Tokens/ui** — `Inbox` from lucide-react; `Spinner`, `bg-surface`(+`-dark`), `text-ink-{100,300,500,700,1000}`, `text-caption`, `rounded-card`, `brand-500` real; `bg-canvas`/`text-brand-600` not.
```
