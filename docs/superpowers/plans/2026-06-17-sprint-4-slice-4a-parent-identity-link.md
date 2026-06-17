# Parent Identity Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-link a parent's PENDING `User` to their `Parent` record at OTP login (exactly-one phone match), grant parent permissions, and resolve their `Guardian → Student` children.

**Architecture:** A private `linkParentIfMatch` step inside `AuthService.verifyOtp` + a small `ParentService`/controller for `GET /v1/parent/children`. No new model, no migration.

**Tech Stack:** NestJS 11 / Prisma 5; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-17-sprint-4-slice-4a-parent-identity-link-design.md`

**Branch:** `sprint-4-parent-pay` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping in tenant reads; e2e service-level (auth e2e uses `AuthService` + `SmsService.lastCodeForTest` under `NODE_ENV=test`); `noUncheckedIndexedAccess`. Reuse `User.identityType`/`identityId`/`schoolId`/`tokenVersion`, `UserPermission` (`{userId, permissionId, scope}`, `@@id([userId, permissionId])`), seeded perms `fees.pay.own` + `results.view.own`. The proprietor grant pattern is in `apps/api/src/modules/structure/schools.service.ts` (mirror the `userPermission.createMany` + permission-by-key lookup).

---

## File Structure
- Modify: `apps/api/src/core/auth/auth.service.ts` (`linkParentIfMatch` + call it in `verifyOtp`), `test/auth.e2e-spec.ts` (or a new `parent-link.e2e-spec.ts`)
- Create: `apps/api/src/modules/parent/parent.service.ts`, `parent.controller.ts`, `parent.module.ts`; modify `app.module.ts`, create `test/parent-children.e2e-spec.ts` (or extend)

---

## Task 1: Auto-link parent in `verifyOtp` + e2e

**Files:** Modify `apps/api/src/core/auth/auth.service.ts`; create `apps/api/test/parent-link.e2e-spec.ts`

- [ ] **Step 1: Read** `auth.service.ts` `verifyOtp` (resolves/creates the `User`, updates `lastLoginAt`, signs the JWT from `user.schoolId`/`identityType`/`tokenVersion`). Confirm the `User` fields + the `AuthResult` shape.

- [ ] **Step 2: Failing e2e** — `apps/api/test/parent-link.e2e-spec.ts` (service-level; bootstrap a Nest app + get `AuthService`, `SmsService`, `PrismaService` — mirror `auth.e2e-spec.ts`'s setup). Helper: `request+verify` a phone via `auth.requestOtp(phone)` then `sms.lastCodeForTest(phone)!` then `auth.verifyOtp(phone, code)`.
```ts
  describe("parent identity link", () => {
    const stamp = Date.now().toString(36);
    let schoolAId: string; let parentId: string;

    beforeAll(async () => {
      const a = await prisma.school.create({ data: { name: `PL-A-${stamp}`, slug: `pl-a-${stamp}` } });
      schoolAId = a.id;
      const ay = await prisma.academicYear.create({ data: { schoolId: a.id, name: "Y", startDate: new Date(), endDate: new Date() } });
      const term = await prisma.term.create({ data: { schoolId: a.id, academicYearId: ay.id, number: 1, startDate: new Date(), endDate: new Date() } });
      const lvl = await prisma.classLevel.create({ data: { schoolId: a.id, name: `L-${stamp}`, order: 1 } });
      const cls = await prisma.class.create({ data: { schoolId: a.id, classLevelId: lvl.id, name: `C-${stamp}` } });
      const stu = await prisma.student.create({ data: { schoolId: a.id, admissionNo: `PS-${stamp}`, firstName: "Kid", lastName: "One", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
      await prisma.enrollment.create({ data: { studentId: stu.id, classId: cls.id, termId: term.id } });
      const par = await prisma.parent.create({ data: { schoolId: a.id, phone: `+234810${stamp.slice(-7).padStart(7, "0")}`, email: `p-${stamp}@e.test`, firstName: "Par", lastName: "Ent" } });
      parentId = par.id;
      await prisma.guardian.create({ data: { studentId: stu.id, parentId: par.id, relationship: "FATHER", isPrimary: true } });
      (globalThis as Record<string, unknown>).__plPhone = par.phone; // pass the phone to the tests
    });

    const login = async (phone: string) => { await auth.requestOtp(phone); const code = sms.lastCodeForTest(phone)!; return auth.verifyOtp(phone, code); };

    it("links a PENDING user to a single matching Parent + grants parent perms", async () => {
      const phone = (globalThis as Record<string, unknown>).__plPhone as string;
      const res = await login(phone);
      expect(res.user.identityType).toBe("PARENT");
      expect(res.user.schoolId).toBe(schoolAId);
      const u = await prisma.user.findFirstOrThrow({ where: { phone } });
      expect(u.identityId).toBe(parentId);
      const perms = await prisma.userPermission.findMany({ where: { userId: u.id }, include: { permission: { select: { key: true } } } });
      const keys = perms.map((p) => p.permission.key);
      expect(keys).toEqual(expect.arrayContaining(["fees.pay.own", "results.view.own"]));
    });

    it("is idempotent on re-login (no duplicate perms, still PARENT)", async () => {
      const phone = (globalThis as Record<string, unknown>).__plPhone as string;
      const res = await login(phone);
      expect(res.user.identityType).toBe("PARENT");
      const u = await prisma.user.findFirstOrThrow({ where: { phone } });
      const perms = await prisma.userPermission.findMany({ where: { userId: u.id } });
      expect(perms.length).toBe(2); // no duplicates
    });

    it("leaves a non-matching phone PENDING", async () => {
      const phone = `+2348190000${stamp.slice(-4)}`;
      const res = await login(phone);
      expect(res.user.identityType).toBe("PENDING");
      expect(res.user.schoolId).toBeNull();
    });

    it("does not link when the phone matches Parents in multiple schools", async () => {
      const b = await prisma.school.create({ data: { name: `PL-B-${stamp}`, slug: `pl-b-${stamp}` } });
      const multiPhone = `+234820${stamp.slice(-7).padStart(7, "0")}`;
      await prisma.parent.create({ data: { schoolId: schoolAId, phone: multiPhone, firstName: "M", lastName: "A" } });
      await prisma.parent.create({ data: { schoolId: b.id, phone: multiPhone, firstName: "M", lastName: "B" } });
      const res = await login(multiPhone);
      expect(res.user.identityType).toBe("PENDING");
    });
  });
```
Ensure `auth`/`sms`/`prisma` handles exist (mirror `auth.e2e-spec.ts`). Adapt the phone formats to whatever passes the OTP/User `phone` validation (E.164-ish `+234...`); keep them unique per run via `stamp`. (If passing the phone via `globalThis` is awkward, hoist `parentPhone` to a `describe`-scoped `let` set in `beforeAll`.)

- [ ] **Step 3:** `pnpm --filter @mymakaranta/api test:e2e -- parent-link` → FAIL (no link yet; user is PENDING).

- [ ] **Step 4: Implement** in `auth.service.ts`. Add a private method and call it in `verifyOtp` AFTER the user is resolved + `lastLoginAt` updated, BEFORE signing the token (sign from the returned user):
```ts
  private async linkParentIfMatch(user: { id: string; phone: string | null; identityType: string }) {
    if (user.identityType !== "PENDING" || !user.phone) return user;
    const parents = await this.prisma.parent.findMany({ where: { phone: user.phone }, select: { id: true, schoolId: true } });
    if (parents.length !== 1) return user;
    const parent = parents[0]!;
    const perms = await this.prisma.permission.findMany({ where: { key: { in: ["fees.pay.own", "results.view.own"] } }, select: { id: true } });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { identityType: "PARENT", identityId: parent.id, schoolId: parent.schoolId, tokenVersion: { increment: 1 } },
      });
      if (perms.length > 0) {
        await tx.userPermission.createMany({ data: perms.map((p) => ({ userId: user.id, permissionId: p.id, scope: {} })), skipDuplicates: true });
      }
      return updated;
    });
  }
