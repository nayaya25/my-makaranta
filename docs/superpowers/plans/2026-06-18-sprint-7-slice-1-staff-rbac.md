# Staff Permission Assignment (RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A proprietor/principal grants a staff member their permissions (role presets + checklist); the staff member logs in and sees + uses exactly their tools.

**Architecture:** A `StaffPermission` join table (perms attach to the `Staff`, not the login). `PermissionsService.keysFor(user)` unions a STAFF caller's `StaffPermission` with `UserPermission`. A `StaffAccessModule` exposes catalog + assignment + `/v1/me/permissions`. Constant role presets. Web: a Settings permissions editor + nav-by-permission. No new npm deps.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19; Jest e2e.

**Spec:** `docs/superpowers/specs/2026-06-18-sprint-7-slice-1-staff-rbac-design.md`

**Branch:** `sprint-7-staff-rbac` (already created).

**KEY CONVENTIONS:** `StaffPermission` mirrors `UserPermission` (no `schoolId`/RLS, NOT in TENANT_MODELS); tenant-IDOR enforced at the endpoint via a scoped `Staff` lookup → 404; replace-as-unit `PUT` in a `$transaction`; e2e service-level inside `TenantContext.run` (model on `test/announcements.e2e-spec.ts`); `noUncheckedIndexedAccess`. `staff.manage` gates assignment. **Windows: stop `pnpm dev` before `prisma migrate`/`build`; kill stray jest workers on EPERM.**

---

