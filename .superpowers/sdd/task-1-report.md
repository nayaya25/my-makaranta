# Task 1 Report — Identity & Profile Prisma Models + Migration

## What Was Done

### Step 1: Schema additions
**File:** `apps/api/prisma/schema.prisma`

Appended 9 new models after the `Receipt` model under a `// === Identity Core (P1) ===` section:
- `Person` — global identity with email/phone/passwordHash/tokenVersion
- `Membership` — links Person to School with status
- `Role` — system presets (schoolId=null) or school-custom roles
- `RoleAssignment` — many-to-many Membership ↔ Role
- `RolePermission` — many-to-many Role ↔ Permission
- `StaffProfile` — staffNo + hireDate linked to Membership
- `StudentProfile` — admissionNo + studentId linked to Membership
- `Guardian_v2` — renamed from spec's `Guardian` to avoid collision with existing `Guardian` model (legacy model linking Student ↔ Parent)
- `FormTeacherAssignment` — classId + staffProfileId + termId + kind

**School slug note:** The `School` model already had `slug String @unique` (non-nullable, present since the init migration). The plan NOTE said to add `slug String? @unique` — this was already satisfied, so no change was needed to `School`.

### Step 2: Migration generated
**Migration name:** `identity_core`
**Migration folder:** `apps/api/prisma/migrations/20260620081833_identity_core/`
**Migration file:** `migration.sql` (5474 bytes)

Creates tables: `Person`, `Membership`, `Role`, `RoleAssignment`, `RolePermission`, `StaffProfile`, `StudentProfile`, `Guardian_v2`, `FormTeacherAssignment`.

Applied against: `postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public`

Prisma Client regenerated successfully (v5.22.0).

### Step 3: Test file
**File:** `apps/api/src/core/identity/identity-model.spec.ts`

Matches the plan spec. Uses `as never` cast for school data (since `slug` is already required in the schema type, the cast is still needed for the test to compile without TS complaints about unknown fields).

### Step 4: Test run
```
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
  pnpm exec jest identity-model --forceExit

PASS src/core/identity/identity-model.spec.ts (5.073 s)
  identity core schema
    ✓ creates a Person with a Membership and a Role assignment (102 ms)

Tests: 1 passed, 1 total
```

### Step 5: Commit
```
commit b9178ac
feat(identity): add Person/Membership/Role + profile models (P1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## P1 Review Fixes (2026-06-20)

Two FK relations added per code review:

1. **FormTeacherAssignment → StaffProfile**: Added `staffProfile StaffProfile @relation(fields: [staffProfileId], references: [id])` on `FormTeacherAssignment` and back-reference `formTeacherAssignments FormTeacherAssignment[]` on `StaffProfile`.

2. **RolePermission → Permission**: Added `permission Permission @relation(fields: [permissionId], references: [id])` on `RolePermission` and back-reference `rolePermissions RolePermission[]` on `Permission`.

Migration regenerated as `20260620120308_identity_core`. Verified migration.sql contains both `ADD CONSTRAINT` lines. Jest test still passes (1/1).

---

## Concerns

1. **Guardian_v2 naming**: The plan specifies `model Guardian { ... }` but that name conflicts with the existing legacy `Guardian` model (linking `Student` ↔ `Parent`). Renamed to `Guardian_v2` in both schema and migration. The `Membership.guardianOf` relation points to `Guardian_v2[]`. Later tasks (Task 8 backfill) should be aware of this rename when referencing `prisma.guardian_v2`.

2. **School.slug already non-nullable**: The NOTE in the plan asked to add `slug String? @unique` to School. The field already exists as `slug String @unique` (non-nullable, from the init migration). No change was needed — this is actually stricter/better than what the plan asked for.

3. **RolePermission has no FK to Permission**: Following the spec verbatim — `RolePermission` stores `permissionId` as a plain `String` with no explicit FK to the `Permission` table. This is intentional per the spec (avoids coupling the new identity graph to the existing RBAC table). The `deriveAuthz` service will look up permissions by ID separately.