```
Then in `verifyOtp`, after the existing `lastLoginAt` update, replace the token-signing section so it uses the linked user:
```ts
    user = await this.linkParentIfMatch(user);
    const token = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      schoolId: user.schoolId,
      identityType: user.identityType,
      tokenVersion: user.tokenVersion,
    });
    return { token, user: { id: user.id, phone: user.phone!, schoolId: user.schoolId, identityType: user.identityType } };
```
(Confirm the exact existing variable names/shape from Step 1 and integrate minimally — the key change is the `linkParentIfMatch` call before signing, and signing from its result. `createMany` with `scope: {}` matches the proprietor grant in `schools.service.ts`; if `UserPermission.scope` is non-optional Json, `{}` is correct.)

- [ ] **Step 5:** `pnpm --filter @mymakaranta/api test:e2e -- parent-link` → PASS (4). Run the FULL e2e → no regressions (the auth suite especially). typecheck clean.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/core/auth/auth.service.ts apps/api/test/parent-link.e2e-spec.ts
git commit -m "feat(auth): auto-link parent User to Parent at OTP login (exactly-one match) + grant parent perms"
```

---

## Task 2: `GET /v1/parent/children` service + controller + e2e

**Files:** Create `parent.service.ts`, `parent.controller.ts`, `parent.module.ts`; modify `app.module.ts`, create/extend `test/parent-children.e2e-spec.ts`

