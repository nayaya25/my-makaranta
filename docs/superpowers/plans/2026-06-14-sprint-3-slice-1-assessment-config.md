# Assessment Configuration & Subject Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a school the configuration spine for Sprint 3 — assessment types (sum to 100), grade boundaries (WAEC/NECO templates + edit), and per-year subject→teacher assignments — via a new `assessment` API module and a Settings → Assessment web area.

**Architecture:** New tenant-scoped NestJS `assessment` module (3 Prisma models, registered in `TENANT_MODELS` + RLS). Assessment types and grade boundaries are replace-as-a-unit with atomic invariant validation; subject assignments are per-row CRUD with tenant-id validation. Web config under `/settings/assessment` built from existing design-system primitives.

**Tech Stack:** NestJS 11 / Prisma 5 / PostgreSQL (RLS), Next.js 15 / React 19; tests with Jest e2e (API) + vitest (web).

**Spec:** `docs/superpowers/specs/2026-06-14-sprint-3-slice-1-assessment-config-design.md`

**Branch:** `sprint-3-assessment-config` (already created).

---

## File Structure

**API — create:**
- `apps/api/src/modules/assessment/assessment.module.ts` — module wiring.
- `apps/api/src/modules/assessment/grade.util.ts` — pure `resolveGrade` + `GradeBand` type.
- `apps/api/src/modules/assessment/templates.ts` — WAEC/NECO grade-band seeds.
- `apps/api/src/modules/assessment/dto/assessment.dto.ts` — request DTOs.
- `apps/api/src/modules/assessment/assessment-types.service.ts` + `.controller.ts`
- `apps/api/src/modules/assessment/grade-boundaries.service.ts` + `.controller.ts`
- `apps/api/src/modules/assessment/subject-assignments.service.ts` + `.controller.ts`
- `apps/api/test/assessment.e2e-spec.ts` — e2e for all three resources + isolation.
- `apps/api/src/modules/assessment/grade.util.spec.ts` — unit test for `resolveGrade`.

**API — modify:**
- `apps/api/prisma/schema.prisma` — 3 models + back-relations.
- `apps/api/src/core/prisma/prisma.service.ts` — add 3 names to `TENANT_MODELS`.
- `apps/api/prisma/seed.ts` — add `assessment.configure` permission.
- `apps/api/src/app.module.ts` — register `AssessmentModule`.
- New migrations under `apps/api/prisma/migrations/`.

**Web — create:**
- `apps/web/src/lib/grade.ts` — pure `resolveGrade` for the live preview + test `grade.test.ts`.
- `apps/web/src/app/(app)/settings/assessment/page.tsx` — config page (3 panels).

**Web — modify:**
- `apps/web/src/lib/api.ts` — assessment types/methods (+ any missing list endpoints).
- `apps/web/src/app/(app)/settings/page.tsx` — link to the assessment config.

---

## Task 1: Prisma models + tenancy registration + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/core/prisma/prisma.service.ts`

- [ ] **Step 1: Add the three models to `schema.prisma`** (append after the `AttendanceRecord` model):
```prisma
model AssessmentType {
  id       String @id @default(cuid())
  schoolId String
  school   School @relation(fields: [schoolId], references: [id])
  name     String
  maxScore Int
  order    Int    @default(0)

  @@unique([schoolId, name])
}

model GradeBoundary {
  id       String @id @default(cuid())
  schoolId String
  school   School @relation(fields: [schoolId], references: [id])
  grade    String
  minScore Int
  remark   String
  order    Int    @default(0)

  @@unique([schoolId, grade])
}

model SubjectAssignment {
  id             String       @id @default(cuid())
  schoolId       String
  school         School       @relation(fields: [schoolId], references: [id])
  subjectId      String
  subject        Subject      @relation(fields: [subjectId], references: [id])
  classId        String
  class          Class        @relation(fields: [classId], references: [id])
  staffId        String
  staff          Staff        @relation(fields: [staffId], references: [id])
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])

  @@unique([subjectId, classId, academicYearId])
}
```

- [ ] **Step 2: Add back-relations** to existing models in `schema.prisma`:
  - In `model School { ... }` add: `assessmentTypes AssessmentType[]`, `gradeBoundaries GradeBoundary[]`, `subjectAssignments SubjectAssignment[]`
  - In `model Subject { ... }` add: `subjectAssignments SubjectAssignment[]`
  - In `model Class { ... }` add: `subjectAssignments SubjectAssignment[]`
  - In `model Staff { ... }` add: `subjectAssignments SubjectAssignment[]`
  - In `model AcademicYear { ... }` add: `subjectAssignments SubjectAssignment[]`

- [ ] **Step 3: Register the models for tenant scoping** in `apps/api/src/core/prisma/prisma.service.ts` — add to the `TENANT_MODELS` set:
```ts
  "AssessmentType",
  "GradeBoundary",
  "SubjectAssignment",
```

- [ ] **Step 4: Generate + apply the migration**

Run (from `apps/api`):
```bash
pnpm exec prisma migrate dev --name assessment_models
```
Expected: a new migration under `prisma/migrations/*_assessment_models/`, client regenerated, "Database schema is up to date". (Postgres must be running.)

- [ ] **Step 5: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/src/core/prisma/prisma.service.ts apps/api/prisma/migrations
git commit -m "feat(assessment): models (types/boundaries/subject-assignment) + tenant scoping"
```

---

## Task 2: RLS migration for the three tables

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_rls_assessment/migration.sql`

- [ ] **Step 1: Create an empty migration**

Run (from `apps/api`):
```bash
pnpm exec prisma migrate dev --create-only --name rls_assessment
```
Expected: creates `prisma/migrations/<timestamp>_rls_assessment/migration.sql` (empty) without applying.

