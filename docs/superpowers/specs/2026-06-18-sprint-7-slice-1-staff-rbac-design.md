# Sprint 7 · Slice 1 — Staff Permission Assignment (RBAC) (Design)

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 7 (RBAC / staff access) — the slice that lights up the already-built staff app. After slice 2.5 (staff login), staff have STAFF identities but **zero permissions**, so a teacher can log in yet 403s on every tool. This lets a proprietor/principal grant staff their permissions (PRD §5.5: permissions are the primitive; roles are presets).
- **Builds on:** the permission catalog (~25 keys, seeded), `UserPermission` + `PermissionGuard` + `PermissionsService.keysFor`, staff login / STAFF identity (slice 2.5), `Staff` (tenant-scoped), the `(app)` web shell + role-aware nav, `staff.manage` permission (proprietor-granted).

## Goal

A proprietor/principal assigns a staff member their permissions (one-click role presets + a fine-grained
checklist); the staff member logs in and sees + uses exactly the tools they're granted. Permissions attach to
the staff (independent of when they create a login).

## Scope (locked decisions, slice 1)
1. **`StaffPermission` model** — permissions attach to the `Staff` (not the login `User`), so assignment works
   before a staff has ever logged in and there's no staff-also-a-parent login collision.
2. **Guard resolves a STAFF caller's keys** from `StaffPermission` (unioned with `UserPermission`).
3. **Role presets** (Principal / Form-teacher / Subject-teacher / Bursar / Exam-officer) as editable constant
   bundles (no DB Role table — the assigned permission set is the truth).
4. **Nav-by-permission** — the web hides nav items the caller lacks, via a new `GET /v1/me/permissions`.

### Non-goals
- Per-permission scoping (class-scoped `attendance.mark` etc. — `scope` stays `{}`; a later slice); a custom
  Role table / role CRUD; bulk multi-staff assignment; staff self-service; changing parent/proprietor grants;
  permission grants to PROPRIETOR (they keep all-at-onboarding); editing the catalog.

## Architecture

New `apps/api/src/modules/staff-access/` (`StaffAccessModule`, `StaffAccessController`, `StaffAccessService`).
A `StaffPermission` table (additive migration; **no RLS**, mirroring `UserPermission` — tenant scoping is
enforced at the endpoint via a scoped `Staff` lookup). `PermissionsService.keysFor` is widened to take the
request user and union staff grants. A `permission-presets.ts` constant. Web: a Settings permissions editor +
nav filtering. No SMS/email, no new npm deps.

### Model (add to `schema.prisma`; NOT in TENANT_MODELS — like `UserPermission`)
```prisma
model StaffPermission {
  staffId      String
  permissionId String
  staff        Staff      @relation(fields: [staffId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([staffId, permissionId])
}
```
Add back-relations: `staffPermissions StaffPermission[]` to `Staff`, and `staffGrants StaffPermission[]` to
`Permission` (name distinct from `Permission.users`).

