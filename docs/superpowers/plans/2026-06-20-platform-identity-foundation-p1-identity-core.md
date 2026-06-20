# Platform & Identity Foundation — P1: Identity Core & Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the multi-role `Person + Membership + Role` identity core alongside the existing `User`/OTP system, add password auth + a richer JWT, and backfill all existing accounts — with **zero user-visible change** and existing OTP logins still working.

**Architecture:** Additive. New Prisma models and a new `IdentityModule`/`PasswordService` live beside the current `User`/`AuthService`. New `POST /auth/login` (password) + `POST /v1/auth/context` (membership switch) issue an enriched JWT (`personId · activeMembership · schoolId · roles · perms`). The legacy `User.identityType` path and OTP endpoints are untouched this phase; cutover happens in P4. An idempotent backfill script populates `Person/Membership/profiles` from `User/Staff/Parent/Student`.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL (Neon), `@nestjs/jwt`, `argon2` (new), Jest + ts-jest. Monorepo: `apps/api`.

## Global Constraints

- Multi-tenancy: scope every new read/write by `schoolId` explicitly; never rely on `$use` middleware alone (per `prisma-tenant-scope-explicitly`). Validate any request-supplied id through a tenant-scoped query before use (per `tenant-idor-rule`).
- Password policy (verbatim): min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 number, ≥1 special character. Hash with **argon2id**.
- JWT payload keys (verbatim): `{ sub: personId, mbr: activeMembershipId, sch: schoolId, roles: string[], perms: string[], tv: tokenVersion }`.
- Role preset keys (verbatim): `proprietor · director · principal · vice_principal · ict_admin · bursar · exam_officer · teacher`.
- Auth failures return a generic message ("Invalid credentials"); never reveal which factor failed.
- Do NOT modify or remove existing OTP endpoints, `AuthService.requestOtp/verifyOtp`, or `User.identityType` in this phase.
- Tests: co-located `*.spec.ts`, run with `pnpm --filter @mymakaranta/api exec jest <pattern>`.
- Use latest stable deps; run `pnpm audit` after adding `argon2` (per `dependency-policy`).

## Amendments (discovered during execution)

- **Guardian naming:** a legacy `Guardian` model (Student↔Parent) already exists, so the NEW model is named **`Guardian_v2`**. Wherever this plan writes `Guardian` / `guardianOf Guardian[]` / `guardians Guardian[]` / `prisma.guardian` for the **new** model, read **`Guardian_v2`** / `guardianOf Guardian_v2[]` / `guardians Guardian_v2[]` / `prisma.guardian_v2`. (Legacy `Guardian` stays untouched; rename to a clean `Guardian` happens at the P4 cutover.)
- **School.slug:** already exists as non-nullable `@unique` from the init migration — Task 1's NOTE about adding `slug String?` is moot; no change needed.
- **Added FKs (Task 1 review):** `FormTeacherAssignment.staffProfile → StaffProfile` and `RolePermission.permission → Permission` relations were added for referential integrity.

## File Structure

- `apps/api/prisma/schema.prisma` — add identity + profile models (modify).
- `apps/api/prisma/migrations/*_identity_core/` — generated migration (create).
- `apps/api/prisma/seed-roles.ts` — seed system role presets (create).
- `apps/api/prisma/migrate-identity.ts` — idempotent backfill script (create).
- `apps/api/src/core/auth/password.service.ts` (+ `.spec.ts`) — hashing + policy (create).
- `apps/api/src/core/identity/identity.service.ts` (+ `.spec.ts`) — login resolution + permission derivation (create).
- `apps/api/src/core/identity/identity.module.ts` — wires IdentityService (create).
- `apps/api/src/core/auth/auth.service.ts` — add `loginWithPassword`, `switchContext` (modify).
- `apps/api/src/core/auth/auth.controller.ts` — add `POST /auth/login`, `POST /v1/auth/context` (modify).
- `apps/api/src/core/auth/dto.ts` — add `PasswordLoginDto`, `SwitchContextDto` (modify).
- `apps/api/src/core/auth/jwt.strategy.ts` + `current-user.decorator.ts` — enrich `RequestUser` (modify).
- `apps/api/src/core/auth/permissions/permission.guard.ts` — read `perms` from JWT (modify).
- `apps/api/src/app.module.ts` — register `IdentityModule` (modify).