- [ ] **Step 2: Fill the migration SQL** (mirror `*_rls_attendance/migration.sql`) — write into the new file:
```sql
-- Defense-in-depth tenant isolation for the assessment-config tables.
ALTER TABLE "AssessmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AssessmentType";
CREATE POLICY tenant_isolation ON "AssessmentType"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "AssessmentType" TO mymakaranta_app;

ALTER TABLE "GradeBoundary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradeBoundary" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "GradeBoundary";
CREATE POLICY tenant_isolation ON "GradeBoundary"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "GradeBoundary" TO mymakaranta_app;

ALTER TABLE "SubjectAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubjectAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SubjectAssignment";
CREATE POLICY tenant_isolation ON "SubjectAssignment"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "SubjectAssignment" TO mymakaranta_app;
```

- [ ] **Step 3: Apply the migration**

Run (from `apps/api`):
```bash
pnpm exec prisma migrate dev
```
Expected: applies `rls_assessment`, "Database schema is up to date".

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/migrations
git commit -m "feat(assessment): RLS (FORCE) tenant isolation for assessment tables"
```

---

## Task 3: Seed the `assessment.configure` permission

**Files:**
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add the permission** to the `PERMISSIONS` array in `apps/api/prisma/seed.ts` (after the `results.*` entries):
```ts
  ["assessment.configure", "Configure assessment types, grade boundaries, and subject assignments"],
```

- [ ] **Step 2: Run the seed**

Run (from `apps/api`):
```bash
pnpm exec prisma db seed
```
Expected: "Seeded permissions. Total in catalog: <N>" (N increased by 1). `createSchool` grants all catalog permissions to a new proprietor, so new schools get this automatically.

- [ ] **Step 3: Commit**
```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(assessment): seed assessment.configure permission"
```

---

## Task 4: Grade resolution helper + templates + module scaffold

**Files:**
- Create: `apps/api/src/modules/assessment/grade.util.ts`
- Create: `apps/api/src/modules/assessment/grade.util.spec.ts`
- Create: `apps/api/src/modules/assessment/templates.ts`
- Create: `apps/api/src/modules/assessment/assessment.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing unit test** — create `apps/api/src/modules/assessment/grade.util.spec.ts`:
```ts
import { resolveGrade, type GradeBand } from "./grade.util";

const WAEC: GradeBand[] = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
  { grade: "B3", minScore: 65, remark: "Good" },
];

describe("resolveGrade", () => {
  it("maps a score to the band with the greatest minScore <= score", () => {
    expect(resolveGrade(85, WAEC)).toEqual({ grade: "A1", remark: "Excellent" });
    expect(resolveGrade(66, WAEC)).toEqual({ grade: "B3", remark: "Good" });
    expect(resolveGrade(50, WAEC)).toEqual({ grade: "C6", remark: "Credit" });
    expect(resolveGrade(0, WAEC)).toEqual({ grade: "F9", remark: "Fail" });
  });

  it("treats minScore as an inclusive lower bound (boundary edge)", () => {
    expect(resolveGrade(75, WAEC)).toEqual({ grade: "A1", remark: "Excellent" });
    expect(resolveGrade(74, WAEC)).toEqual({ grade: "B3", remark: "Good" });
  });

  it("returns null when no band matches (no zero band)", () => {
    expect(resolveGrade(10, [{ grade: "A1", minScore: 75, remark: "Excellent" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run (from `apps/api`): `pnpm exec jest grade.util`
Expected: FAIL — cannot find module `./grade.util`.

- [ ] **Step 3: Implement `grade.util.ts`**:
```ts
export interface GradeBand {
  grade: string;
  minScore: number;
  remark: string;
}

/**
 * Resolve a 0–100 total to its grade band: the band with the greatest
 * minScore that is <= total. minScore is an inclusive lower bound; upper
 * bounds are implied by the next band. Returns null if no band matches.
 */
export function resolveGrade(
  total: number,
  boundaries: GradeBand[],
): { grade: string; remark: string } | null {
  const sorted = [...boundaries].sort((a, b) => b.minScore - a.minScore);
  const band = sorted.find((b) => total >= b.minScore);
  return band ? { grade: band.grade, remark: band.remark } : null;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm exec jest grade.util`
Expected: PASS (3 tests).

- [ ] **Step 5: Create templates** — `apps/api/src/modules/assessment/templates.ts`:
```ts
export interface GradeBoundaryTemplateRow {
  grade: string;
  minScore: number;
  remark: string;
  order: number;
}

// Standard Nigerian secondary grade scales. Same A1–F9 boundaries; remark wording
// differs by examining board convention. "Custom" = edit freely (no template).
export const GRADE_TEMPLATES: Record<"WAEC" | "NECO", GradeBoundaryTemplateRow[]> = {
  WAEC: [
    { grade: "A1", minScore: 75, remark: "Excellent", order: 0 },
    { grade: "B2", minScore: 70, remark: "Very Good", order: 1 },
    { grade: "B3", minScore: 65, remark: "Good", order: 2 },
    { grade: "C4", minScore: 60, remark: "Credit", order: 3 },
    { grade: "C5", minScore: 55, remark: "Credit", order: 4 },
    { grade: "C6", minScore: 50, remark: "Credit", order: 5 },
    { grade: "D7", minScore: 45, remark: "Pass", order: 6 },
    { grade: "E8", minScore: 40, remark: "Pass", order: 7 },
    { grade: "F9", minScore: 0, remark: "Fail", order: 8 },
  ],
  NECO: [
    { grade: "A1", minScore: 75, remark: "Distinction", order: 0 },
    { grade: "B2", minScore: 70, remark: "Upper Credit", order: 1 },
    { grade: "B3", minScore: 65, remark: "Upper Credit", order: 2 },
    { grade: "C4", minScore: 60, remark: "Credit", order: 3 },
    { grade: "C5", minScore: 55, remark: "Credit", order: 4 },
    { grade: "C6", minScore: 50, remark: "Credit", order: 5 },
    { grade: "D7", minScore: 45, remark: "Pass", order: 6 },
    { grade: "E8", minScore: 40, remark: "Pass", order: 7 },
    { grade: "F9", minScore: 0, remark: "Fail", order: 8 },
  ],
};
```

- [ ] **Step 6: Create the module** — `apps/api/src/modules/assessment/assessment.module.ts` (services/controllers added in later tasks; start with the scaffold and fill imports as you go):
```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AssessmentTypesService } from "./assessment-types.service";
import { AssessmentTypesController } from "./assessment-types.controller";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { GradeBoundariesController } from "./grade-boundaries.controller";
import { SubjectAssignmentsService } from "./subject-assignments.service";
import { SubjectAssignmentsController } from "./subject-assignments.controller";