### Guard resolution — `PermissionsService.keysFor(user)`
Change the signature from `keysFor(userId: string)` to `keysFor(user: { id: string; identityType?: string; identityId?: string | null })`:
```ts
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
`PermissionGuard` reads `req.user` (already has `id`, `identityType`, `identityId`) and calls
`keysFor(user)`. (Proprietor → UserPermission=all; parent → UserPermission; staff → StaffPermission union.)

### Role presets — `apps/api/src/modules/staff-access/permission-presets.ts`
```ts
export const ROLE_PRESETS: Record<string, string[]> = {
  PRINCIPAL: ["students.view","students.create","students.update","staff.view","classes.view","classes.manage","attendance.mark","attendance.view","attendance.audit","results.record","results.review","results.release","results.correct","assessment.configure","fees.view","announcements.create","announcements.view","reports.view"],
  FORM_TEACHER: ["students.view","classes.view","attendance.mark","attendance.view","results.record","results.review","announcements.view","reports.view"],
  SUBJECT_TEACHER: ["students.view","classes.view","attendance.mark","attendance.view","results.record","announcements.view"],
  BURSAR: ["students.view","fees.view","fees.manage","reports.view","announcements.view"],
  EXAM_OFFICER: ["students.view","classes.view","results.review","results.release","assessment.configure","announcements.view"],
};
```
Presets are editable defaults (applying one sets the staff's set to that bundle; the admin then tweaks).

### Endpoints (`JwtAuthGuard` + `PermissionGuard` unless noted)
- **`GET /v1/permissions`** (`staff.manage`) → `{ catalog: [{ key, description }], presets: ROLE_PRESETS }`
  (the catalog is the `Permission` table ordered by key).
- **`GET /v1/staff/:id/permissions`** (`staff.manage`) → validate the `Staff` is in the caller's school
  (`findFirst { id, schoolId }` → 404); return `{ keys: string[] }` (the staff's `StaffPermission` keys).
- **`PUT /v1/staff/:id/permissions`** (`staff.manage`) `{ keys: string[] }` → validate staff ∈ school; every
  key ∈ catalog (else **400**); in a `$transaction` delete the staff's `StaffPermission` rows + create the new
  set (resolve key→permissionId); best-effort audit `Staff.setPermissions`. Returns `{ keys }`. **Replace-as-unit.**
- **`GET /v1/me/permissions`** (`JwtAuthGuard` only) → `{ keys: string[] }` = `keysFor(req.user)` as an array
  (for the web to filter nav + conditionally render).

### Web
- **Settings → "Staff permissions"**: a staff picker (reuse the staff list) → for the selected staff,
  `getStaffPermissions(id)` → preset buttons (apply a `ROLE_PRESETS` bundle into the local checkbox state) +
  a permission checklist grouped by area (the `catalog` from `getPermissionsCatalog`), Save → `setStaffPermissions(id, keys)`.
- **Nav-by-permission** — `(app)/layout.tsx` fetches `getMyPermissions()` once; each staff `NAV_ITEMS` entry
  gets an optional `perm`; hide an item when the caller lacks its `perm`. Mapping: Students→`students.view`,
  Staff→`staff.view`, Classes→`classes.view`, Attendance→`attendance.view`, Gradebook→`results.record`,
  Review→`results.review`, Release→`results.release`, Fees→`fees.view`, Announcements→`announcements.create`,
  Settings→`school.manage`; Dashboard/Inbox/Messages have **no** `perm` (always shown). A proprietor holds all
  keys → sees everything. Parent (`PARENT_NAV`) unchanged. While permissions load, render only the no-`perm`
  items (avoid a flash of forbidden links).
- api client: `getPermissionsCatalog`, `getStaffPermissions(id)`, `setStaffPermissions(id, keys)`,
  `getMyPermissions` (+ types).

## Validation & errors
- Foreign `staff.:id` (not in caller's school) → **404** (tenant-IDOR).
- A `PUT` key not in the catalog → **400** (no partial write — validate before the transaction).
- Non-`staff.manage` caller on the assignment endpoints → **403**.
- A staff with no grants → `keys: []`; their app shows only Dashboard/Inbox/Messages.
- `keysFor` for a STAFF whose `identityId` resolves to a deleted Staff → just no staff keys (union with
  UserPermission still works); no crash.

## Testing
- **API e2e** (`staff-access.e2e-spec.ts`, service-level + guard, two-school A/B): seed a Staff T in school A.
  `setStaffPermissions(T, ["results.record","attendance.mark"])` → `getStaffPermissions(T)` returns them →
  `keysFor({ id: <T's userId>, identityType: "STAFF", identityId: T.id })` includes both (and a
  `results.record`-gated call passes while a `fees.manage` one 403s — assert via the guard or `keysFor`).
  **Replace-as-unit:** re-`PUT` `["attendance.view"]` → old keys gone, only the new one. **Foreign staff id**
  (school B's staff, caller in A) → 404. **Bad key** `["not.a.key"]` → 400 (and nothing written). A proprietor
  (UserPermission=all) `keysFor` still returns all. `GET /v1/me/permissions` returns the caller's union.
- **Unit:** extend `permission.guard.spec.ts` for the STAFF-union resolution if it stubs `keysFor`.
- **Web:** light.
- **Browser/HTTP QA:** as a proprietor → assign a teacher the FORM_TEACHER preset → the teacher OTP-logs-in →
  `GET /v1/me/permissions` shows the bundle → `/dashboard` nav shows only their items (Gradebook/Attendance/…)
  → a `results.record` action works, a `fees.manage` action 403s. A staff with no grants sees only
  Dashboard/Inbox/Messages.

## Dependencies
- Permission catalog + `UserPermission`/`PermissionGuard`/`PermissionsService` (Sprint 1), staff login / STAFF
  identity (slice 2.5), `Staff`, `staff.manage` (seeded + proprietor-granted), the `(app)` shell + nav. One
  additive migration (`StaffPermission`), no RLS migration. `StaffAccessModule` imports `AuthModule`; in
  `app.module.ts`. No new npm deps.

## Out-of-scope future
- Per-permission scoping (`scope` JSON — class/student-scoped grants); custom Role table + role CRUD; bulk
  assignment; staff self-service; grant-history view; editing the permission catalog.