---

### Task 1: Identity & profile Prisma models + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_identity_core/migration.sql` (generated)
- Test: `apps/api/src/core/identity/identity-model.spec.ts`

**Interfaces:**
- Produces: Prisma models `Person, Membership, Role, RoleAssignment, RolePermission, StaffProfile, StudentProfile, Guardian, FormTeacherAssignment` with the exact fields below. Later tasks consume `prisma.person`, `prisma.membership`, `prisma.role`.

- [ ] **Step 1: Add models to `schema.prisma`** (append; do not alter existing `User`/`Staff`/`Parent`/`Student`)

```prisma
model Person {
  id           String   @id @default(cuid())
  email        String?  @unique
  phone        String?  @unique
  passwordHash String?
  firstName    String?
  lastName     String?
  gender       String?
  photoUrl     String?
  tokenVersion Int      @default(0)
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  memberships  Membership[]
}

model Membership {
  id             String   @id @default(cuid())
  personId       String
  schoolId       String
  status         String   @default("active") // active | invited | suspended
  createdAt      DateTime @default(now())
  person         Person   @relation(fields: [personId], references: [id])
  roles          RoleAssignment[]
  staffProfile   StaffProfile?
  studentProfile StudentProfile?
  guardianOf     Guardian[]
  @@unique([personId, schoolId])
  @@index([schoolId])
}

model Role {
  id          String           @id @default(cuid())
  schoolId    String?          // null = system preset
  key         String
  name        String
  isPreset    Boolean          @default(false)
  permissions RolePermission[]
  assignments RoleAssignment[]
  @@unique([schoolId, key])
}

model RoleAssignment {
  id           String     @id @default(cuid())
  membershipId String
  roleId       String
  membership   Membership @relation(fields: [membershipId], references: [id])
  role         Role       @relation(fields: [roleId], references: [id])
  @@unique([membershipId, roleId])
}

model RolePermission {
  id           String @id @default(cuid())
  roleId       String
  permissionId String
  role         Role   @relation(fields: [roleId], references: [id])
  @@unique([roleId, permissionId])
}

model StaffProfile {
  id           String     @id @default(cuid())
  membershipId String     @unique
  schoolId     String
  staffNo      String
  hireDate     DateTime?
  membership   Membership @relation(fields: [membershipId], references: [id])
  @@unique([schoolId, staffNo])
}

model StudentProfile {
  id           String      @id @default(cuid())
  membershipId String?     @unique
  schoolId     String
  admissionNo  String
  studentId    String
  dateOfBirth  DateTime?
  gender       String?
  membership   Membership? @relation(fields: [membershipId], references: [id])
  guardians    Guardian[]
  @@unique([schoolId, studentId])
  @@unique([schoolId, admissionNo])
}

model Guardian {
  id                 String         @id @default(cuid())
  parentMembershipId String
  studentProfileId   String
  relationship       String
  isPrimary          Boolean        @default(false)
  parentMembership   Membership     @relation(fields: [parentMembershipId], references: [id])
  studentProfile     StudentProfile @relation(fields: [studentProfileId], references: [id])
  @@unique([parentMembershipId, studentProfileId])
}

model FormTeacherAssignment {
  id             String @id @default(cuid())
  classId        String
  staffProfileId String
  termId         String
  kind           String // form | assistant
  @@unique([classId, termId, kind])
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @mymakaranta/api exec prisma migrate dev --name identity_core`
Expected: a new folder `prisma/migrations/<ts>_identity_core/` with `migration.sql` creating the 9 tables; `prisma generate` runs clean.

- [ ] **Step 3: Write the failing model smoke test**

```typescript
// apps/api/src/core/identity/identity-model.spec.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

describe("identity core schema", () => {
  afterAll(() => prisma.$disconnect());

  it("creates a Person with a Membership and a Role assignment", async () => {
    const school = await prisma.school.create({ data: { name: "T", slug: `t-${Date.now()}` } as never });
    const role = await prisma.role.create({ data: { key: "teacher", name: "Teacher", isPreset: true } });
    const person = await prisma.person.create({ data: { email: `p-${Date.now()}@t.io` } });
    const m = await prisma.membership.create({
      data: { personId: person.id, schoolId: school.id, roles: { create: { roleId: role.id } } },
      include: { roles: true },
    });
    expect(m.roles).toHaveLength(1);
  });
});
```