@Module({
  imports: [AuthModule],
  controllers: [
    AssessmentTypesController,
    GradeBoundariesController,
    SubjectAssignmentsController,
  ],
  providers: [
    AssessmentTypesService,
    GradeBoundariesService,
    SubjectAssignmentsService,
  ],
})
export class AssessmentModule {}
```
NOTE: this module won't compile until Tasks 5–7 create those services/controllers. That's expected — register it in app.module now but verify compilation at the end of Task 7. (If you prefer green-at-each-step, add the three controllers/services as empty stubs now and flesh them out in 5–7. Either way, do not run the API build until Task 7.)

- [ ] **Step 7: Register in `app.module.ts`** — add the import and list entry:
```ts
import { AssessmentModule } from "./modules/assessment/assessment.module";
```
and add `AssessmentModule,` to the `imports` array (after `AttendanceModule,`).

- [ ] **Step 8: Commit**
```bash
git add apps/api/src/modules/assessment/grade.util.ts apps/api/src/modules/assessment/grade.util.spec.ts apps/api/src/modules/assessment/templates.ts apps/api/src/modules/assessment/assessment.module.ts apps/api/src/app.module.ts
git commit -m "feat(assessment): grade resolver + templates + module scaffold"
```

---

## Task 5: Assessment types (GET + PUT, sum-to-100)

**Files:**
- Create: `apps/api/src/modules/assessment/dto/assessment.dto.ts` (shared DTO file; this task adds the types DTOs)
- Create: `apps/api/src/modules/assessment/assessment-types.service.ts`
- Create: `apps/api/src/modules/assessment/assessment-types.controller.ts`
- Test: `apps/api/test/assessment.e2e-spec.ts` (created here; extended in Tasks 6–8)

- [ ] **Step 1: Create the DTO file** `apps/api/src/modules/assessment/dto/assessment.dto.ts`:
```ts
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class AssessmentTypeItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  maxScore!: number;

  @IsInt()
  @Min(0)
  order!: number;
}

export class ReplaceAssessmentTypesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentTypeItemDto)
  types!: AssessmentTypeItemDto[];
}

export class GradeBoundaryItemDto {
  @IsString()
  @IsNotEmpty()
  grade!: string;

  @IsInt()
  @Min(0)
  minScore!: number;

  @IsString()
  @IsNotEmpty()
  remark!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

export class ReplaceGradeBoundariesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeBoundaryItemDto)
  boundaries!: GradeBoundaryItemDto[];
}

export class ApplyTemplateDto {
  @IsIn(["WAEC", "NECO"])
  template!: "WAEC" | "NECO";
}

export class CreateSubjectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;
}

export class UpdateSubjectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  staffId!: string;
}
```

- [ ] **Step 2: Write the failing e2e test** — create `apps/api/test/assessment.e2e-spec.ts`. This repo's module e2e tests call **services directly** inside `TenantContext.run(...)` against a real Postgres (see `attendance.e2e-spec.ts`) — NOT via HTTP/supertest/tokens. Controllers (thin guard+delegate) aren't re-tested per-module; DTO validation + `PermissionGuard` are framework-wired identically to existing modules. Full bootstrap (seeds two schools + slice-1 fixtures for school A) and the types tests:
```ts
import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { AssessmentModule } from "../src/modules/assessment/assessment.module";
import { AssessmentTypesService } from "../src/modules/assessment/assessment-types.service";
import { GradeBoundariesService } from "../src/modules/assessment/grade-boundaries.service";
import { SubjectAssignmentsService } from "../src/modules/assessment/subject-assignments.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Assessment config (e2e)", () => {
  let prisma: PrismaService;
  let types: AssessmentTypesService;
  let boundaries: GradeBoundariesService;
  let assignments: SubjectAssignmentsService;

  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  let subjectId: string;
  let classId: string;
  let staffId: string;
  let academicYearId: string;
  const userId = "test-user";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        AssessmentModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    types = moduleRef.get(AssessmentTypesService);
    boundaries = moduleRef.get(GradeBoundariesService);
    assignments = moduleRef.get(SubjectAssignmentsService);

    const a = await prisma.school.create({ data: { name: `Asmt A ${suffix}`, slug: `asmt-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Asmt B ${suffix}`, slug: `asmt-b-${suffix}` } });
    schoolBId = b.id;

    const year = await prisma.academicYear.create({
      data: { schoolId, name: `2024/2025-asmt-${suffix}`, startDate: new Date("2024-09-01"), endDate: new Date("2025-07-31") },
    });
    academicYearId = year.id;
    const subject = await prisma.subject.create({ data: { schoolId, name: "Mathematics", code: `MTH-${suffix}` } });
    subjectId = subject.id;
    const level = await prisma.classLevel.create({ data: { schoolId, name: `JSS1-${suffix}`, order: 1 } });
    const klass = await prisma.class.create({ data: { schoolId, classLevelId: level.id, name: `JSS1A-${suffix}` } });
    classId = klass.id;
    const staff = await prisma.staff.create({
      data: { schoolId, staffNo: `T-${suffix}`, firstName: "Grace", lastName: "Okon", email: `g${suffix}@s.test`, phone: "+2348000000000" },
    });
    staffId = staff.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // Run a service call inside a tenant context (the Prisma middleware + RLS scope on this).
  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("assessment types", () => {
    it("rejects a set whose maxScores do not sum to 100", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 10, order: 0 },
          { name: "Exam", maxScore: 80, order: 1 },
        ])),
      ).rejects.toThrow(/100/);
    });

    it("accepts a valid set summing to 100 and lists it ordered", async () => {
      const saved = await asA(() => types.replace([
        { name: "CA1", maxScore: 10, order: 0 },
        { name: "CA2", maxScore: 10, order: 1 },
        { name: "CA3", maxScore: 10, order: 2 },
        { name: "Exam", maxScore: 70, order: 3 },
      ]));
      expect(saved.map((t) => t.name)).toEqual(["CA1", "CA2", "CA3", "Exam"]);
      const list = await asA(() => types.list());
      expect(list).toHaveLength(4);
    });

    it("rejects duplicate type names", async () => {
      await expect(
        asA(() => types.replace([
          { name: "CA1", maxScore: 50, order: 0 },
          { name: "CA1", maxScore: 50, order: 1 },
        ])),
      ).rejects.toThrow();
    });
  });
});
```
(NOTE: keep the `describe` block open if your editor closes it — Tasks 6–8 add more `describe` blocks **inside** the top-level `describe`, before its closing `});`. The `asA`/`asB`/ids/services are in that scope.)

- [ ] **Step 3: Run it (fails)**

Run (from `apps/api`): `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: FAIL — cannot find the service modules (not yet created).

