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

Three fixes applied per code review:

1. **FormTeacherAssignment → StaffProfile**: Added `staffProfile StaffProfile @relation(fields: [staffProfileId], references: [id])` on `FormTeacherAssignment` and back-reference `formTeacherAssignments FormTeacherAssignment[]` on `StaffProfile`.

2. **RolePermission → Permission**: Added `permission Permission @relation(fields: [permissionId], references: [id])` on `RolePermission` and back-reference `rolePermissions RolePermission[]` on `Permission`.

3. **Test teardown**: `identity-model.spec.ts` now records created IDs (`schoolId`, `roleId`, `personId`, `membershipId`) and deletes them in FK-safe order in `afterAll` (best-effort, errors swallowed per row). Prevents row accumulation across repeated test runs.

Migration regenerated as `20260620120308_identity_core`. Verified migration.sql contains:
- `ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id")`
- `ALTER TABLE "FormTeacherAssignment" ADD CONSTRAINT "FormTeacherAssignment_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id")`

Jest: 1 passed, 1 total (teardown confirmed clean).

---

## Concerns

1. **Guardian_v2 naming**: The plan specifies `model Guardian { ... }` but that name conflicts with the existing legacy `Guardian` model (linking `Student` ↔ `Parent`). Renamed to `Guardian_v2` in both schema and migration. The `Membership.guardianOf` relation points to `Guardian_v2[]`. Later tasks (Task 8 backfill) should be aware of this rename when referencing `prisma.guardian_v2`.

2. **School.slug already non-nullable**: The NOTE in the plan asked to add `slug String? @unique` to School. The field already exists as `slug String @unique` (non-nullable, from the init migration). No change was needed — this is actually stricter/better than what the plan asked for.

3. **RolePermission has no FK to Permission**: Following the spec verbatim — `RolePermission` stores `permissionId` as a plain `String` with no explicit FK to the `Permission` table. This is intentional per the spec (avoids coupling the new identity graph to the existing RBAC table). The `deriveAuthz` service will look up permissions by ID separately.

---

## Task 1 Review Fix — Rename Guardian_v2 → Guardianship (2026-06-20)

**Trigger:** Review finding requested `Guardian_v2` be renamed `Guardianship` for clarity.

### Schema edits (apps/api/prisma/schema.prisma)

1. `model Guardian_v2 { … }` → `model Guardianship { … }` (model definition)
2. `Membership.guardianOf Guardian_v2[]` → `Membership.guardianOf Guardianship[]`
3. `StudentProfile.guardians Guardian_v2[]` → `StudentProfile.guardians Guardianship[]`

Notes: FormTeacherAssignment FK and RolePermission→Permission FK were already present from the prior P1 review pass — no additional changes needed for those.

### Migration regeneration

- Deleted: `apps/api/prisma/migrations/20260620120308_identity_core/`
- `prisma migrate reset --force` re-applied 29 baseline migrations on `my_makaranta_test`
- `prisma migrate dev --name identity_core` generated new migration
- **New migration:** `apps/api/prisma/migrations/20260620212615_identity_core/migration.sql`
- Verified SQL: `CREATE TABLE "Guardianship"` with correct PKs, unique index, and both FKs

### Test result

```
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
  pnpm exec jest identity-model --testTimeout=30000

PASS src/core/identity/identity-model.spec.ts
  identity core schema
    ✓ creates a Person with a Membership and a Role assignment (90 ms)

Tests: 1 passed, 1 total
Time: 3.717 s
```