- [ ] **Step 1: Implement `apps/api/src/modules/parent/parent.service.ts`:**
```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class ParentService {
  constructor(private prisma: PrismaService) {}

  async getChildren(user: RequestUser) {
    if (user.identityType !== "PARENT" || !user.identityId) return [];
    const schoolId = TenantContext.schoolIdOrThrow();
    const parent = await this.prisma.parent.findFirst({ where: { id: user.identityId, schoolId } });
    if (!parent) return [];
    const guardians = await this.prisma.guardian.findMany({
      where: { parentId: parent.id },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    });
    return guardians.map((g) => ({
      studentId: g.student.id,
      name: `${g.student.firstName} ${g.student.lastName}`,
      admissionNo: g.student.admissionNo,
    }));
  }
}
```
(Note: `Guardian` has no `schoolId`; it's gated because the `Parent` was validated tenant-scoped + the parent's own students are this tenant's.)

- [ ] **Step 2: `parent.controller.ts`** (JwtAuthGuard only — any authed user; non-parents get `[]`):
```ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ParentService } from "./parent.service";

@Controller("v1/parent")
export class ParentController {
  constructor(private service: ParentService) {}

  @Get("children")
  @UseGuards(JwtAuthGuard)
  children(@CurrentUser() user: RequestUser) {
    return this.service.getChildren(user);
  }
}
```
Confirm the `JwtAuthGuard` import path matches other controllers.

- [ ] **Step 3: `parent.module.ts`** + register in `app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { ParentController } from "./parent.controller";
import { ParentService } from "./parent.service";

@Module({ imports: [AuthModule], controllers: [ParentController], providers: [ParentService] })
export class ParentModule {}
```
Add `ParentModule` to `app.module.ts` imports.

- [ ] **Step 4: e2e** — `apps/api/test/parent-children.e2e-spec.ts` (service-level; reuse a two-school bootstrap OR extend the parent-link spec). Seed a `Parent` + 2 guardianed students in school A. Build a `RequestUser` for that parent (`{ id, phone, schoolId, identityType: "PARENT" }` — but `identityId` is on the JWT/user, NOT on `RequestUser`!). NOTE: `RequestUser` (`current-user.decorator.ts`) currently has `{ id, phone?, schoolId, identityType }` and NO `identityId`. The `getChildren` service needs `identityId`. **Resolve this:** add `identityId?: string` to `RequestUser` AND include `identityId` in the JWT payload (in `verifyOtp`'s sign) + in `JwtStrategy.validate`'s returned user. Verify the JWT strategy maps `identityId` onto `req.user`. (This is a small, necessary cross-cut — do it in Task 1 or here; if not already present, add it.) Tests:
```ts
  it("returns the linked parent's children", async () => {
    const user = { id: "u1", phone: "x", schoolId: schoolAId, identityType: "PARENT", identityId: parentId };
    const kids = await asA(() => parent.getChildren(user)); // asA runs in TenantContext for school A
    expect(kids.length).toBe(2);
    expect(kids[0]!.name.length).toBeGreaterThan(0);
  });
  it("returns [] for a non-parent user", async () => {
    const kids = await asA(() => parent.getChildren({ id: "u2", phone: "y", schoolId: schoolAId, identityType: "PENDING" }));
    expect(kids).toEqual([]);
  });
  it("returns [] for a parent id from another tenant", async () => {
    const kids = await asB(() => parent.getChildren({ id: "u3", phone: "z", schoolId: schoolBId, identityType: "PARENT", identityId: parentId }));
    expect(kids).toEqual([]); // parent belongs to A; under B's context findFirst returns null
  });
```
Adapt to the file's bootstrap (`asA`/`asB`/`schoolAId`/`schoolBId`/`parent` handle = ParentService). Import what's needed.

- [ ] **Step 5: `RequestUser.identityId` cross-cut** (if not already done in Task 1): add `identityId?: string` to `current-user.decorator.ts`'s `RequestUser`; add `identityId: user.identityId` to the JWT payload in `verifyOtp` (+ `schools.service.ts`'s proprietor token if it should carry it — optional); add `identityId` to `JwtStrategy.validate`'s returned `req.user` object (read `apps/api/src/core/auth/jwt.strategy.ts`). Keep it minimal + consistent.

- [ ] **Step 6:** Run e2e → parent tests + full suite green. `pnpm --filter @mymakaranta/api build` + typecheck clean.

- [ ] **Step 7: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/parent apps/api/src/app.module.ts apps/api/src/core/auth/current-user.decorator.ts apps/api/src/core/auth/jwt.strategy.ts apps/api/test/parent-children.e2e-spec.ts
git commit -m "feat(parent): GET /v1/parent/children (resolves Guardian→Student for the linked parent)"
```

---

## Task 3: API QA + docs + finish

- [ ] **Step 1: API QA** (no parent UI this slice). Start API + web (web only to keep the stack consistent; the QA is API-level). On the QA school "S3 Gradebook QA", a `Parent` may not exist for a loginable phone — **seed one** via a one-off Prisma script (delete after): a `Parent` with a fresh phone (e.g. `+2348077700001`) + a `Guardian` linking an existing student (Ada `cmqe9q2gu000qv6vmuf0b79v4`). Then via `curl`: `POST /auth/otp/request {phone}` → read the OTP from the api log (`code is <6digits>`) → `POST /auth/otp/verify {phone, code}` → decode/inspect the returned `user.identityType === "PARENT"` + `schoolId`; then `GET /v1/parent/children` with the returned token → the seeded child. Confirm a second login is idempotent (still PARENT, 2 perms). Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored). (Gotchas: OTP code regex `code is [0-9]{6}`; the seeded Parent phone must be exactly one match.)

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 4a (parent identity link) built + QA'd; remaining 4b (parent pay portal). Note: parent login now auto-links + grants `fees.pay.own`/`results.view.own`; `GET /v1/parent/children`; `RequestUser`/JWT now carry `identityId`. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-parent-pay` → main per the user's choice).

---

## Notes for the implementer
- **Link only PENDING users; exactly-one Parent match** — zero/multiple → stay PENDING. Never override PROPRIETOR/STAFF.
- **`RequestUser` + JWT must carry `identityId`** — `getChildren` needs it; add it to the payload + `JwtStrategy.validate` + the `RequestUser` type (one small cross-cut). Existing consumers ignore the new optional field.
- **Idempotent** — re-login of a PARENT is a no-op (not PENDING); `createMany skipDuplicates` guards perms.
- **RLS-at-login** — the `Parent`-by-phone lookup has no tenant context (dev superuser works; prod GUC wiring is the standing pre-deploy task).
- **`getChildren` tenant-scopes** the `Parent` by `{ id: identityId, schoolId }` → a cross-tenant `identityId` returns `[]`.
- **No migration, no model, no web UI** (UI is 4b). Don't `next build` while `next dev` runs if you start the web for QA.