- [ ] **Step 4: Implement `assessment-types.service.ts`**:
```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AssessmentTypeItemDto } from "./dto/assessment.dto";

@Injectable()
export class AssessmentTypesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.assessmentType.findMany({ orderBy: { order: "asc" } });
  }

  async replace(types: AssessmentTypeItemDto[]) {
    const names = types.map((t) => t.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException("Assessment type names must be unique.");
    }
    const sum = types.reduce((acc, t) => acc + t.maxScore, 0);
    if (sum !== 100) {
      throw new BadRequestException(`Assessment type max scores must sum to 100 (got ${sum}).`);
    }

    // createMany is NOT auto-scoped by the tenant middleware (only single create is),
    // so set schoolId explicitly. deleteMany IS scoped by the middleware.
    const schoolId = TenantContext.schoolIdOrThrow();

    await this.prisma.$transaction([
      this.prisma.assessmentType.deleteMany({}),
      this.prisma.assessmentType.createMany({
        data: types.map((t) => ({
          schoolId,
          name: t.name,
          maxScore: t.maxScore,
          order: t.order,
        })),
      }),
    ]);

    return this.list();
  }
}
```

- [ ] **Step 5: Implement `assessment-types.controller.ts`**:
```ts
import { Body, Controller, Get, HttpCode, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { AssessmentTypesService } from "./assessment-types.service";
import { ReplaceAssessmentTypesDto } from "./dto/assessment.dto";

@Controller("v1/assessment/types")
export class AssessmentTypesController {
  constructor(private service: AssessmentTypesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.service.list();
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceAssessmentTypesDto) {
    return this.service.replace(dto.types);
  }
}
```

- [ ] **Step 6: Run it (passes)**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: PASS (the 3 types tests). Fix the test's bootstrap/auth helper until green (model it exactly on attendance.e2e-spec.ts).

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/assessment/dto/assessment.dto.ts apps/api/src/modules/assessment/assessment-types.service.ts apps/api/src/modules/assessment/assessment-types.controller.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): assessment types GET/PUT with sum-to-100 validation"
```

---

## Task 6: Grade boundaries (GET + PUT + apply-template)

**Files:**
- Create: `apps/api/src/modules/assessment/grade-boundaries.service.ts`
- Create: `apps/api/src/modules/assessment/grade-boundaries.controller.ts`
- Modify: `apps/api/test/assessment.e2e-spec.ts` (add a `describe("grade boundaries")` block)

- [ ] **Step 1: Add the failing e2e block** inside the top-level `describe` in `assessment.e2e-spec.ts` (uses the `asA` helper + services from Task 5's bootstrap):
```ts
  describe("grade boundaries", () => {
    it("applies the WAEC template and lists 9 bands ordered desc by minScore", async () => {
      await asA(() => boundaries.applyTemplate("WAEC"));
      const list = await asA(() => boundaries.list());
      expect(list).toHaveLength(9);
      expect(list[0]?.grade).toBe("A1");
      expect(list[0]?.minScore).toBe(75);
      expect(list[list.length - 1]?.grade).toBe("F9");
      expect(list[list.length - 1]?.minScore).toBe(0);
    });

    it("rejects a band set with no zero (catch-all) band", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 75, remark: "Excellent", order: 0 },
          { grade: "C6", minScore: 50, remark: "Credit", order: 1 },
        ])),
      ).rejects.toThrow();
    });

    it("rejects duplicate minScores", async () => {
      await expect(
        asA(() => boundaries.replace([
          { grade: "A1", minScore: 50, remark: "x", order: 0 },
          { grade: "C6", minScore: 50, remark: "y", order: 1 },
          { grade: "F9", minScore: 0, remark: "z", order: 2 },
        ])),
      ).rejects.toThrow();
    });
  });
```

- [ ] **Step 2: Run it (fails)**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: FAIL — `GradeBoundariesService` not found.

- [ ] **Step 3: Implement `grade-boundaries.service.ts`**:
```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { GradeBoundaryItemDto } from "./dto/assessment.dto";
import { GRADE_TEMPLATES } from "./templates";