> NOTE: `school.slug` is added in P2; for this test add a temporary nullable `slug String? @unique` to `School` now (it is needed by P2 anyway) and include it in this migration.

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `pnpm --filter @mymakaranta/api exec jest identity-model`
Expected: FAIL before migration (`prisma.person` undefined) → PASS after Steps 1-2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/core/identity/identity-model.spec.ts
git commit -m "feat(identity): add Person/Membership/Role + profile models (P1)"
```

---

### Task 2: Seed system role presets

**Files:**
- Create: `apps/api/prisma/seed-roles.ts`
- Test: `apps/api/prisma/seed-roles.spec.ts`

**Interfaces:**
- Consumes: existing `Permission` table; existing preset map in `apps/api/src/modules/staff-access` (read `getPermissionsCatalog().presets`).
- Produces: `seedSystemRoles(prisma): Promise<void>` — upserts 8 `Role` rows (`schoolId=null, isPreset=true`) with `RolePermission` rows. Exported for reuse by the backfill (Task 8) and tests.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/prisma/seed-roles.spec.ts
import { PrismaClient } from "@prisma/client";
import { seedSystemRoles, PRESET_KEYS } from "./seed-roles";
const prisma = new PrismaClient();

describe("seedSystemRoles", () => {
  afterAll(() => prisma.$disconnect());
  it("creates all 8 presets idempotently", async () => {
    await seedSystemRoles(prisma);
    await seedSystemRoles(prisma); // idempotent
    const roles = await prisma.role.findMany({ where: { schoolId: null, isPreset: true } });
    expect(roles.map((r) => r.key).sort()).toEqual([...PRESET_KEYS].sort());
    const prop = roles.find((r) => r.key === "proprietor")!;
    const perms = await prisma.rolePermission.count({ where: { roleId: prop.id } });
    const allPerms = await prisma.permission.count();
    expect(perms).toBe(allPerms); // proprietor = all permissions
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mymakaranta/api exec jest seed-roles`
Expected: FAIL — `seed-roles` module not found.

- [ ] **Step 3: Implement `seed-roles.ts`**

```typescript
// apps/api/prisma/seed-roles.ts
import type { PrismaClient } from "@prisma/client";

export const PRESET_KEYS = [
  "proprietor", "director", "principal", "vice_principal",
  "ict_admin", "bursar", "exam_officer", "teacher",
] as const;

const NAMES: Record<string, string> = {
  proprietor: "Proprietor", director: "Director",
  principal: "Principal / Head Teacher", vice_principal: "Vice Principal",
  ict_admin: "ICT Admin", bursar: "Bursar",
  exam_officer: "Exam Officer", teacher: "Teacher",
};

// Permission keys each preset grants (besides proprietor=all). Keep aligned with the
// existing catalog in staff-access; unknown keys are skipped safely.
const GRANTS: Record<string, string[]> = {
  director: ["*"], // all except destructive school deletion — see filter below
  principal: ["students.view", "staff.view", "classes.view", "attendance.view",
    "results.record", "results.review", "results.release", "announcements.create"],
  vice_principal: ["students.view", "staff.view", "classes.view", "attendance.view", "results.review"],
  ict_admin: ["school.manage", "staff.view", "staff.manage", "students.view", "classes.view"],
  bursar: ["fees.view"],
  exam_officer: ["results.record", "results.review", "results.release", "students.view", "classes.view"],
  teacher: ["students.view", "classes.view", "attendance.view", "results.record"],
};

export async function seedSystemRoles(prisma: PrismaClient): Promise<void> {
  const allPerms = await prisma.permission.findMany();
  const byKey = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const key of PRESET_KEYS) {
    const role = await prisma.role.upsert({
      where: { schoolId_key: { schoolId: null as never, key } },
      update: { name: NAMES[key] },
      create: { schoolId: null, key, name: NAMES[key], isPreset: true },
    });

    const grantKeys =
      key === "proprietor" || GRANTS[key]?.[0] === "*"
        ? allPerms.map((p) => p.key)
        : GRANTS[key] ?? [];

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const ids = grantKeys.map((k) => byKey.get(k)).filter((v): v is string => !!v);
    if (ids.length) {
      await prisma.rolePermission.createMany({
        data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }
}
```