## File Structure
- Modify: `apps/api/prisma/schema.prisma` (`StaffPermission` + back-relations on `Staff` + `Permission`), `apps/api/src/app.module.ts`; create 1 migration
- Modify: `apps/api/src/core/auth/permissions/permissions.service.ts` (`keysFor(user)`), `permission.guard.ts` (pass user)
- Create: `apps/api/src/modules/staff-access/{staff-access.module.ts, staff-access.service.ts, staff-access.controller.ts, permission-presets.ts, dto.ts}`, `apps/api/test/staff-access.e2e-spec.ts`
- Web — Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx` (nav-by-permission), `apps/web/src/app/(app)/settings/page.tsx` (link); Create: `apps/web/src/app/(app)/settings/permissions/page.tsx`

---

## Task 1: Schema — `StaffPermission` + migration  *(orchestrator-executed)*

**Files:** Modify `apps/api/prisma/schema.prisma`; create a migration. **Stop any dev server first.**

- [ ] **Step 1: Add the model** to `schema.prisma` (near `UserPermission`):
```prisma
model StaffPermission {
  staffId      String
  permissionId String
  staff        Staff      @relation(fields: [staffId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([staffId, permissionId])
}
```

- [ ] **Step 2: Add back-relations.** In `model Staff { ... }` add `staffPermissions StaffPermission[]`; in `model Permission { ... }` add `staffGrants StaffPermission[]`.

- [ ] **Step 3: Migration** — `cd apps/api && pnpm prisma migrate dev --name staff_permission` (additive, non-interactive OK; regenerates the client). No RLS migration (mirrors `UserPermission`).

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(rbac): StaffPermission model"
```

---

## Task 2: API — keysFor union + StaffAccessService + endpoints + e2e

**Files:** Modify `permissions.service.ts`, `permission.guard.ts`; create `apps/api/src/modules/staff-access/{permission-presets.ts, dto.ts, staff-access.service.ts, staff-access.controller.ts, staff-access.module.ts}`, `apps/api/test/staff-access.e2e-spec.ts`; modify `app.module.ts`

- [ ] **Step 1: Write the failing e2e** — `apps/api/test/staff-access.e2e-spec.ts`:
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
import { PermissionsService } from "../src/core/auth/permissions/permissions.service";
import { StaffAccessModule } from "../src/modules/staff-access/staff-access.module";
import { StaffAccessService } from "../src/modules/staff-access/staff-access.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Staff access (e2e)", () => {
  let prisma: PrismaService;
  let svc: StaffAccessService;
  let perms: PermissionsService;
  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "u";
  let staffT: string;
  let staffB: string;
  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule, PrismaModule, AuthModule, StaffAccessModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    svc = moduleRef.get(StaffAccessService);
    perms = moduleRef.get(PermissionsService);
    const a = await prisma.school.create({ data: { name: `RB A ${suffix}`, slug: `rb-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `RB B ${suffix}`, slug: `rb-b-${suffix}` } });
    schoolBId = b.id;
    const t = await prisma.staff.create({ data: { schoolId, staffNo: `T-${suffix}`, firstName: "Tee", lastName: "Cher", email: `t-${suffix}@e.test`, phone: `+234890${String(suffix).slice(-7)}` } });
    staffT = t.id;
    const sb = await prisma.staff.create({ data: { schoolId: schoolBId, staffNo: `B-${suffix}`, firstName: "Bee", lastName: "Staff", email: `b-${suffix}@e.test`, phone: `+234891${String(suffix).slice(-7)}` } });
    staffB = sb.id;
  });
  afterAll(async () => {
    await prisma.staffPermission.deleteMany({ where: { staffId: { in: [staffT, staffB] } } });
    await prisma.onModuleDestroy();
  });

  it("catalog returns the seeded permissions + presets", async () => {
    const cat = await asA(() => svc.getCatalog());
    expect(cat.catalog.some((c: any) => c.key === "results.record")).toBe(true);
    expect(cat.presets.FORM_TEACHER).toContain("results.record");
  });

  it("set + get staff permissions (replace-as-unit); keysFor unions for a STAFF caller", async () => {
    await asA(() => svc.setStaffPermissions(staffT, ["results.record", "attendance.mark"]));
    const got = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got.keys].sort()).toEqual(["attendance.mark", "results.record"]);
    const keys = await asA(() => perms.keysFor({ id: "any", identityType: "STAFF", identityId: staffT }));
    expect(keys.has("results.record")).toBe(true);
    expect(keys.has("attendance.mark")).toBe(true);
    expect(keys.has("fees.manage")).toBe(false);
    // replace-as-unit
    await asA(() => svc.setStaffPermissions(staffT, ["attendance.view"]));
    const got2 = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got2.keys]).toEqual(["attendance.view"]);
  });

  it("rejects a foreign staff id (404) and a bad permission key (400, no write)", async () => {
    await expect(asA(() => svc.getStaffPermissions(staffB))).rejects.toThrow(NotFoundException);
    await expect(asA(() => svc.setStaffPermissions(staffB, ["results.record"]))).rejects.toThrow(NotFoundException);
    await asA(() => svc.setStaffPermissions(staffT, ["results.record"]));
    await expect(asA(() => svc.setStaffPermissions(staffT, ["not.a.key"]))).rejects.toThrow(BadRequestException);
    const got = await asA(() => svc.getStaffPermissions(staffT));
    expect([...got.keys]).toEqual(["results.record"]); // unchanged by the rejected call
  });

  it("keysFor for a non-STAFF identity does not union staff grants", async () => {
    const keys = await asA(() => perms.keysFor({ id: "any", identityType: "PROPRIETOR", identityId: null }));
    expect(keys.has("results.record")).toBe(false); // no UserPermission rows for 'any'
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json staff-access`
Expected: FAIL — cannot find `staff-access.module`.

- [ ] **Step 3: Presets** — `apps/api/src/modules/staff-access/permission-presets.ts`:
```ts
export const ROLE_PRESETS: Record<string, string[]> = {
  PRINCIPAL: ["students.view", "students.create", "students.update", "staff.view", "classes.view", "classes.manage", "attendance.mark", "attendance.view", "attendance.audit", "results.record", "results.review", "results.release", "results.correct", "assessment.configure", "fees.view", "announcements.create", "announcements.view", "reports.view"],
  FORM_TEACHER: ["students.view", "classes.view", "attendance.mark", "attendance.view", "results.record", "results.review", "announcements.view", "reports.view"],
  SUBJECT_TEACHER: ["students.view", "classes.view", "attendance.mark", "attendance.view", "results.record", "announcements.view"],
  BURSAR: ["students.view", "fees.view", "fees.manage", "reports.view", "announcements.view"],
  EXAM_OFFICER: ["students.view", "classes.view", "results.review", "results.release", "assessment.configure", "announcements.view"],
};
```

- [ ] **Step 4: DTO** — `apps/api/src/modules/staff-access/dto.ts`:
```ts
import { IsArray, IsString } from "class-validator";

export class SetStaffPermissionsDto {
  @IsArray() @IsString({ each: true }) keys!: string[];
}
```

- [ ] **Step 5: Service** — `apps/api/src/modules/staff-access/staff-access.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ROLE_PRESETS } from "./permission-presets";

@Injectable()
export class StaffAccessService {
  constructor(private prisma: PrismaService) {}

  async getCatalog() {
    const catalog = await this.prisma.permission.findMany({ orderBy: { key: "asc" }, select: { key: true, description: true } });
    return { catalog, presets: ROLE_PRESETS };
  }

  private async assertStaff(staffId: string, schoolId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true } });
    if (!staff) throw new NotFoundException("Staff not found in this school.");
  }

  async getStaffPermissions(staffId: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertStaff(staffId, schoolId);
    const rows = await this.prisma.staffPermission.findMany({ where: { staffId }, include: { permission: { select: { key: true } } } });
    return { keys: rows.map((r) => r.permission.key).sort() };
  }

  async setStaffPermissions(staffId: string, keys: string[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    await this.assertStaff(staffId, schoolId);
    const unique = [...new Set(keys)];
    const perms = unique.length ? await this.prisma.permission.findMany({ where: { key: { in: unique } }, select: { id: true, key: true } }) : [];
    if (perms.length !== unique.length) {
      const known = new Set(perms.map((p) => p.key));
      const bad = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission(s): ${bad.join(", ")}`);
    }
    await this.prisma.$transaction([
      this.prisma.staffPermission.deleteMany({ where: { staffId } }),
      this.prisma.staffPermission.createMany({ data: perms.map((p) => ({ staffId, permissionId: p.id })) }),
    ]);
    // best-effort audit
    try {
      await this.prisma.auditLog.create({ data: { schoolId, actorId: TenantContext.userId() ?? "", action: "Staff.setPermissions", resourceType: "Staff", resourceId: staffId, after: { keys: unique } } });
    } catch { /* never break the grant */ }
    return { keys: unique.sort() };
  }
}
```
(VERIFY: `TenantContext.userId()` exists — if the helper differs, use the available accessor or omit `actorId` to `""`. Check `core/tenant/tenant.context.ts`; if there's no `userId()`, set `actorId: ""`. `AuditLog` shape mirrors prior usage in `auth.service.ts` — `schoolId`, `actorId`, `action`, `resourceType`, `resourceId`, `after`.)

- [ ] **Step 6: Update `keysFor`** — replace `apps/api/src/core/auth/permissions/permissions.service.ts` method:
```ts
  /** All permission keys for a user: UserPermission rows + (for STAFF) their StaffPermission grants. */
  async keysFor(user: { id: string; identityType?: string; identityId?: string | null }): Promise<Set<string>> {
    const rows = await this.prisma.userPermission.findMany({ where: { userId: user.id }, include: { permission: true } });
    const keys = new Set(rows.map((r) => r.permission.key));
    if (user.identityType === "STAFF" && user.identityId) {
      const staffRows = await this.prisma.staffPermission.findMany({ where: { staffId: user.identityId }, include: { permission: true } });
      for (const r of staffRows) keys.add(r.permission.key);
    }
    return keys;
  }
```

- [ ] **Step 7: Update the guard** — in `apps/api/src/core/auth/permissions/permission.guard.ts`, widen the user cast + pass the user:
```ts
    const user = context.switchToHttp().getRequest().user as { id?: string; identityType?: string; identityId?: string | null } | undefined;
    if (!user?.id) throw new ForbiddenException("Not authenticated");

    const granted = await this.permissions.keysFor({ id: user.id, identityType: user.identityType, identityId: user.identityId });
```

- [ ] **Step 8: Controller** — `apps/api/src/modules/staff-access/staff-access.controller.ts`:
```ts
import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { PermissionsService } from "../../core/auth/permissions/permissions.service";
import { StaffAccessService } from "./staff-access.service";
import { SetStaffPermissionsDto } from "./dto";

@Controller("v1")
export class StaffAccessController {
  constructor(
    private service: StaffAccessService,
    private permissions: PermissionsService,
  ) {}

  @Get("permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  catalog() {
    return this.service.getCatalog();
  }

  @Get("staff/:id/permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  getStaffPermissions(@Param("id") id: string) {
    return this.service.getStaffPermissions(id);
  }

  @Put("staff/:id/permissions")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("staff.manage")
  setStaffPermissions(@Param("id") id: string, @Body() dto: SetStaffPermissionsDto) {
    return this.service.setStaffPermissions(id, dto.keys);
  }

  @Get("me/permissions")
  @UseGuards(JwtAuthGuard)
  async myPermissions(@CurrentUser() user: RequestUser) {
    const keys = await this.permissions.keysFor({ id: user.id, identityType: user.identityType, identityId: user.identityId });
    return { keys: [...keys].sort() };
  }
}
```

- [ ] **Step 9: Module** — `apps/api/src/modules/staff-access/staff-access.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { StaffAccessController } from "./staff-access.controller";
import { StaffAccessService } from "./staff-access.service";

@Module({ imports: [AuthModule], controllers: [StaffAccessController], providers: [StaffAccessService] })
export class StaffAccessModule {}
```
(`AuthModule` must export `PermissionsService` for the controller to inject it — VERIFY `PermissionsService` is in `AuthModule`'s `exports`; it is used by the guard which is global-ish, but confirm it's exported. If not, add `PermissionsService` to `AuthModule` exports.)

- [ ] **Step 10: Register in `app.module.ts`** — import + add `StaffAccessModule` to `imports` (after `MessagingModule`):
```ts
import { StaffAccessModule } from "./modules/staff-access/staff-access.module";
```

- [ ] **Step 11: Run the e2e to verify it passes**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json staff-access`
Expected: PASS (4 tests).

- [ ] **Step 12: Full API verification**

Run: `cd apps/api && pnpm exec jest --config ./test/jest-e2e.json` then `pnpm build`
Expected: full e2e green (28 suites / 184 tests), build + typecheck clean. (If the existing `permission.guard.spec.ts` unit test fails on the `keysFor` signature, its stub is `keysFor: async () => new Set(granted)` which ignores args → still compiles; if TS complains, update the stub's type to accept the object — but it's cast `as unknown as PermissionsService` so it should pass.)

- [ ] **Step 13: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/staff-access apps/api/src/core/auth/permissions apps/api/src/app.module.ts apps/api/test/staff-access.e2e-spec.ts
git commit -m "feat(rbac): staff permission assignment + keysFor STAFF union + /v1/me/permissions"
```

---

## Task 3: Web — permissions editor + nav-by-permission

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/settings/page.tsx`; create `apps/web/src/app/(app)/settings/permissions/page.tsx`

- [ ] **Step 1: api client** — in `apps/web/src/lib/api.ts` add types + methods:
```ts
export interface PermissionCatalog { catalog: { key: string; description: string }[]; presets: Record<string, string[]>; }
```
```ts
  getPermissionsCatalog: () => authedRequest<PermissionCatalog>("/v1/permissions"),
  getStaffPermissions: (id: string) => authedRequest<{ keys: string[] }>(`/v1/staff/${id}/permissions`),
  setStaffPermissions: (id: string, keys: string[]) =>
    authedRequest<{ keys: string[] }>(`/v1/staff/${id}/permissions`, { method: "PUT", body: JSON.stringify({ keys }) }),
  getMyPermissions: () => authedRequest<{ keys: string[] }>("/v1/me/permissions"),
```

- [ ] **Step 2: Nav-by-permission in `layout.tsx`** — add an optional `perm` to each staff `NAV_ITEMS` entry, fetch the caller's permissions, and filter. Concretely:
  - Change `NAV_ITEMS` entries to include `perm` where applicable (leave Dashboard/Inbox/Messages without `perm`):
```tsx
const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; perm?: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users, perm: "students.view" },
  { href: "/staff", label: "Staff", icon: UserSquare2, perm: "staff.view" },
  { href: "/classes", label: "Classes", icon: BookOpen, perm: "classes.view" },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, perm: "attendance.view" },
  { href: "/gradebook", label: "Gradebook", icon: ClipboardList, perm: "results.record" },
  { href: "/review", label: "Review", icon: BarChart3, perm: "results.review" },
  { href: "/release", label: "Release", icon: Lock, perm: "results.release" },
  { href: "/fees", label: "Fees", icon: Wallet, perm: "fees.view" },
  { href: "/announcements", label: "Announcements", icon: Megaphone, perm: "announcements.create" },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings, perm: "school.manage" },
];
```
  (Keep the icons already imported. The exact existing entries/icons must be preserved — only add the `perm` keys + the type annotation.)
  - Add permission state + fetch (near the existing `user` state):
```tsx
  const [perms, setPerms] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!session.token()) return;
    api.getMyPermissions().then((r) => setPerms(new Set(r.keys))).catch(() => setPerms(new Set()));
  }, []);
```
  - Where the staff nav list is computed, filter by perm (only for the staff list; PARENT keeps `PARENT_NAV`):
```tsx
  const staffNav = NAV_ITEMS.filter((i) => !i.perm || (perms?.has(i.perm) ?? false));
  const navItems = user?.identityType === "PARENT" ? PARENT_NAV : staffNav;
```
  (While `perms` is null, only no-`perm` items show — avoids a flash of forbidden links. A proprietor holds all keys → all items appear once loaded.)

- [ ] **Step 3: Settings link** — in `apps/web/src/app/(app)/settings/page.tsx`, add a card/link after the Fees card:
```tsx
        <Link href="/settings/permissions" className="block">
          <Card elevation="sm" interactive>
            <CardHeader>
              <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">Staff permissions</h2>
            </CardHeader>
            <CardBody>
              <p className="text-small text-ink-500">Grant staff their roles and tool access.</p>
            </CardBody>
          </Card>
        </Link>
```

- [ ] **Step 4: Create the editor** — `apps/web/src/app/(app)/settings/permissions/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, type PermissionCatalog, type Staff } from "@/lib/api";

export default function StaffPermissionsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listStaff(), api.getPermissionsCatalog()])
      .then(([s, c]) => { setStaff(s); setCatalog(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function pick(id: string) {
    setSelected(id); setMsg(null);
    if (!id) { setKeys(new Set()); return; }
    const r = await api.getStaffPermissions(id).catch(() => ({ keys: [] as string[] }));
    setKeys(new Set(r.keys));
  }

  function toggle(key: string) {
    setKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function applyPreset(role: string) {
    if (catalog) setKeys(new Set(catalog.presets[role] ?? []));
  }

  async function save() {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.setStaffPermissions(selected, [...keys]);
      setKeys(new Set(r.keys));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">Staff permissions</h1>

      <select value={selected} onChange={(e) => pick(e.target.value)} className="mb-4 w-full rounded-input border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100">
        <option value="">Select a staff member…</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.staffNo}</option>)}
      </select>

      {selected && catalog && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.keys(catalog.presets).map((role) => (
              <button key={role} type="button" onClick={() => applyPreset(role)} className="rounded-input border border-ink-200 dark:border-white/10 px-2.5 py-1 text-caption text-ink-700 dark:text-ink-300">
                {role.replace(/_/g, " ").toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4">
            {catalog.catalog.map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-small text-ink-700 dark:text-ink-300">
                <input type="checkbox" checked={keys.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5" />
                <span><span className="font-medium text-ink-1000 dark:text-ink-100">{p.key}</span> — {p.description}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={busy}>{busy ? <Spinner size="sm" /> : "Save"}</Button>
            {msg && <span className="text-small text-ink-500">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web typecheck && pnpm --filter @mymakaranta/web lint && pnpm --filter @mymakaranta/web build`
Expected: clean (pre-existing `no-page-custom-font` warning unrelated); `/settings/permissions` builds + the layout compiles. Confirm `Staff` type + `listStaff` exist; `Button`/`Spinner`/tokens real.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/settings"
git commit -m "feat(rbac): staff permissions editor + nav-by-permission"
```

---

## Task 4: QA + docs + finish

- [ ] **Step 1: HTTP QA** (real guard + routing). Start the API (`cd apps/api && pnpm dev`, PORT 4080). Onboard a proprietor; seed a Staff (loginable phone) via a one-off `apps/api/*.mjs` script (deleted after). As proprietor: `GET /v1/permissions` → catalog + presets; `PUT /v1/staff/<id>/permissions {keys: FORM_TEACHER bundle}` → ok; `GET /v1/staff/<id>/permissions` → the bundle. Staff OTP-login (STAFF, slice 2.5) → `GET /v1/me/permissions` → the bundle; a `results.record`-gated call (e.g. POST a score) succeeds while a `fees.manage` call 403s. Negatives: foreign staff id → 404; bad key in PUT → 400. Record findings in `.gstack/qa-reports/` (gitignored). Stop the dev server before any build.

- [ ] **Step 2: Update `docs/RESUME.md`** — add a Sprint 7 slice 1 entry (StaffPermission + keysFor STAFF union + assignment endpoints + presets + nav-by-permission + `/v1/me/permissions`, e2e count 184). Note the staff app is now usable per granted permissions; remaining RBAC follow-ups (per-permission scoping, custom roles). Update "Next steps". Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch`: verify full API e2e + unit + web vitest + UI vitest + builds, then merge `sprint-7-staff-rbac` → main per the user's choice.

---

## Notes for the implementer
- **One additive migration** (`StaffPermission` join table, no RLS — mirrors `UserPermission`, NOT in TENANT_MODELS). Stop dev servers before `prisma`/`build`; kill stray jest workers on EPERM.
- **`keysFor` signature change** from `(userId)` to `(user)` — only the guard calls it (update that one call site) + the new controller. The unit `permission.guard.spec.ts` stub ignores args (cast `as unknown`), so it stays green.
- **Tenant-IDOR:** `assertStaff(staffId, schoolId)` (scoped `Staff.findFirst`) gates every staff-permission op → 404 on a foreign staff. `StaffPermission` itself has no schoolId (like `UserPermission`); scoping lives at the endpoint.
- **Replace-as-unit** `PUT`: validate ALL keys against the catalog BEFORE the `$transaction` (no partial write on a bad key). Dedup keys.
- **`AuthModule` must export `PermissionsService`** (the controller injects it for `/v1/me/permissions`) — verify/add to exports.
- **`TenantContext.userId()`** — verify the accessor name in `core/tenant/tenant.context.ts`; if absent, set `actorId: ""` in the audit (audit is best-effort anyway).
- **Nav-by-permission:** proprietor holds all keys (UserPermission=all) → sees all items; a staff sees only granted ones; parent uses `PARENT_NAV` unchanged. Render no-`perm` items while perms load.
- **Tokens/ui** — `Button`/`Spinner`; `bg-surface`(+`-dark`), `rounded-card`/`rounded-input`, `text-ink-{100,200,500,700,1000}`, `text-caption` real; `bg-canvas`/`text-brand-600` not.
```