@Injectable()
export class GradeBoundariesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.gradeBoundary.findMany({ orderBy: { minScore: "desc" } });
  }

  async replace(boundaries: GradeBoundaryItemDto[]) {
    const grades = boundaries.map((b) => b.grade);
    if (new Set(grades).size !== grades.length) {
      throw new BadRequestException("Grade labels must be unique.");
    }
    const mins = boundaries.map((b) => b.minScore);
    if (new Set(mins).size !== mins.length) {
      throw new BadRequestException("Grade boundary minimum scores must be unique.");
    }
    if (mins.some((m) => m < 0 || m > 100)) {
      throw new BadRequestException("Grade boundary minimum scores must be between 0 and 100.");
    }
    if (!mins.includes(0)) {
      throw new BadRequestException("Grade boundaries must include a catch-all band with minScore 0.");
    }

    const schoolId = TenantContext.schoolIdOrThrow();
    await this.prisma.$transaction([
      this.prisma.gradeBoundary.deleteMany({}),
      this.prisma.gradeBoundary.createMany({
        data: boundaries.map((b) => ({
          schoolId,
          grade: b.grade,
          minScore: b.minScore,
          remark: b.remark,
          order: b.order,
        })),
      }),
    ]);
    return this.list();
  }

  applyTemplate(template: "WAEC" | "NECO") {
    return this.replace(GRADE_TEMPLATES[template]);
  }
}
```

- [ ] **Step 4: Implement `grade-boundaries.controller.ts`**:
```ts
import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { ApplyTemplateDto, ReplaceGradeBoundariesDto } from "./dto/assessment.dto";

@Controller("v1/assessment/grade-boundaries")
export class GradeBoundariesController {
  constructor(private service: GradeBoundariesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.service.list();
  }

  @Put()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  replace(@Body() dto: ReplaceGradeBoundariesDto) {
    return this.service.replace(dto.boundaries);
  }

  @Post("apply-template")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    return this.service.applyTemplate(dto.template);
  }
}
```

- [ ] **Step 5: Run it (passes)**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: PASS (types + grade-boundary tests).

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/modules/assessment/grade-boundaries.service.ts apps/api/src/modules/assessment/grade-boundaries.controller.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): grade boundaries GET/PUT + apply-template"
```

---

## Task 7: Subject assignments (CRUD + tenant validation)

**Files:**
- Create: `apps/api/src/modules/assessment/subject-assignments.service.ts`
- Create: `apps/api/src/modules/assessment/subject-assignments.controller.ts`
- Modify: `apps/api/test/assessment.e2e-spec.ts` (add a `describe("subject assignments")` block; the bootstrap must also create a subject, class, staff, and academic year for school A — model these on the existing structure/SIS e2e setups)

- [ ] **Step 1: Add the failing e2e block** inside the top-level `describe` (uses `asA` + `assignments` + the seeded `subjectId/classId/staffId/academicYearId` + the imported `ConflictException`/`NotFoundException`):
```ts
  describe("subject assignments", () => {
    let createdId: string;

    it("creates an assignment with valid tenant ids", async () => {
      const a = await asA(() => assignments.create({ subjectId, classId, staffId, academicYearId }));
      expect(a.id).toBeDefined();
      createdId = a.id;
    });

    it("rejects a duplicate (subject, class, year) with Conflict", async () => {
      await expect(
        asA(() => assignments.create({ subjectId, classId, staffId, academicYearId })),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects a foreign/unknown subjectId with NotFound", async () => {
      await expect(
        asA(() => assignments.create({ subjectId: "nonexistent", classId, staffId, academicYearId })),
      ).rejects.toThrow(NotFoundException);
    });

    it("lists assignments filtered by class + year, enriched with names", async () => {
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0]?.subject?.name).toBe("Mathematics");
    });

    it("removes an assignment", async () => {
      await asA(() => assignments.remove(createdId));
      const list = await asA(() => assignments.list({ classId, academicYearId }));
      expect(list.find((x) => x.id === createdId)).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run it (fails)**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: FAIL — `SubjectAssignmentsService` not found.

- [ ] **Step 3: Implement `subject-assignments.service.ts`**:
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateSubjectAssignmentDto, UpdateSubjectAssignmentDto } from "./dto/assessment.dto";

@Injectable()
export class SubjectAssignmentsService {
  constructor(private prisma: PrismaService) {}

  list(filters: { classId?: string; academicYearId?: string }) {
    return this.prisma.subjectAssignment.findMany({
      where: {
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(dto: CreateSubjectAssignmentDto) {
    // Tenant IDOR rule: validate every request-supplied id through its tenant-scoped
    // model (findFirst is auto-scoped to the current school by the Prisma middleware)
    // before linking them in a row. A foreign/unknown id returns null -> 404.
    const [subject, klass, staff, year] = await Promise.all([
      this.prisma.subject.findFirst({ where: { id: dto.subjectId } }),
      this.prisma.class.findFirst({ where: { id: dto.classId } }),
      this.prisma.staff.findFirst({ where: { id: dto.staffId } }),
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId } }),
    ]);
    if (!subject) throw new NotFoundException("Subject not found in this school.");
    if (!klass) throw new NotFoundException("Class not found in this school.");
    if (!staff) throw new NotFoundException("Staff member not found in this school.");
    if (!year) throw new NotFoundException("Academic year not found in this school.");

    try {
      return await this.prisma.subjectAssignment.create({
        data: {
          subjectId: dto.subjectId,
          classId: dto.classId,
          staffId: dto.staffId,
          academicYearId: dto.academicYearId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("This subject is already assigned for this class and year.");
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateSubjectAssignmentDto) {
    const existing = await this.prisma.subjectAssignment.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Assignment not found in this school.");
    const staff = await this.prisma.staff.findFirst({ where: { id: dto.staffId } });
    if (!staff) throw new NotFoundException("Staff member not found in this school.");
    return this.prisma.subjectAssignment.update({ where: { id }, data: { staffId: dto.staffId } });
  }

  async remove(id: string) {
    const existing = await this.prisma.subjectAssignment.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Assignment not found in this school.");
    await this.prisma.subjectAssignment.delete({ where: { id } });
    return { deleted: true };
  }
}
```