> If a permission key in `GRANTS` does not exist in the catalog, it is skipped (filter on `byKey`). Verify the catalog keys in `apps/api/src/modules/staff-access` and adjust `GRANTS` to match exactly before running.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mymakaranta/api exec jest seed-roles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed-roles.ts apps/api/prisma/seed-roles.spec.ts
git commit -m "feat(identity): seed system role presets (P1)"
```

---

### Task 3: Password service (argon2 + policy)

**Files:**
- Create: `apps/api/src/core/auth/password.service.ts`
- Test: `apps/api/src/core/auth/password.service.spec.ts`

**Interfaces:**
- Produces: `PasswordService` with `hash(plain: string): Promise<string>`, `verify(hash: string, plain: string): Promise<boolean>`, `validatePolicy(plain: string): string | null` (returns an error message or `null` when valid).

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @mymakaranta/api add argon2 && pnpm audit`
Expected: `argon2` in `apps/api/package.json` deps; audit reports no high/critical advisories.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/core/auth/password.service.spec.ts
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const svc = new PasswordService();

  it("hashes and verifies", async () => {
    const h = await svc.hash("Str0ng!pass");
    expect(h).not.toBe("Str0ng!pass");
    expect(await svc.verify(h, "Str0ng!pass")).toBe(true);
    expect(await svc.verify(h, "wrong")).toBe(false);
  });

  it("enforces policy", () => {
    expect(svc.validatePolicy("Str0ng!pass")).toBeNull();
    expect(svc.validatePolicy("weak")).toMatch(/8/);
    expect(svc.validatePolicy("alllowercase1!")).toMatch(/uppercase/i);
    expect(svc.validatePolicy("NOLOWER1!")).toMatch(/lowercase/i);
    expect(svc.validatePolicy("NoNumber!")).toMatch(/number/i);
    expect(svc.validatePolicy("NoSpecial1")).toMatch(/special/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @mymakaranta/api exec jest password.service`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// apps/api/src/core/auth/password.service.ts
import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }
  async verify(hash: string, plain: string): Promise<boolean> {
    try { return await argon2.verify(hash, plain); } catch { return false; }
  }
  validatePolicy(p: string): string | null {
    if (p.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(p)) return "Password must contain an uppercase letter.";
    if (!/[a-z]/.test(p)) return "Password must contain a lowercase letter.";
    if (!/[0-9]/.test(p)) return "Password must contain a number.";
    if (!/[^A-Za-z0-9]/.test(p)) return "Password must contain a special character.";
    return null;
  }
}
```

- [ ] **Step 5: Run to verify it passes, then commit**

Run: `pnpm --filter @mymakaranta/api exec jest password.service` → PASS

```bash
git add apps/api/src/core/auth/password.service.ts apps/api/src/core/auth/password.service.spec.ts apps/api/package.json
git commit -m "feat(auth): argon2 PasswordService + policy (P1)"
```

---

### Task 4: IdentityService — login resolution + permission derivation

**Files:**
- Create: `apps/api/src/core/identity/identity.service.ts`, `apps/api/src/core/identity/identity.module.ts`
- Test: `apps/api/src/core/identity/identity.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `IdentityModule`)

**Interfaces:**
- Consumes: `PrismaService`.
- Produces: `IdentityService` with
  - `resolvePerson(schoolId: string, identifier: string): Promise<{ person: Person; membership: Membership } | null>` — matches `identifier` against email/phone (global) or `StudentProfile.studentId` (within `schoolId`), then loads the membership for that `schoolId`.
  - `deriveAuthz(membershipId: string): Promise<{ roles: string[]; perms: string[] }>` — role keys + flattened permission keys for a membership.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/core/identity/identity.service.spec.ts
import { IdentityService } from "./identity.service";
import { PrismaClient } from "@prisma/client";
import { seedSystemRoles } from "../../../prisma/seed-roles";

const prisma = new PrismaClient();
const svc = new IdentityService(prisma as never);

describe("IdentityService", () => {
  afterAll(() => prisma.$disconnect());

  it("resolves by email and derives authz from roles", async () => {
    await seedSystemRoles(prisma);
    const school = await prisma.school.create({ data: { name: "S", slug: `s-${Date.now()}` } as never });
    const teacher = await prisma.role.findFirstOrThrow({ where: { schoolId: null, key: "teacher" } });
    const email = `t-${Date.now()}@s.io`;
    const person = await prisma.person.create({ data: { email } });
    const m = await prisma.membership.create({
      data: { personId: person.id, schoolId: school.id, roles: { create: { roleId: teacher.id } } },
    });

    const r = await svc.resolvePerson(school.id, email);
    expect(r?.membership.id).toBe(m.id);

    const authz = await svc.deriveAuthz(m.id);
    expect(authz.roles).toContain("teacher");
    expect(authz.perms).toContain("students.view");
  });

  it("resolves a student by Student ID within the school only", async () => {
    const school = await prisma.school.create({ data: { name: "S2", slug: `s2-${Date.now()}` } as never });
    const person = await prisma.person.create({ data: {} });
    const m = await prisma.membership.create({ data: { personId: person.id, schoolId: school.id } });
    const sid = `STU-${Date.now()}`;
    await prisma.studentProfile.create({
      data: { membershipId: m.id, schoolId: school.id, admissionNo: sid, studentId: sid },
    });
    const r = await svc.resolvePerson(school.id, sid);
    expect(r?.person.id).toBe(person.id);
    // Wrong school → no match
    const other = await prisma.school.create({ data: { name: "S3", slug: `s3-${Date.now()}` } as never });
    expect(await svc.resolvePerson(other.id, sid)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mymakaranta/api exec jest identity.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service + module**

```typescript
// apps/api/src/core/identity/identity.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IdentityService {
  constructor(private prisma: PrismaService) {}

  async resolvePerson(schoolId: string, identifier: string) {
    const id = identifier.trim();
    // 1) Student ID within this school
    const student = await this.prisma.studentProfile.findFirst({
      where: { schoolId, studentId: id, membershipId: { not: null } },
      include: { membership: { include: { person: true } } },
    });
    if (student?.membership?.person) {
      return { person: student.membership.person, membership: student.membership };
    }
    // 2) Global email/phone → person → membership in this school
    const person = await this.prisma.person.findFirst({
      where: { OR: [{ email: id }, { phone: id }] },
    });
    if (!person) return null;
    const membership = await this.prisma.membership.findUnique({
      where: { personId_schoolId: { personId: person.id, schoolId } },
    });
    if (!membership) return null;
    return { person, membership };
  }

  async deriveAuthz(membershipId: string): Promise<{ roles: string[]; perms: string[] }> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { membershipId },
      include: { role: { include: { permissions: true } } },
    });
    const roles = assignments.map((a) => a.role.key);
    const permIds = [...new Set(assignments.flatMap((a) => a.role.permissions.map((p) => p.permissionId)))];
    const perms = permIds.length
      ? (await this.prisma.permission.findMany({ where: { id: { in: permIds } } })).map((p) => p.key)
      : [];
    return { roles, perms };
  }
}
```

```typescript
// apps/api/src/core/identity/identity.module.ts
import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service";