- [ ] **Step 4: Implement `subject-assignments.controller.ts`**:
```ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { SubjectAssignmentsService } from "./subject-assignments.service";
import { CreateSubjectAssignmentDto, UpdateSubjectAssignmentDto } from "./dto/assessment.dto";

@Controller("v1/assessment/subject-assignments")
export class SubjectAssignmentsController {
  constructor(private service: SubjectAssignmentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query("classId") classId?: string, @Query("academicYearId") academicYearId?: string) {
    return this.service.list({ classId, academicYearId });
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  create(@Body() dto: CreateSubjectAssignmentDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  update(@Param("id") id: string, @Body() dto: UpdateSubjectAssignmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("assessment.configure")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 5: Run it + full module compile**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: PASS (all assessment e2e). Then confirm the whole API builds:
`pnpm --filter @mymakaranta/api build` → success.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/modules/assessment/subject-assignments.service.ts apps/api/src/modules/assessment/subject-assignments.controller.ts apps/api/test/assessment.e2e-spec.ts
git commit -m "feat(assessment): subject assignments CRUD with tenant-id validation"
```

---

## Task 8: Cross-tenant isolation e2e

**Files:**
- Modify: `apps/api/test/assessment.e2e-spec.ts` (add a second school B + an isolation `describe`)

- [ ] **Step 1: Add the isolation block** inside the top-level `describe` (school B was already created in Task 5's bootstrap; uses `asB`):
```ts
  describe("cross-tenant isolation", () => {
    it("school B does not see school A's assessment types", async () => {
      // school A set its types in an earlier test; school B set none.
      const list = await asB(() => types.list());
      expect(list).toHaveLength(0);
    });

    it("school B cannot assign using school A's ids (IDOR -> NotFound)", async () => {
      await expect(
        asB(() => assignments.create({ subjectId, classId, staffId, academicYearId })),
      ).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run it**

Run: `NODE_ENV=test pnpm exec jest --config ./test/jest-e2e.json assessment`
Expected: PASS (isolation holds — the Prisma middleware + RLS scope reads to school B, and the IDOR validation in `create` returns NotFound because school A's ids are invisible under B's context).

- [ ] **Step 3: Commit**
```bash
git add apps/api/test/assessment.e2e-spec.ts
git commit -m "test(assessment): cross-tenant isolation"
```

---

## Task 9: Web API client — assessment endpoints + types

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add types + methods.** First read `apps/web/src/lib/api.ts` to confirm which list endpoints already exist (`listClasses` does). Add any MISSING list helpers the UI needs — `listSubjects()` (`GET /v1/subjects`), `listStaff()` (`GET /v1/staff`), `listAcademicYears()` (`GET /v1/academic-years`) — only if absent, matching the existing `listClasses` style and adding matching `Subject`/`Staff`/`AcademicYear` types if absent. Then add the assessment types + methods:
```ts
export interface AssessmentType {
  id: string;
  name: string;
  maxScore: number;
  order: number;
}

export interface GradeBoundary {
  id: string;
  grade: string;
  minScore: number;
  remark: string;
  order: number;
}

export interface SubjectAssignment {
  id: string;
  subjectId: string;
  classId: string;
  staffId: string;
  academicYearId: string;
  subject?: { id: string; name: string; code: string };
  class?: { id: string; name: string };
  staff?: { id: string; firstName: string; lastName: string };
}
```
And inside the `api` object (alongside the attendance methods):
```ts
  // Assessment config
  getAssessmentTypes: () => authedRequest<AssessmentType[]>("/v1/assessment/types"),
  putAssessmentTypes: (types: Array<{ name: string; maxScore: number; order: number }>) =>
    authedRequest<AssessmentType[]>("/v1/assessment/types", {
      method: "PUT",
      body: JSON.stringify({ types }),
    }),
  getGradeBoundaries: () => authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries"),
  putGradeBoundaries: (
    boundaries: Array<{ grade: string; minScore: number; remark: string; order: number }>,
  ) =>
    authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries", {
      method: "PUT",
      body: JSON.stringify({ boundaries }),
    }),
  applyGradeTemplate: (template: "WAEC" | "NECO") =>
    authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries/apply-template", {
      method: "POST",
      body: JSON.stringify({ template }),
    }),
  listSubjectAssignments: (classId: string, academicYearId: string) =>
    authedRequest<SubjectAssignment[]>(
      `/v1/assessment/subject-assignments?classId=${classId}&academicYearId=${academicYearId}`,
    ),
  createSubjectAssignment: (body: {
    subjectId: string; classId: string; staffId: string; academicYearId: string;
  }) =>
    authedRequest<SubjectAssignment>("/v1/assessment/subject-assignments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubjectAssignment: (id: string, staffId: string) =>
    authedRequest<SubjectAssignment>(`/v1/assessment/subject-assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ staffId }),
    }),
  deleteSubjectAssignment: (id: string) =>
    authedRequest<{ deleted: boolean }>(`/v1/assessment/subject-assignments/${id}`, {
      method: "DELETE",
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mymakaranta/web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(assessment): web api client for assessment config endpoints"
```

---

## Task 10: Web grade-resolution helper (live preview)

**Files:**
- Create: `apps/web/src/lib/grade.ts`
- Test: `apps/web/src/lib/grade.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/grade.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveGrade } from "./grade";

const bands = [
  { grade: "A1", minScore: 75, remark: "Excellent" },
  { grade: "C6", minScore: 50, remark: "Credit" },
  { grade: "F9", minScore: 0, remark: "Fail" },
];

describe("resolveGrade (web)", () => {
  it("returns the band with the greatest minScore <= total", () => {
    expect(resolveGrade(80, bands)?.grade).toBe("A1");
    expect(resolveGrade(60, bands)?.grade).toBe("C6");
    expect(resolveGrade(10, bands)?.grade).toBe("F9");
  });
  it("returns null when nothing matches", () => {
    expect(resolveGrade(10, [{ grade: "A1", minScore: 75, remark: "x" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `pnpm --filter @mymakaranta/web test grade`
Expected: FAIL — cannot find module `./grade`.

- [ ] **Step 3: Implement `apps/web/src/lib/grade.ts`** (mirrors the server resolver; display-only):
```ts
export interface GradeBand {
  grade: string;
  minScore: number;
  remark: string;
}

export function resolveGrade(
  total: number,
  boundaries: GradeBand[],
): { grade: string; remark: string } | null {
  const sorted = [...boundaries].sort((a, b) => b.minScore - a.minScore);
  const band = sorted.find((b) => total >= b.minScore);
  return band ? { grade: band.grade, remark: band.remark } : null;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @mymakaranta/web test grade`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/grade.ts apps/web/src/lib/grade.test.ts
git commit -m "feat(assessment): web grade-resolution helper for live preview"
```

---

## Task 11: Settings → Assessment page (3 panels)

This is the config UI. Build it as ONE client page with three sections. Keep each panel's state local. Use existing design-system primitives imported from `@mymakaranta/ui` (read `apps/web/src/app/(app)/attendance/overview/page.tsx` for the exact import surface — `Card, CardHeader, CardBody, Button, Select, Spinner, EmptyState, ErrorState, cn`, plus inputs as used there).

**Files:**
- Create: `apps/web/src/app/(app)/settings/assessment/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx` (add a link/card to `/settings/assessment`)

- [ ] **Step 1: Add the link from Settings.** In `apps/web/src/app/(app)/settings/page.tsx`, add a navigation card/link to `/settings/assessment` labeled "Assessment & Grading" with a short description ("Score components, grade boundaries, and teacher–subject assignments"). Match the existing settings page's layout/components (read the file first).

- [ ] **Step 2: Create the page** `apps/web/src/app/(app)/settings/assessment/page.tsx`. Full implementation:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, Select, Spinner, cn } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type AssessmentType,
  type GradeBoundary,
  type SubjectAssignment,
  type Class,
} from "@/lib/api";
import { resolveGrade } from "@/lib/grade";

export default function AssessmentSettingsPage() {
  return (
    <div className="px-4 py-8 mx-auto max-w-4xl flex flex-col gap-8">
      <header>
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
          Assessment &amp; Grading
        </h1>
        <p className="text-small text-ink-500">
          Configure score components, grade boundaries, and teacher–subject assignments.
        </p>
      </header>
      <GradeBoundariesPanel />
      <AssessmentTypesPanel />
      <SubjectAssignmentsPanel />
    </div>
  );
}

/* ---------------- Grade boundaries ---------------- */
function GradeBoundariesPanel() {
  const [rows, setRows] = useState<Array<{ grade: string; minScore: number; remark: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getGradeBoundaries();
      setRows(data.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const applyTemplate = async (template: "WAEC" | "NECO") => {
    setMsg(null);
    const data = await api.applyGradeTemplate(template);
    setRows(data.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark })));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putGradeBoundaries(rows.map((r, i) => ({ ...r, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<{ grade: string; minScore: number; remark: string }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { grade: "", minScore: 0, remark: "" }]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Grade boundaries</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => applyTemplate("WAEC")}>Apply WAEC</Button>
            <Button variant="outline" size="sm" onClick={() => applyTemplate("NECO")}>Apply NECO</Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-small text-ink-500">No grade boundaries yet. Apply WAEC to start, then edit.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label="grade" value={r.grade} onChange={(e) => update(i, { grade: e.target.value })}
                  className="h-9 w-20 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="min score" type="number" value={r.minScore}
                  onChange={(e) => update(i, { minScore: Number(e.target.value) })}
                  className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="remark" value={r.remark} onChange={(e) => update(i, { remark: e.target.value })}
                  className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
              </div>
            ))}
            <div className="flex items-center justify-between mt-2">
              <Button variant="ghost" size="sm" onClick={addRow}>+ Add band</Button>
              <span className="text-caption text-ink-500">
                Preview: 82 → {resolveGrade(82, rows)?.grade ?? "—"} · 58 → {resolveGrade(58, rows)?.grade ?? "—"}
              </span>
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={saving || rows.length === 0}>Save boundaries</Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------------- Assessment types ---------------- */
function AssessmentTypesPanel() {
  const [rows, setRows] = useState<Array<{ name: string; maxScore: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAssessmentTypes();
      setRows(data.map((t) => ({ name: t.name, maxScore: t.maxScore })));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((acc, r) => acc + (Number(r.maxScore) || 0), 0);
  const valid = total === 100 && rows.length > 0;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.putAssessmentTypes(rows.map((r, i) => ({ ...r, order: i })));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<{ name: string; maxScore: number }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { name: "", maxScore: 0 }]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Assessment components</span>
          <span className={cn("text-small font-medium tabular-nums", valid ? "text-success" : "text-error")}>
            Total: {total} {valid ? "✓" : "✗ must equal 100"}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.length === 0 && (
              <p className="text-small text-ink-500">No components yet. Add CA1, CA2, CA3, Exam… summing to 100.</p>
            )}
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label="component name" value={r.name} placeholder="e.g. CA1"
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="h-9 flex-1 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <input
                  aria-label="max score" type="number" value={r.maxScore}
                  onChange={(e) => update(i, { maxScore: Number(e.target.value) })}
                  className="h-9 w-24 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="remove">✕</Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addRow} className="self-start mt-1">+ Add component</Button>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={!valid || saving}>Save components</Button>
          {msg && <span className="text-caption text-ink-500">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------------- Subject assignments ---------------- */
function SubjectAssignmentsPanel() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [years, setYears] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [classId, setClassId] = useState("");
  const [yearId, setYearId] = useState("");
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cs, ys, ss, st] = await Promise.all([
        api.listClasses(), api.listAcademicYears(), api.listSubjects(), api.listStaff(),
      ]);
      setClasses(cs);
      setYears(ys.map((y) => ({ id: y.id, name: y.name })));
      setSubjects(ss.map((s) => ({ id: s.id, name: s.name })));
      setStaff(st);
      if (cs[0]) setClassId(cs[0].id);
      if (ys[0]) setYearId(ys[0].id);
    })();
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!classId || !yearId) return;
    setAssignments(await api.listSubjectAssignments(classId, yearId));
  }, [classId, yearId]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const add = async () => {
    setMsg(null);
    if (!subjectId || !staffId) return;
    try {
      await api.createSubjectAssignment({ subjectId, classId, staffId, academicYearId: yearId });
      setSubjectId(""); setStaffId("");
      await loadAssignments();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not assign.");
    }
  };
  const remove = async (id: string) => { await api.deleteSubjectAssignment(id); await loadAssignments(); };

  return (
    <Card>
      <CardHeader>
        <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Subject assignments</span>
      </CardHeader>
      <CardBody>
        <div className="flex gap-3 flex-wrap mb-4">
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Academic year
            <select value={yearId} onChange={(e) => setYearId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          {assignments.length === 0 && (
            <p className="text-small text-ink-500">No subjects assigned to this class for the selected year.</p>
          )}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border-b border-ink-100 dark:border-white/10 pb-2">
              <span className="text-small text-ink-1000 dark:text-ink-100">{a.subject?.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-small text-ink-500">
                  {a.staff ? `${a.staff.firstName} ${a.staff.lastName}` : "—"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => remove(a.id)} aria-label="remove">✕</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end gap-2 flex-wrap">
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Subject
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              <option value="">Select…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-small text-ink-500 flex flex-col gap-1">
            Teacher
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
              className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small">
              <option value="">Select…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
          </label>
          <Button onClick={add} disabled={!subjectId || !staffId}>Assign</Button>
          {msg && <span className="text-caption text-error">{msg}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
```
NOTE: confirm `Card/CardHeader/CardBody/Button/Select/Spinner/cn` are exported from `@mymakaranta/ui` (they are used by `attendance/overview/page.tsx`). The native `<select>`/`<input>` elements are used for the dense config grid (the design-system `Select` is fine too, but raw selects keep this admin form compact); style with the same token classes used elsewhere. If `Select` is preferred for consistency, swap the year/class pickers to `Select.Root` as in `attendance/page.tsx`.

- [ ] **Step 3: Verify**

Run:
```bash
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
Expected: all pass (`/settings/assessment` route builds). Resolve any missing-export errors by aligning imports with what `@mymakaranta/ui` actually exports.

- [ ] **Step 4: Commit**
```bash
git add "apps/web/src/app/(app)/settings/assessment/page.tsx" "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "feat(assessment): Settings → Assessment config UI (boundaries, components, assignments)"
```

---

## Task 12: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (use the playbook in `docs/RESUME.md`). Start API (4080) + web (3000). Seed a fresh school (so the proprietor gets `assessment.configure`) with ≥1 class, ≥2 subjects, ≥1 staff, an academic year. Then at `/settings/assessment`:
  - Apply WAEC → 9 bands render; edit a remark → Save → reload shows the edit.
  - Add CA1/CA2/CA3/Exam (10/10/10/70) → total badge "100 ✓" → Save; try a set summing to 90 → Save disabled + (if forced) 400.
  - Assign a teacher to a subject for the current class+year → row appears; re-assign same subject → 409 surfaced; remove → row gone.
  - Verify persistence via API (`GET /v1/assessment/types`, `/grade-boundaries`, `/subject-assignments?...`).
  - Fix any UI↔API seam bug found (atomic `fix(qa):` commit + re-verify). Record results in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — add Sprint 3 slice 1 to Current state (new `assessment` module + models + config UI; note the remaining 5 Sprint 3 slices; bump test counts). Commit.

- [ ] **Step 3: Finish the branch** — use `superpowers:finishing-a-development-branch` (verify tests/builds, then merge `sprint-3-assessment-config` → main).

---

## Notes for the implementer
- **Tenant middleware does NOT scope `createMany`** (only single `create`). Replace-as-unit services set `schoolId` explicitly via `TenantContext.schoolIdOrThrow()`; `deleteMany` IS scoped. (`apps/api/src/core/prisma/prisma.service.ts`.)
- **Tenant IDOR rule:** validate every request-supplied id (`subjectId/classId/staffId/academicYearId`) through a tenant-scoped `findFirst` before linking — a foreign id returns null → 404. Recurs across this codebase; do not skip.
- **e2e style = service-level, not HTTP.** This repo's module e2e (e.g. `attendance.e2e-spec.ts`) instantiates the Nest testing module, grabs the service, seeds via Prisma, and calls service methods inside `TenantContext.run({ schoolId, userId }, fn)` against a real Postgres. There are no tokens/supertest for module logic (only `auth`/`onboarding` specs use HTTP). The `asA`/`asB` helpers in Task 5 encapsulate this. Controllers (thin guard+delegate) and the `assessment.configure` PermissionGuard wiring are not re-tested here — they match the attendance pattern exactly.
- **Permission grant:** `createSchool` grants ALL catalog permissions to the new proprietor, so seeding `assessment.configure` (Task 3) is enough for fresh schools; no per-user grant code needed.
- **`@mymakaranta/ui` exports:** confirm component names against `attendance/overview/page.tsx` and `attendance/page.tsx` before importing; align if a name differs.
- Run web tests/builds with the web dev server STOPPED (a `next build` poisons a live `next dev` `.next` — see RESUME).