@Module({ providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
```

- [ ] **Step 4: Register module** — add `IdentityModule` to `apps/api/src/app.module.ts` imports (PrismaModule is global, so no extra wiring).

- [ ] **Step 5: Run to verify it passes, then commit**

Run: `pnpm --filter @mymakaranta/api exec jest identity.service` → PASS

```bash
git add apps/api/src/core/identity apps/api/src/app.module.ts
git commit -m "feat(identity): IdentityService login resolution + authz derivation (P1)"
```

---

### Task 5: Password login endpoint + enriched JWT

**Files:**
- Modify: `apps/api/src/core/auth/dto.ts`, `auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `current-user.decorator.ts`
- Test: `apps/api/src/core/auth/password-login.spec.ts`

**Interfaces:**
- Consumes: `IdentityService.resolvePerson/deriveAuthz`, `PasswordService.verify`.
- Produces: `POST /auth/login` body `{ schoolId: string; identifier: string; password: string }` → `{ token: string; person: { id; firstName; lastName }; membershipId: string }`. JWT signed with the verbatim payload from Global Constraints. `RequestUser` gains `personId?, membershipId?, roles?, perms?`.

- [ ] **Step 1: Write the failing test** (service-level, mocks Prisma-backed services)

```typescript
// apps/api/src/core/auth/password-login.spec.ts
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

describe("AuthService.loginWithPassword", () => {
  const jwt = new JwtService({ secret: "test" });
  const pwd = new PasswordService();

  it("issues a JWT with roles+perms on valid password", async () => {
    const hash = await pwd.hash("Str0ng!pass");
    const identity = {
      resolvePerson: async () => ({
        person: { id: "p1", passwordHash: hash, tokenVersion: 0, firstName: "A", lastName: "B" },
        membership: { id: "m1", schoolId: "s1" },
      }),
      deriveAuthz: async () => ({ roles: ["teacher"], perms: ["students.view"] }),
    };
    const svc = new AuthService(/* prisma */ {} as never, jwt, /* email */ {} as never, pwd, identity as never);
    const res = await svc.loginWithPassword("s1", "a@b.io", "Str0ng!pass");
    const decoded = jwt.verify(res.token) as Record<string, unknown>;
    expect(decoded.sub).toBe("p1");
    expect(decoded.mbr).toBe("m1");
    expect(decoded.roles).toEqual(["teacher"]);
    expect(decoded.perms).toEqual(["students.view"]);
  });

  it("rejects a wrong password with a generic error", async () => {
    const identity = { resolvePerson: async () => ({ person: { id: "p1", passwordHash: await pwd.hash("right") }, membership: { id: "m1", schoolId: "s1" } }), deriveAuthz: async () => ({ roles: [], perms: [] }) };
    const svc = new AuthService({} as never, jwt, {} as never, pwd, identity as never);
    await expect(svc.loginWithPassword("s1", "a@b.io", "wrong")).rejects.toThrow("Invalid credentials");
  });
});
```

> Adjust the `AuthService` constructor arity to match the real one; add `PasswordService` and `IdentityService` as the new injected params (append to the end of the constructor to minimize churn).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mymakaranta/api exec jest password-login`
Expected: FAIL — `loginWithPassword` not a function.

- [ ] **Step 3: Add DTOs**

```typescript
// add to apps/api/src/core/auth/dto.ts
import { IsString, MinLength } from "class-validator";
export class PasswordLoginDto {
  @IsString() schoolId!: string;
  @IsString() identifier!: string;
  @IsString() @MinLength(1) password!: string;
}
export class SwitchContextDto {
  @IsString() membershipId!: string;
}
```

- [ ] **Step 4: Implement `loginWithPassword` in `auth.service.ts`** (inject `PasswordService`, `IdentityService`)

```typescript
// constructor: add `private passwords: PasswordService, private identity: IdentityService`
async loginWithPassword(schoolId: string, identifier: string, password: string) {
  const resolved = await this.identity.resolvePerson(schoolId, identifier);
  const ok = resolved?.person.passwordHash
    && (await this.passwords.verify(resolved.person.passwordHash, password));
  if (!resolved || !ok) throw new UnauthorizedException("Invalid credentials");
  const { person, membership } = resolved;
  const { roles, perms } = await this.identity.deriveAuthz(membership.id);
  const token = await this.jwt.signAsync({
    sub: person.id, mbr: membership.id, sch: membership.schoolId,
    roles, perms, tv: person.tokenVersion,
  });
  await this.prisma.person.update({ where: { id: person.id }, data: { lastLoginAt: new Date() } });
  return { token, person: { id: person.id, firstName: person.firstName, lastName: person.lastName }, membershipId: membership.id };
}
```

- [ ] **Step 5: Add controller route** in `auth.controller.ts`

```typescript
@Post("auth/login")
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@HttpCode(200)
login(@Body() dto: PasswordLoginDto) {
  return this.auth.loginWithPassword(dto.schoolId, dto.identifier, dto.password);
}
```

- [ ] **Step 6: Enrich `RequestUser` + `jwt.strategy.ts`** — add optional `personId, membershipId, roles, perms` to the `RequestUser` interface and map them in the strategy's `validate()` from `payload.sub/mbr/roles/perms` (keep existing fields for OTP-issued tokens).

- [ ] **Step 7: Run tests (new + existing auth) , then commit**

Run: `pnpm --filter @mymakaranta/api exec jest auth` → all PASS (existing OTP specs unaffected).

```bash
git add apps/api/src/core/auth
git commit -m "feat(auth): password login + enriched JWT (P1)"
```

---

### Task 6: Context-switch endpoint

**Files:**
- Modify: `auth.service.ts`, `auth.controller.ts`
- Test: `apps/api/src/core/auth/context-switch.spec.ts`

**Interfaces:**
- Consumes: `IdentityService.deriveAuthz`, JWT `personId`.
- Produces: `POST /v1/auth/context` body `{ membershipId }` (auth required) → `{ token }` re-issued for the new membership, **only if** the membership belongs to the caller's `personId` (else 403).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/core/auth/context-switch.spec.ts
import { ForbiddenException } from "@nestjs/common";
// Arrange an AuthService with a prisma stub whose membership.findFirst returns
// null for a foreign membership and a row for an owned one.
it("rejects switching to a membership not owned by the person", async () => {
  // svc.switchContext("personA", "membershipOwnedByB") → ForbiddenException
});
it("re-issues a token for an owned membership with fresh roles/perms", async () => {
  // decoded.mbr === target; decoded.sub === personA
});
```

> Fill the two test bodies using the same stub style as Task 5 (prisma `membership.findFirst({ where: { id, personId } })`).

- [ ] **Step 2: Run to verify it fails** → `jest context-switch` FAIL.

- [ ] **Step 3: Implement**

```typescript
// auth.service.ts
async switchContext(personId: string, membershipId: string) {
  const m = await this.prisma.membership.findFirst({ where: { id: membershipId, personId } });
  if (!m) throw new ForbiddenException("Membership not available for this account.");
  const person = await this.prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const { roles, perms } = await this.identity.deriveAuthz(m.id);
  const token = await this.jwt.signAsync({ sub: personId, mbr: m.id, sch: m.schoolId, roles, perms, tv: person.tokenVersion });
  return { token };
}
```

```typescript
// auth.controller.ts
@Post("v1/auth/context")
@UseGuards(JwtAuthGuard)
@HttpCode(200)
switch(@CurrentUser() user: RequestUser, @Body() dto: SwitchContextDto) {
  return this.auth.switchContext(user.personId ?? user.id, dto.membershipId);
}
```

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add apps/api/src/core/auth
git commit -m "feat(auth): membership context-switch endpoint (P1)"
```

---

### Task 7: PermissionGuard reads perms from the JWT

**Files:**
- Modify: `apps/api/src/core/auth/permissions/permission.guard.ts`
- Test: `apps/api/src/core/auth/permissions/permission.guard.spec.ts`

**Interfaces:**
- Consumes: `RequestUser.perms` (Task 5).
- Produces: guard allows when `RequestUser.perms` includes the required permission; **falls back** to the existing DB-backed check when `perms` is absent (OTP-issued legacy tokens), so nothing regresses.

- [ ] **Step 1: Write the failing test** — two cases: (a) JWT `perms` contains the required key → allow without DB; (b) `perms` undefined → existing DB path runs.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — at the top of `canActivate`, read `request.user.perms`; if it is an array, `return required.every((p) => perms.includes(p))`; otherwise execute the current DB-lookup logic unchanged.

- [ ] **Step 4: Run full guard + a couple of protected-route specs to confirm no regression, then commit.**

```bash
git add apps/api/src/core/auth/permissions
git commit -m "feat(auth): PermissionGuard honors JWT perms with DB fallback (P1)"
```

---

### Task 8: Idempotent backfill of existing accounts

**Files:**
- Create: `apps/api/prisma/migrate-identity.ts`
- Test: `apps/api/prisma/migrate-identity.spec.ts`

**Interfaces:**
- Consumes: existing `User/Staff/Parent/Student/Guardian` rows; `seedSystemRoles` (Task 2).
- Produces: `backfillIdentity(prisma): Promise<{ persons: number; memberships: number }>` — idempotent; safe to re-run.

- [ ] **Step 1: Write the failing test** — seed one PROPRIETOR `User` (+School), one `Staff`, one `Parent`+`Student`+`Guardian`; run `backfillIdentity` twice; assert: a `Person` exists per distinct human, a `Membership` per (person, school), the proprietor membership has role `proprietor`, the staff membership has a `StaffProfile` + `teacher` role, the parent membership has a `Guardian` row to the migrated `StudentProfile`, and counts are stable across the second run.

```typescript
// apps/api/prisma/migrate-identity.spec.ts (skeleton — fill arrange block)
import { PrismaClient } from "@prisma/client";
import { backfillIdentity } from "./migrate-identity";
import { seedSystemRoles } from "./seed-roles";
const prisma = new PrismaClient();
it("backfills proprietor/staff/parent/student idempotently", async () => {
  await seedSystemRoles(prisma);
  // ...arrange legacy rows...
  const a = await backfillIdentity(prisma);
  const b = await backfillIdentity(prisma);
  expect(b.persons).toBe(a.persons); // idempotent
  // ...assert memberships/profiles/roles/guardians...
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `backfillIdentity`** — for each source row, upsert a `Person` keyed by email/phone, upsert its `Membership` (`personId_schoolId`), attach the right preset role via `RoleAssignment`, and create the matching profile (`StaffProfile`/`StudentProfile`/`Guardian`). Use `upsert`/`skipDuplicates` everywhere so re-runs are no-ops. Map `Staff.staffPermissions` to the closest preset (default `teacher`; if it holds `school.manage` → also `ict_admin`). Preserve `tokenVersion` from `User`.

> Keep legacy tables intact (read-only). This script only *writes* the new tables.

- [ ] **Step 4: Run to verify it passes** → `jest migrate-identity` PASS.

- [ ] **Step 5: Add an npm script + commit**

Add to `apps/api/package.json` scripts: `"migrate:identity": "ts-node prisma/migrate-identity.ts"`.

```bash
git add apps/api/prisma/migrate-identity.ts apps/api/prisma/migrate-identity.spec.ts apps/api/package.json
git commit -m "feat(identity): idempotent backfill of legacy accounts (P1)"
```

---

### Task 9: Regression gate + typecheck

**Files:** none (verification task).

- [ ] **Step 1:** `pnpm --filter @mymakaranta/api exec tsc --noEmit` → exit 0.
- [ ] **Step 2:** `pnpm --filter @mymakaranta/api exec jest` → entire suite green (existing OTP/auth/tenant specs included — proves no regression).
- [ ] **Step 3:** Manually verify the existing OTP login flow against a dev DB after running `migrate:identity` (parent OTP still resolves; protected routes still authorize via the DB-fallback in Task 7).
- [ ] **Step 4: Commit** any fixups.

```bash
git commit -am "test(identity): P1 regression gate green" --allow-empty
```

---

## Self-Review

**Spec coverage (P1 portion of the spec):**
- Identity model (Person/Membership/Role/RoleAssignment/RolePermission/Staff·Student·Guardian/FormTeacherAssignment) → Task 1. ✓
- Role presets + permission mapping → Task 2. ✓
- Hybrid auth — password path + login resolution (email/phone/Student-ID) → Tasks 3-5. ✓ (OTP path untouched, per constraint.)
- Enriched JWT + context switch → Tasks 5-6. ✓
- Permission derivation honored by guard → Task 7. ✓
- Migration (idempotent, reversible-by-leaving-legacy-intact, OTP continuity) → Task 8. ✓
- Security: argon2id, generic errors, throttling, explicit schoolId scoping → Tasks 3,5,4. ✓
- *Deferred to later P1-adjacent or P2+ (not in this plan, by design):* subdomain routing, white-label, self-serve signup, shells, student-login enablement, legacy `User` removal. ✓ (These are P2-P4 plans.)

**Placeholder scan:** Tasks 6 & 8 leave two test *bodies* as guided skeletons (arrange blocks) rather than full code — flagged inline with the exact stub style to copy from Task 5; acceptable as they are mechanical repeats, but the implementer must fill them, not skip them.

**Type consistency:** JWT keys (`sub/mbr/sch/roles/perms/tv`) identical across Tasks 5-6; `resolvePerson`/`deriveAuthz` signatures consistent Tasks 4-6; `PRESET_KEYS`/role `key`s (`teacher`, `proprietor`, …) consistent Tasks 2,4,8.

**Note for implementer:** confirm the exact permission **catalog keys** in `apps/api/src/modules/staff-access` before running Task 2 (the `GRANTS` map must use real keys); and confirm the real `AuthService` constructor parameters before Task 5 (append new deps).
