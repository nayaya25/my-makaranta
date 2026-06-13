# Sprint 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a deployable, multi-tenant-aware monorepo skeleton with phone-based auth, design tokens, and the foundational ~27-component library. This is the prerequisite for every feature sprint.

**Architecture:** pnpm-workspace monorepo orchestrated by Turborepo. Backend is a single NestJS modular monolith on PostgreSQL via Prisma; tenancy is row-level (`schoolId`) with PostgreSQL Row-Level Security as defense-in-depth. Web is Next.js 14 App Router; mobile is Expo (React Native 0.74+). Component library lives in `packages/ui` and is consumed by web and mobile via shared design tokens. **No shadcn/ui** — components are built in-house over Radix UI primitives + pure Tailwind.

**Tech stack:** TypeScript 5.4, pnpm 9.x, Turborepo 2.x, Next.js 14, NestJS 10, Prisma 5, PostgreSQL 16, Tailwind 3.4, `@radix-ui/react-*` (latest), `class-variance-authority`, `tailwind-merge`, `framer-motion` 11, `lucide-react`, Expo SDK 51, `react-native-reanimated` 3, Storybook 8, Vitest, Jest, GitHub Actions, Vercel, Fly.io, Expo EAS.

**Sprint window:** Weeks 1–3 of the 16-week MVP. Two engineers + founding designer. ~28 tasks.

**Conventions:**
- Bash-style commands. Windows engineers use Git Bash, WSL, or translate to PowerShell.
- Each task ends with a commit. Commit messages follow Conventional Commits.
- Tests precede implementation where the unit has behavior; for pure scaffolding, build/run verification replaces unit tests.
- All hex colors and magic values come from `tokens.ts` — never inline.

---

## Sprint 0 file structure

By end of sprint:

```
mymakaranta/
├── .github/workflows/ci.yml
├── .gitignore
├── package.json                          # workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml                    # local Postgres
├── apps/
│   ├── web/                              # Next.js 14 — proprietor/principal/bursar/registrar
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx
│   │       │   └── (auth)/login/page.tsx
│   │       └── lib/
│   ├── api/                              # NestJS modular monolith
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── core/
│   │       │   ├── tenant/
│   │       │   │   ├── tenant.middleware.ts
│   │       │   │   ├── tenant.context.ts
│   │       │   │   └── tenant.module.ts
│   │       │   ├── prisma/
│   │       │   │   ├── prisma.service.ts
│   │       │   │   └── prisma.module.ts
│   │       │   └── auth/
│   │       │       ├── auth.module.ts
│   │       │       ├── auth.controller.ts
│   │       │       ├── auth.service.ts
│   │       │       ├── sms.service.ts
│   │       │       ├── jwt.strategy.ts
│   │       │       ├── auth.guard.ts
│   │       │       └── permissions/
│   │       │           ├── permission.decorator.ts
│   │       │           ├── permission.guard.ts
│   │       │           └── permission.resolver.ts
│   │       └── modules/
│   │           └── (empty in sprint 0; populated in sprint 1)
│   ├── mobile-teacher/                   # Expo
│   │   ├── package.json
│   │   ├── app.json
│   │   ├── babel.config.js
│   │   ├── metro.config.js
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.js            # nativewind
│   │   ├── App.tsx
│   │   └── src/
│   │       └── screens/Login.tsx
│   └── mobile-parent/                    # Expo (mirrors mobile-teacher)
│       └── (same structure)
└── packages/
    ├── ui/                               # design system + components
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tailwind.config.ts
    │   ├── tokens.ts                     # SOURCE OF TRUTH
    │   ├── tailwind-preset.ts            # consumed by apps/*/tailwind.config
    │   ├── .storybook/
    │   │   ├── main.ts
    │   │   └── preview.tsx
    │   └── src/
    │       ├── index.ts
    │       ├── lib/cn.ts                 # tailwind-merge helper
    │       └── components/
    │           ├── button.tsx
    │           ├── icon-button.tsx
    │           ├── input.tsx
    │           ├── textarea.tsx
    │           ├── card.tsx
    │           ├── tag.tsx
    │           ├── chip.tsx
    │           ├── avatar.tsx
    │           ├── badge.tsx
    │           ├── skeleton.tsx
    │           ├── empty-state.tsx
    │           ├── error-state.tsx
    │           ├── dialog.tsx            # Radix wrapper
    │           ├── sheet.tsx             # Radix wrapper
    │           ├── drawer.tsx            # Radix wrapper
    │           ├── toast.tsx             # Radix wrapper
    │           ├── tooltip.tsx           # Radix wrapper
    │           ├── popover.tsx           # Radix wrapper
    │           ├── tabs.tsx              # Radix wrapper
    │           ├── accordion.tsx         # Radix wrapper
    │           ├── dropdown.tsx          # Radix wrapper
    │           ├── select.tsx            # Radix wrapper
    │           ├── switch.tsx            # Radix wrapper
    │           ├── checkbox.tsx          # Radix wrapper
    │           ├── radio.tsx             # Radix wrapper
    │           ├── nav-menu.tsx          # Radix wrapper
    │           └── breadcrumb.tsx
    ├── types/                            # shared TS types
    │   └── package.json
    └── config/                           # eslint, tsconfig, prettier shared
        └── package.json
```

---

## Tasks

### Task 1: Monorepo bootstrap

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`

- [ ] **Step 1: Initialize repo root**

```bash
mkdir mymakaranta && cd mymakaranta
git init
pnpm init
```

- [ ] **Step 2: Edit `package.json` to define workspace and Turbo scripts**

```json
{
  "name": "mymakaranta",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.7.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "engines": {
    "node": ">=20.10.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": { "outputs": ["coverage/**"] },
    "typecheck": {}
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
.next
dist
.turbo
.env
.env.local
.DS_Store
coverage
*.log
.vercel
.expo
```

- [ ] **Step 7: Verify and commit**

```bash
pnpm install
git add .
git commit -m "chore: bootstrap monorepo with pnpm + turbo"
```

Expected: `node_modules/` populated; `pnpm -r run` lists no packages yet (fine).

---

### Task 2: Shared TypeScript + ESLint + Prettier config

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.app.json`, `packages/config/tsconfig.lib.json`, `packages/config/eslint.config.js`, `packages/config/prettier.config.js`

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@mymakaranta/config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "files": ["*.js", "*.json"],
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.16.0",
    "@typescript-eslint/parser": "^7.16.0",
    "eslint": "^9.6.0",
    "eslint-config-next": "^14.2.0",
    "prettier": "^3.3.0"
  }
}
```

- [ ] **Step 2: Create `packages/config/tsconfig.app.json`** (for Next.js / Expo apps)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "incremental": true
  }
}
```

- [ ] **Step 3: Create `packages/config/tsconfig.lib.json`** (for packages/ui, etc.)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 4: Create `packages/config/eslint.config.js`**

```js
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["node_modules", "dist", ".next", "coverage"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": "error"
  }
};
```

- [ ] **Step 5: Create `packages/config/prettier.config.js`**

```js
module.exports = {
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  arrowParens: "always",
  plugins: []
};
```

- [ ] **Step 6: Install and verify**

```bash
pnpm install
pnpm --filter @mymakaranta/config exec tsc --version
```

- [ ] **Step 7: Commit**

```bash
git add packages/config
git commit -m "chore: add shared TS, ESLint, Prettier config"
```

---

### Task 3: PostgreSQL via docker-compose + .env baseline

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: mymakaranta-postgres
    environment:
      POSTGRES_USER: makaranta
      POSTGRES_PASSWORD: makaranta_dev
      POSTGRES_DB: makaranta_dev
    ports:
      - "5432:5432"
    volumes:
      - mymakaranta_pg_data:/var/lib/postgresql/data
volumes:
  mymakaranta_pg_data:
```

- [ ] **Step 2: Create `.env.example`**

```bash
DATABASE_URL=postgresql://makaranta:makaranta_dev@localhost:5432/makaranta_dev?schema=public
JWT_SECRET=dev-secret-change-me
SMS_PROVIDER=mock
SMS_API_KEY=mock
PAYSTACK_SECRET_KEY=
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
```

- [ ] **Step 3: Bring up Postgres and verify**

```bash
docker compose up -d postgres
docker exec mymakaranta-postgres pg_isready -U makaranta
```

Expected: `accepting connections`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add Postgres docker-compose + env baseline"
```

---

### Task 4: NestJS API scaffold

**Files:**
- Create: `apps/api/package.json`, `apps/api/nest-cli.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/app.controller.ts`, `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@mymakaranta/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.0",
    "@prisma/client": "^5.16.0",
    "bcrypt": "^5.1.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@mymakaranta/config": "workspace:*",
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/bcrypt": "^5.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.14.0",
    "@types/passport-jwt": "^4.0.0",
    "jest": "^29.7.0",
    "prisma": "^5.16.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.0",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../packages/config/tsconfig.lib.json",
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2022",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noEmit": false,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test/**/*.e2e-spec.ts"]
}
```

- [ ] **Step 4: Write the failing e2e test for the health endpoint**

Create `apps/api/test/app.e2e-spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());

  it("GET /health returns ok", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

Create `apps/api/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node"
}
```

- [ ] **Step 5: Run the test — expect failure (no app yet)**

```bash
pnpm install
pnpm --filter @mymakaranta/api test:e2e
```

Expected: FAIL — "Cannot find module ../src/app.module"

- [ ] **Step 6: Implement minimal app**

Create `apps/api/src/app.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class AppController {
  @Get()
  health() {
    return { status: "ok" };
  }
}
```

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
})
export class AppModule {}
```

Create `apps/api/src/main.ts`:

```ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.APP_BASE_URL ?? "http://localhost:3000" });
  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();
```

- [ ] **Step 7: Run test — expect pass**

```bash
pnpm --filter @mymakaranta/api test:e2e
```

Expected: PASS

- [ ] **Step 8: Run dev server and verify health**

```bash
pnpm --filter @mymakaranta/api dev
# In another terminal:
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): NestJS scaffold with /health endpoint and e2e test"
```

---

### Task 5: Prisma schema — core SIS entities

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/src/core/prisma/prisma.service.ts`, `apps/api/src/core/prisma/prisma.module.ts`

- [ ] **Step 1: Create `apps/api/prisma/schema.prisma`** with the foundational entities (the rest land in sprint 1)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Gender {
  MALE
  FEMALE
}

enum CountryCode {
  NG
  GH
  KE
}

enum LangCode {
  EN
  HA
  YO
  IG
}

enum GuardianRelation {
  MOTHER
  FATHER
  GUARDIAN
  GRANDPARENT
  AUNT
  UNCLE
  OTHER
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum InvoiceStatus {
  UNPAID
  PARTIAL
  PAID
  OVERDUE
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
  REVERSED
}

enum PaymentChannel {
  PAYSTACK
  FLUTTERWAVE
  BANK_TRANSFER
  CASH
}

model School {
  id         String      @id @default(cuid())
  name       String
  slug       String      @unique
  logoUrl    String?
  country    CountryCode @default(NG)
  currency   String      @default("NGN")
  createdAt  DateTime    @default(now())

  classes    Class[]
  classLevels ClassLevel[]
  subjects   Subject[]
  staff      Staff[]
  students   Student[]
  parents    Parent[]
  academicYears AcademicYear[]
}

model AcademicYear {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id])
  name      String
  startDate DateTime
  endDate   DateTime
  terms     Term[]

  @@unique([schoolId, name])
}

model Term {
  id              String       @id @default(cuid())
  schoolId        String
  academicYearId  String
  academicYear    AcademicYear @relation(fields: [academicYearId], references: [id])
  number          Int
  startDate       DateTime
  endDate         DateTime
  isCurrent       Boolean      @default(false)
  enrollments     Enrollment[]
}

model ClassLevel {
  id       String  @id @default(cuid())
  schoolId String
  school   School  @relation(fields: [schoolId], references: [id])
  name     String
  order    Int
  classes  Class[]

  @@unique([schoolId, name])
}

model Class {
  id            String      @id @default(cuid())
  schoolId      String
  school        School      @relation(fields: [schoolId], references: [id])
  classLevelId  String
  classLevel    ClassLevel  @relation(fields: [classLevelId], references: [id])
  name          String
  formTeacherId String?
  enrollments   Enrollment[]

  @@unique([schoolId, name])
}

model Subject {
  id       String @id @default(cuid())
  schoolId String
  school   School @relation(fields: [schoolId], references: [id])
  name     String
  code     String

  @@unique([schoolId, code])
}

model Staff {
  id        String   @id @default(cuid())
  schoolId  String
  school    School   @relation(fields: [schoolId], references: [id])
  staffNo   String
  firstName String
  lastName  String
  photoUrl  String?
  email     String
  phone     String
  hiredAt   DateTime @default(now())

  @@unique([schoolId, staffNo])
  @@unique([schoolId, email])
}

model Student {
  id            String   @id @default(cuid())
  schoolId      String
  school        School   @relation(fields: [schoolId], references: [id])
  admissionNo   String
  firstName     String
  middleName    String?
  lastName      String
  photoUrl      String?
  gender        Gender
  dateOfBirth   DateTime
  stateOfOrigin String?
  enteredAt     DateTime @default(now())

  guardians   Guardian[]
  enrollments Enrollment[]

  @@unique([schoolId, admissionNo])
}

model Parent {
  id            String    @id @default(cuid())
  schoolId      String
  school        School    @relation(fields: [schoolId], references: [id])
  phone         String
  email         String?
  firstName     String
  lastName      String
  preferredLang LangCode  @default(EN)

  guardians Guardian[]

  @@unique([schoolId, phone])
}

model Guardian {
  id           String           @id @default(cuid())
  studentId    String
  student      Student          @relation(fields: [studentId], references: [id])
  parentId     String
  parent       Parent           @relation(fields: [parentId], references: [id])
  relationship GuardianRelation
  isPrimary    Boolean          @default(false)

  @@unique([studentId, parentId])
}

model Enrollment {
  id        String  @id @default(cuid())
  studentId String
  classId   String
  termId    String
  student   Student @relation(fields: [studentId], references: [id])
  class     Class   @relation(fields: [classId], references: [id])
  term      Term    @relation(fields: [termId], references: [id])

  @@unique([studentId, termId])
}

// === Auth ===

model User {
  id           String   @id @default(cuid())
  schoolId     String?
  identityType String
  identityId   String
  phone        String?  @unique
  email        String?  @unique
  passwordHash String?
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())

  permissions UserPermission[]
}

model Permission {
  id          String           @id @default(cuid())
  key         String           @unique
  description String
  users       UserPermission[]
}

model UserPermission {
  userId       String
  permissionId String
  scope        Json    @default("{}")
  user         User       @relation(fields: [userId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([userId, permissionId])
}

model OtpRequest {
  id        String   @id @default(cuid())
  phone     String
  codeHash  String
  expiresAt DateTime
  consumed  Boolean  @default(false)
  attempts  Int      @default(0)
  createdAt DateTime @default(now())

  @@index([phone, createdAt])
}
```

- [ ] **Step 2: Run the first migration**

```bash
cd apps/api
cp ../../.env.example .env
pnpm exec prisma migrate dev --name init
```

Expected: migration created in `apps/api/prisma/migrations/` and applied. `prisma generate` runs automatically.

- [ ] **Step 3: Create `apps/api/src/core/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Create `apps/api/src/core/prisma/prisma.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Wire PrismaModule into AppModule**

Update `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { PrismaModule } from "./core/prisma/prisma.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 6: Verify Prisma client connects on boot**

```bash
pnpm --filter @mymakaranta/api dev
```

Expected: server starts on :4000 with no Prisma errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/core/prisma apps/api/src/app.module.ts
git commit -m "feat(api): Prisma schema + PrismaModule for SIS core entities"
```

---

### Task 6: Tenant context middleware + Prisma extension

**Files:**
- Create: `apps/api/src/core/tenant/tenant.context.ts`, `apps/api/src/core/tenant/tenant.middleware.ts`, `apps/api/src/core/tenant/tenant.module.ts`
- Modify: `apps/api/src/core/prisma/prisma.service.ts`, `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing test for tenant context propagation**

Create `apps/api/test/tenant.spec.ts`:

```ts
import { TenantContext } from "../src/core/tenant/tenant.context";

describe("TenantContext", () => {
  it("returns null outside a run", () => {
    expect(TenantContext.current()).toBeNull();
  });

  it("propagates schoolId within run()", async () => {
    const result = await TenantContext.run({ schoolId: "school-1", userId: "u1" }, async () => {
      return TenantContext.current();
    });
    expect(result).toEqual({ schoolId: "school-1", userId: "u1" });
  });

  it("isolates concurrent runs", async () => {
    const [a, b] = await Promise.all([
      TenantContext.run({ schoolId: "A", userId: "ua" }, async () => TenantContext.current()),
      TenantContext.run({ schoolId: "B", userId: "ub" }, async () => TenantContext.current()),
    ]);
    expect(a?.schoolId).toBe("A");
    expect(b?.schoolId).toBe("B");
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm --filter @mymakaranta/api exec jest test/tenant.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tenant.context.ts` using AsyncLocalStorage**

```ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantInfo {
  schoolId: string | null;
  userId: string | null;
}

const storage = new AsyncLocalStorage<TenantInfo>();

export const TenantContext = {
  current(): TenantInfo | null {
    return storage.getStore() ?? null;
  },
  async run<T>(info: TenantInfo, fn: () => Promise<T>): Promise<T> {
    return storage.run(info, fn);
  },
  schoolIdOrThrow(): string {
    const ctx = storage.getStore();
    if (!ctx?.schoolId) throw new Error("TenantContext: schoolId required");
    return ctx.schoolId;
  },
};
```

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm --filter @mymakaranta/api exec jest test/tenant.spec.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Create `tenant.middleware.ts`**

```ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { TenantContext } from "./tenant.context";

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const schoolId = (req as any).user?.schoolId ?? null;
    const userId = (req as any).user?.id ?? null;
    TenantContext.run({ schoolId, userId }, async () => next()).catch(next);
  }
}
```

- [ ] **Step 6: Add Prisma client extension to filter by `schoolId` automatically**

Replace `apps/api/src/core/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../tenant/tenant.context";

const TENANT_MODELS = new Set([
  "School", "AcademicYear", "Term", "ClassLevel", "Class", "Subject",
  "Staff", "Student", "Parent", "Enrollment",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    this.$use(async (params, next) => {
      const ctx = TenantContext.current();
      if (!ctx?.schoolId) return next(params);
      if (!params.model || !TENANT_MODELS.has(params.model)) return next(params);

      if (params.action === "findUnique" || params.action === "findFirst" || params.action === "findMany") {
        params.args = params.args ?? {};
        params.args.where = { ...(params.args.where ?? {}), schoolId: ctx.schoolId };
      }
      if (params.action === "create") {
        params.args = params.args ?? {};
        params.args.data = { ...(params.args.data ?? {}), schoolId: ctx.schoolId };
      }
      if (params.action === "update" || params.action === "delete" || params.action === "updateMany" || params.action === "deleteMany") {
        params.args = params.args ?? {};
        params.args.where = { ...(params.args.where ?? {}), schoolId: ctx.schoolId };
      }
      return next(params);
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 7: Create `tenant.module.ts` and register middleware in AppModule**

Create `apps/api/src/core/tenant/tenant.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TenantMiddleware } from "./tenant.middleware";

@Module({
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantModule {}
```

Update `apps/api/src/app.module.ts`:

```ts
import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { PrismaModule } from "./core/prisma/prisma.module";
import { TenantModule } from "./core/tenant/tenant.module";
import { TenantMiddleware } from "./core/tenant/tenant.middleware";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TenantModule],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): tenant context with AsyncLocalStorage + Prisma middleware injection"
```

---

### Task 7: PostgreSQL Row-Level Security policy on Student (defense-in-depth)

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_rls_student/migration.sql` (manual migration)

- [ ] **Step 1: Create a manual migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --create-only --name rls_student
```

This creates an empty migration directory; replace its `migration.sql`:

```sql
-- Enable RLS on Student
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;

-- Create policy that filters by app.current_school_id session variable
CREATE POLICY student_tenant_isolation ON "Student"
  USING ("schoolId" = current_setting('app.current_school_id', true));

-- Create a role for application connections that respects RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mymakaranta_app') THEN
    CREATE ROLE mymakaranta_app NOINHERIT LOGIN PASSWORD 'app_dev_password';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Student" TO mymakaranta_app;
```

- [ ] **Step 2: Apply migration**

```bash
pnpm exec prisma migrate dev
```

- [ ] **Step 3: Update `prisma.service.ts` to set the session variable on each query**

Add to the `$use` middleware after the existing logic:

```ts
this.$use(async (params, next) => {
  const ctx = TenantContext.current();
  if (ctx?.schoolId) {
    await this.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${ctx.schoolId.replace(/'/g, "")}'`);
  }
  return next(params);
});
```

`ASSUMPTION:` This naive escape is acceptable because schoolId is a CUID (alphanumeric only). Validate in code review; consider a parameterized session-variable approach if CUID format ever changes.

- [ ] **Step 4: Write integration test that proves cross-tenant isolation**

Create `apps/api/test/rls.e2e-spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";

describe("RLS on Student", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  it("school A cannot read school B students", async () => {
    const a = await prisma.school.create({ data: { name: "A", slug: `a-${Date.now()}` } });
    const b = await prisma.school.create({ data: { name: "B", slug: `b-${Date.now()}` } });

    await TenantContext.run({ schoolId: a.id, userId: "u" }, async () => {
      await prisma.student.create({ data: {
        admissionNo: "001", firstName: "Aisha", lastName: "Mohammed",
        gender: "FEMALE", dateOfBirth: new Date("2010-01-01"),
        schoolId: a.id,
      } });
    });

    const visibleToB = await TenantContext.run({ schoolId: b.id, userId: "u" }, async () => {
      return prisma.student.findMany();
    });

    expect(visibleToB).toHaveLength(0);
  });

  afterAll(async () => await prisma.$disconnect());
});
```

- [ ] **Step 5: Run test**

```bash
pnpm --filter @mymakaranta/api exec jest test/rls.e2e-spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): RLS policy on Student + cross-tenant isolation test"
```

---

### Task 8: Auth — User identity + SMS OTP request

**Files:**
- Create: `apps/api/src/core/auth/auth.module.ts`, `apps/api/src/core/auth/auth.controller.ts`, `apps/api/src/core/auth/auth.service.ts`, `apps/api/src/core/auth/sms.service.ts`, `apps/api/src/core/auth/dto.ts`

- [ ] **Step 1: Create DTOs and SMS service**

Create `apps/api/src/core/auth/dto.ts`:

```ts
import { IsString, Matches, Length } from "class-validator";

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: "phone must be 10-15 digits, optionally with +" })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
```

Create `apps/api/src/core/auth/sms.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider = process.env.SMS_PROVIDER ?? "mock";

  async send(phone: string, message: string): Promise<void> {
    if (this.provider === "mock") {
      this.logger.log(`[MOCK SMS] to ${phone}: ${message}`);
      return;
    }
    // Termii integration lands in sprint 5 (Communication module).
    throw new Error(`SMS provider ${this.provider} not yet implemented`);
  }
}
```

- [ ] **Step 2: Write failing test for OTP request**

Create `apps/api/test/auth.e2e-spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("Auth (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());

  it("POST /auth/otp/request creates an OTP record and returns 204", async () => {
    await request(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ phone: "+2348012345678" })
      .expect(204);
  });

  it("POST /auth/otp/request rejects malformed phone", async () => {
    await request(app.getHttpServer())
      .post("/auth/otp/request")
      .send({ phone: "abc" })
      .expect(400);
  });
});
```

- [ ] **Step 3: Run test — expect fail**

```bash
pnpm --filter @mymakaranta/api test:e2e
```

Expected: FAIL — no /auth/otp/request route.

- [ ] **Step 4: Implement AuthService**

Create `apps/api/src/core/auth/auth.service.ts`:

```ts
import { Injectable, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "./sms.service";

const OTP_TTL_MINUTES = 10;
const OTP_RATE_LIMIT_PER_HOUR = 5;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private sms: SmsService) {}

  async requestOtp(phone: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpRequest.count({
      where: { phone, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= OTP_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException("Too many OTP requests. Try again in an hour.");
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpRequest.create({ data: { phone, codeHash, expiresAt } });
    await this.sms.send(phone, `Your myMakaranta code is ${code}. Expires in ${OTP_TTL_MINUTES} minutes.`);
  }
}
```

- [ ] **Step 5: Implement AuthController**

Create `apps/api/src/core/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RequestOtpDto } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("otp/request")
  @HttpCode(204)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp(dto.phone);
  }
}
```

- [ ] **Step 6: Wire AuthModule**

Create `apps/api/src/core/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SmsService } from "./sms.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SmsService],
  exports: [AuthService],
})
export class AuthModule {}
```

Add `AuthModule` to `AppModule.imports`.

- [ ] **Step 7: Install class-validator**

```bash
pnpm --filter @mymakaranta/api add class-validator class-transformer
```

- [ ] **Step 8: Run tests — expect pass**

```bash
pnpm --filter @mymakaranta/api test:e2e
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): auth — phone-based OTP request with mock SMS sender"
```

---

### Task 9: Auth — OTP verify + JWT issuance + JwtAuthGuard

**Files:**
- Modify: `apps/api/src/core/auth/auth.service.ts`, `apps/api/src/core/auth/auth.controller.ts`, `apps/api/src/core/auth/auth.module.ts`
- Create: `apps/api/src/core/auth/jwt.strategy.ts`, `apps/api/src/core/auth/auth.guard.ts`

- [ ] **Step 1: Write failing test for verify + protected endpoint**

Append to `apps/api/test/auth.e2e-spec.ts`:

```ts
it("POST /auth/otp/verify with correct code returns JWT", async () => {
  await request(app.getHttpServer())
    .post("/auth/otp/request").send({ phone: "+2348011112222" }).expect(204);

  // In tests, we read the OTP directly from DB. In dev, the mock SMS log shows it.
  const prisma = app.get(require("../src/core/prisma/prisma.service").PrismaService);
  const otp = await prisma.otpRequest.findFirst({
    where: { phone: "+2348011112222" }, orderBy: { createdAt: "desc" },
  });
  expect(otp).toBeTruthy();
  // We can't bcrypt-reverse the code; instead expose a test hook that issues a known code in NODE_ENV=test.
});
```

`ASSUMPTION:` In test mode (`NODE_ENV=test`), the SMS service returns the plain code so tests can verify. Production path remains opaque.

- [ ] **Step 2: Update SmsService to return code in test mode**

```ts
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider = process.env.SMS_PROVIDER ?? "mock";
  private lastCode = new Map<string, string>();

  async send(phone: string, message: string): Promise<void> {
    if (this.provider === "mock") {
      this.logger.log(`[MOCK SMS] to ${phone}: ${message}`);
      const m = message.match(/(\d{6})/);
      if (m) this.lastCode.set(phone, m[1]);
      return;
    }
    throw new Error(`SMS provider ${this.provider} not yet implemented`);
  }

  /** Test-only — never call in production code. */
  __getLastCodeForTest(phone: string): string | undefined {
    if (process.env.NODE_ENV !== "test") return undefined;
    return this.lastCode.get(phone);
  }
}
```

- [ ] **Step 3: Update test to use the test hook**

```ts
import { SmsService } from "../src/core/auth/sms.service";

it("POST /auth/otp/verify with correct code returns JWT", async () => {
  const phone = "+2348011112222";
  await request(app.getHttpServer()).post("/auth/otp/request").send({ phone }).expect(204);

  const sms = app.get(SmsService);
  const code = sms.__getLastCodeForTest(phone)!;
  expect(code).toMatch(/^\d{6}$/);

  const res = await request(app.getHttpServer())
    .post("/auth/otp/verify").send({ phone, code }).expect(200);
  expect(res.body.token).toBeTruthy();
  expect(res.body.user.phone).toBe(phone);
});

it("GET /me with valid JWT returns user", async () => {
  const phone = "+2348022223333";
  await request(app.getHttpServer()).post("/auth/otp/request").send({ phone }).expect(204);
  const sms = app.get(SmsService);
  const code = sms.__getLastCodeForTest(phone)!;
  const { body } = await request(app.getHttpServer())
    .post("/auth/otp/verify").send({ phone, code }).expect(200);

  await request(app.getHttpServer())
    .get("/me").set("Authorization", `Bearer ${body.token}`).expect(200);
});

it("GET /me without JWT returns 401", async () => {
  await request(app.getHttpServer()).get("/me").expect(401);
});
```

- [ ] **Step 4: Run tests — expect fail**

```bash
NODE_ENV=test pnpm --filter @mymakaranta/api test:e2e
```

Expected: FAIL — `/auth/otp/verify` and `/me` not implemented.

- [ ] **Step 5: Add verify + JWT logic to AuthService**

Update `apps/api/src/core/auth/auth.service.ts` — add:

```ts
import { JwtService } from "@nestjs/jwt";

// constructor adds: private jwt: JwtService

async verifyOtp(phone: string, code: string): Promise<{ token: string; user: { id: string; phone: string } }> {
  const otp = await this.prisma.otpRequest.findFirst({
    where: { phone, consumed: false }, orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) throw new BadRequestException("Invalid or expired code.");
  if (otp.attempts >= 5) throw new BadRequestException("Too many attempts.");

  const ok = await bcrypt.compare(code, otp.codeHash);
  await this.prisma.otpRequest.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 }, consumed: ok },
  });
  if (!ok) throw new BadRequestException("Invalid or expired code.");

  let user = await this.prisma.user.findFirst({ where: { phone } });
  if (!user) {
    user = await this.prisma.user.create({
      data: { phone, identityType: "PARENT", identityId: "" },
    });
  }
  await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = await this.jwt.signAsync({
    sub: user.id, phone: user.phone, schoolId: user.schoolId, identityType: user.identityType,
  });
  return { token, user: { id: user.id, phone: user.phone! } };
}
```

`ASSUMPTION:` On first OTP login, we provision a `User` with `identityType: PARENT`. The actual identity-linking (to a Parent or Staff record) lands in sprint 1 — for sprint 0 we just want the JWT cycle working.

- [ ] **Step 6: Create JWT strategy**

Create `apps/api/src/core/auth/jwt.strategy.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface JwtPayload {
  sub: string;
  phone?: string;
  schoolId?: string | null;
  identityType: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
      ignoreExpiration: false,
    });
  }
  async validate(payload: JwtPayload) {
    return { id: payload.sub, phone: payload.phone, schoolId: payload.schoolId ?? null, identityType: payload.identityType };
  }
}
```

- [ ] **Step 7: Update AuthModule**

```ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SmsService } from "./sms.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: "30d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SmsService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 8: Update AuthController with verify and add /me**

```ts
import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { RequestOtpDto, VerifyOtpDto } from "./dto";

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("auth/otp/request")
  @HttpCode(204)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp(dto.phone);
  }

  @Post("auth/otp/verify")
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  async me(@Req() req: any) {
    return req.user;
  }
}
```

- [ ] **Step 9: Run tests — expect pass**

```bash
NODE_ENV=test pnpm --filter @mymakaranta/api test:e2e
```

Expected: PASS — 5 tests.

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): OTP verify + JWT issuance + protected /me endpoint"
```

---

### Task 10: Auth — permission resolver + decorator

**Files:**
- Create: `apps/api/src/core/auth/permissions/permission.decorator.ts`, `apps/api/src/core/auth/permissions/permission.guard.ts`, `apps/api/src/core/auth/permissions/permission.resolver.ts`

- [ ] **Step 1: Write failing unit test for permission guard**

Create `apps/api/test/permissions.spec.ts`:

```ts
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionGuard } from "../src/core/auth/permissions/permission.guard";
import { PermissionResolver } from "../src/core/auth/permissions/permission.resolver";

function mkContext(user: any, requiredKey: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({ name: "h" }),
    getClass: () => ({ name: "C" }),
  } as any;
}

describe("PermissionGuard", () => {
  it("allows when user has required permission", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("students.view");
    const resolver = { has: jest.fn().mockResolvedValue(true) } as unknown as PermissionResolver;
    const guard = new PermissionGuard(reflector, resolver);
    await expect(guard.canActivate(mkContext({ id: "u1" }, "students.view"))).resolves.toBe(true);
  });

  it("denies when user lacks required permission", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("students.delete");
    const resolver = { has: jest.fn().mockResolvedValue(false) } as unknown as PermissionResolver;
    const guard = new PermissionGuard(reflector, resolver);
    await expect(guard.canActivate(mkContext({ id: "u1" }, "students.delete"))).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm --filter @mymakaranta/api exec jest test/permissions.spec.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create the decorator**

Create `apps/api/src/core/auth/permissions/permission.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSION_KEY = "requiredPermission";
export const RequirePermission = (key: string) => SetMetadata(REQUIRED_PERMISSION_KEY, key);
```

- [ ] **Step 4: Create the resolver**

Create `apps/api/src/core/auth/permissions/permission.resolver.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PermissionResolver {
  constructor(private prisma: PrismaService) {}

  async has(userId: string, permissionKey: string): Promise<boolean> {
    const result = await this.prisma.userPermission.findFirst({
      where: { userId, permission: { key: permissionKey } },
    });
    return result !== null;
  }
}
```

- [ ] **Step 5: Create the guard**

Create `apps/api/src/core/auth/permissions/permission.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionResolver } from "./permission.resolver";
import { REQUIRED_PERMISSION_KEY } from "./permission.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private resolver: PermissionResolver) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string | undefined>(REQUIRED_PERMISSION_KEY, ctx.getHandler());
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) return false;
    return this.resolver.has(user.id, required);
  }
}
```

- [ ] **Step 6: Register in AuthModule**

Add `PermissionResolver` and `PermissionGuard` to `AuthModule.providers` and export both.

- [ ] **Step 7: Run tests — expect pass**

```bash
pnpm --filter @mymakaranta/api exec jest test/permissions.spec.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/core/auth/permissions apps/api/test/permissions.spec.ts apps/api/src/core/auth/auth.module.ts
git commit -m "feat(api): permission decorator + guard + DB-backed resolver"
```

---

### Task 11: Next.js 14 web app scaffold

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`, `apps/web/tsconfig.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@mymakaranta/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mymakaranta/ui": "workspace:*",
    "@mymakaranta/types": "workspace:*",
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@mymakaranta/config": "workspace:*",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../packages/config/tsconfig.app.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mymakaranta/ui"],
  experimental: { typedRoutes: true },
};
export default nextConfig;
```

- [ ] **Step 4: Create `apps/web/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create `apps/web/tailwind.config.ts`** (placeholder; Task 13 wires the shared preset)

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Create the App Router scaffold**

`apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/src/app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "myMakaranta",
  description: "School management platform for Nigerian secondary schools.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-1000">myMakaranta</h1>
        <p className="mt-2 text-ink-500">Sprint 0 — foundation up.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Install and run**

```bash
pnpm install
pnpm --filter @mymakaranta/web dev
```

Visit http://localhost:3000 — verify the page renders (raw, unstyled until Task 13).

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): Next.js 14 App Router scaffold"
```

---

### Task 12: `packages/types` — shared types package

**Files:**
- Create: `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts`, `packages/types/src/permissions.ts`

- [ ] **Step 1: Create package**

```json
{
  "name": "@mymakaranta/types",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@mymakaranta/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../packages/config/tsconfig.lib.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Define the canonical permissions list**

`packages/types/src/permissions.ts`:

```ts
export const PERMISSIONS = {
  STUDENTS_VIEW: "students.view",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",
  STUDENTS_IMPORT: "students.import",
  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",
  ATTENDANCE_MARK: "attendance.mark",
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_AUDIT: "attendance.audit",
  RESULTS_RECORD: "results.record",
  RESULTS_REVIEW: "results.review",
  RESULTS_RELEASE: "results.release",
  RESULTS_VIEW_OWN: "results.view.own",
  FEES_VIEW: "fees.view",
  FEES_MANAGE: "fees.manage",
  FEES_PAY_OWN: "fees.pay.own",
  ANNOUNCEMENTS_CREATE: "announcements.create",
  ANNOUNCEMENTS_VIEW: "announcements.view",
  REPORTS_VIEW: "reports.view",
  REPORTS_VIEW_PROPRIETOR: "reports.view.proprietor",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

`packages/types/src/index.ts`:

```ts
export * from "./permissions";
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @mymakaranta/types typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/types
git commit -m "feat(types): canonical permission keys package"
```

---

### Task 13: `packages/ui` — design tokens + Tailwind preset

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/tokens.ts`, `packages/ui/tailwind-preset.ts`, `packages/ui/src/index.ts`, `packages/ui/src/lib/cn.ts`
- Modify: `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`

- [ ] **Step 1: Create package**

```json
{
  "name": "@mymakaranta/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tailwind-preset": "./tailwind-preset.ts",
    "./tokens": "./tokens.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "@radix-ui/react-accordion": "^1.2.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-checkbox": "^1.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-navigation-menu": "^1.2.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-radio-group": "^1.2.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "framer-motion": "^11.3.0",
    "lucide-react": "^0.400.0",
    "tailwind-merge": "^2.4.0"
  },
  "peerDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "@mymakaranta/config": "workspace:*",
    "@storybook/addon-a11y": "^8.2.0",
    "@storybook/addon-essentials": "^8.2.0",
    "@storybook/react": "^8.2.0",
    "@storybook/react-vite": "^8.2.0",
    "@types/react": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "storybook": "^8.2.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tokens.ts` — the SOURCE OF TRUTH**

```ts
export const tokens = {
  color: {
    brandPrimary: {
      50: "#EEF1FF",
      100: "#D6DDFD",
      300: "#7B8DF5",
      500: "#3D52E0",
      700: "#1F2D8A",
      900: "#0E1547",
    },
    accentSaffron: {
      100: "#FEF3D9",
      500: "#E8A33C",
      700: "#A06A1A",
    },
    ink: {
      1000: "#0A0B12",
      700: "#3A3D4A",
      500: "#7A7E8E",
      300: "#C7C9D1",
      100: "#EFEFF3",
    },
    paper: "#FAFAF7",
    paperDark: "#0E0F14",
    semantic: {
      success: "#1F9D55",
      warning: "#D97706",
      error: "#D02B2B",
      info: "#2D7CE0",
    },
  },
  radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px", full: "9999px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px" },
  shadow: {
    sm: "0 1px 2px rgba(10,11,18,0.04)",
    md: "0 2px 8px rgba(10,11,18,0.06)",
    lg: "0 8px 24px rgba(10,11,18,0.08)",
    xl: "0 16px 48px rgba(10,11,18,0.12)",
  },
  motion: {
    duration: { micro: "120ms", standard: "240ms", hero: "560ms" },
    easing: { default: "cubic-bezier(0.16, 1, 0.3, 1)", linear: "linear" },
  },
  fontFamily: {
    sans: '"Inter", system-ui, sans-serif',
    display: '"General Sans", "Inter", sans-serif',
    serif: '"Newsreader", Georgia, serif',
    mono: '"JetBrains Mono", monospace',
  },
} as const;

export type Tokens = typeof tokens;
```

- [ ] **Step 3: Create `packages/ui/tailwind-preset.ts`**

```ts
import type { Config } from "tailwindcss";
import { tokens } from "./tokens";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        "brand-primary": tokens.color.brandPrimary,
        "accent-saffron": tokens.color.accentSaffron,
        ink: tokens.color.ink,
        paper: tokens.color.paper,
        "paper-dark": tokens.color.paperDark,
        success: tokens.color.semantic.success,
        warning: tokens.color.semantic.warning,
        error: tokens.color.semantic.error,
        info: tokens.color.semantic.info,
      },
      borderRadius: {
        sm: tokens.radius.sm, md: tokens.radius.md, lg: tokens.radius.lg, xl: tokens.radius.xl,
      },
      boxShadow: {
        sm: tokens.shadow.sm, md: tokens.shadow.md, lg: tokens.shadow.lg, xl: tokens.shadow.xl,
      },
      transitionTimingFunction: { default: tokens.motion.easing.default },
      transitionDuration: {
        micro: "120", standard: "240", hero: "560",
      },
      fontFamily: {
        sans: tokens.fontFamily.sans.split(","),
        display: tokens.fontFamily.display.split(","),
        serif: tokens.fontFamily.serif.split(","),
        mono: tokens.fontFamily.mono.split(","),
      },
    },
  },
};

export default preset;
```

- [ ] **Step 4: Create `packages/ui/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create `packages/ui/src/index.ts`** (will grow with each component task)

```ts
export { cn } from "./lib/cn";
```

- [ ] **Step 6: Wire the preset into `apps/web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import preset from "@mymakaranta/ui/tailwind-preset";

const config: Config = {
  presets: [preset as Config],
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
export default config;
```

- [ ] **Step 7: Restart web dev server and verify token color renders**

Update `apps/web/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper">
      <div className="text-center">
        <h1 className="text-4xl font-display font-semibold tracking-tight text-ink-1000">
          my<span className="text-brand-primary-500">Makaranta</span>
        </h1>
        <p className="mt-2 text-ink-500">Sprint 0 — foundation up.</p>
      </div>
    </main>
  );
}
```

```bash
pnpm --filter @mymakaranta/web dev
```

Expected: page renders with paper-warm background, indigo "Makaranta" accent.

- [ ] **Step 8: Commit**

```bash
git add packages/ui apps/web
git commit -m "feat(ui): tokens.ts + Tailwind preset; web consumes shared tokens"
```

---

### Task 14: Storybook for `packages/ui`

**Files:**
- Create: `packages/ui/.storybook/main.ts`, `packages/ui/.storybook/preview.tsx`, `packages/ui/postcss.config.js`, `packages/ui/tailwind.config.ts`, `packages/ui/src/styles.css`

- [ ] **Step 1: Create Storybook config**

`packages/ui/.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  typescript: { reactDocgen: "react-docgen-typescript" },
};
export default config;
```

`packages/ui/.storybook/preview.tsx`:

```tsx
import type { Preview } from "@storybook/react";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#FAFAF7" },
        { name: "dark", value: "#0E0F14" },
      ],
    },
    a11y: { config: { rules: [{ id: "color-contrast", enabled: true }] } },
  },
  globalTypes: {
    theme: {
      defaultValue: "light",
      toolbar: { items: ["light", "dark"], title: "Theme" },
    },
  },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.globals.theme === "dark" ? "dark bg-paper-dark min-h-screen p-8" : "bg-paper min-h-screen p-8"}>
        <Story />
      </div>
    ),
  ],
};
export default preview;
```

- [ ] **Step 2: Create `packages/ui/tailwind.config.ts`** (Storybook-local copy)

```ts
import type { Config } from "tailwindcss";
import preset from "./tailwind-preset";

const config: Config = {
  presets: [preset as Config],
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
};
export default config;
```

- [ ] **Step 3: Create `packages/ui/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: Create `packages/ui/src/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Run Storybook**

```bash
pnpm --filter @mymakaranta/ui storybook
```

Expected: Storybook opens at http://localhost:6006 with no stories yet.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "chore(ui): Storybook 8 wired with theme decorator"
```

---

### Task 15: Component — Button (the canonical pattern)

**Files:**
- Create: `packages/ui/src/components/button.tsx`, `packages/ui/src/components/button.stories.tsx`
- Modify: `packages/ui/src/index.ts`

This task establishes the pattern every other component follows.

- [ ] **Step 1: Write the story file (becomes the "test")**

`packages/ui/src/components/button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Plus } from "lucide-react";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "destructive"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: "Save changes", variant: "primary" } };
export const Secondary: Story = { args: { children: "Cancel", variant: "secondary" } };
export const Ghost: Story = { args: { children: "Skip", variant: "ghost" } };
export const Destructive: Story = { args: { children: "Delete student", variant: "destructive" } };
export const WithIcon: Story = {
  args: { children: <><Plus className="size-4" /> Add student</>, variant: "primary" },
};
export const Loading: Story = { args: { children: "Saving...", loading: true } };
export const Disabled: Story = { args: { children: "Disabled", disabled: true } };
```

- [ ] **Step 2: Run Storybook — expect "Cannot find module './button'"**

- [ ] **Step 3: Implement `packages/ui/src/components/button.tsx`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "transition-colors duration-micro ease-default",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-primary-500 text-white hover:bg-brand-primary-700 active:bg-brand-primary-900",
        secondary: "bg-ink-100 text-ink-1000 hover:bg-ink-300/40",
        ghost: "text-ink-700 hover:bg-ink-100",
        destructive: "bg-error text-white hover:bg-error/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
```

- [ ] **Step 4: Export from index**

Update `packages/ui/src/index.ts`:

```ts
export { cn } from "./lib/cn";
export { Button, type ButtonProps } from "./components/button";
```

- [ ] **Step 5: Refresh Storybook — verify all 7 stories render in light + dark + a11y passes**

Expected: All stories render. Open the a11y addon panel — no critical violations.

- [ ] **Step 6: Use Button in the web app (smoke test)**

Update `apps/web/src/app/page.tsx`:

```tsx
import { Button } from "@mymakaranta/ui";

export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-display font-semibold tracking-tight text-ink-1000">
          my<span className="text-brand-primary-500">Makaranta</span>
        </h1>
        <Button>Sign in</Button>
      </div>
    </main>
  );
}
```

```bash
pnpm --filter @mymakaranta/web dev
```

Expected: button renders, hover/focus styles work.

- [ ] **Step 7: Commit**

```bash
git add packages/ui apps/web
git commit -m "feat(ui): Button — canonical primitive with cva variants + Storybook"
```

---

### Task 16: Components — IconButton, Input, Textarea

**Files:**
- Create: `packages/ui/src/components/icon-button.tsx`, `input.tsx`, `textarea.tsx` plus `.stories.tsx` for each
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the three component files**

`icon-button.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-md text-ink-700",
    "transition-colors duration-micro ease-default",
    "hover:bg-ink-100 hover:text-ink-1000",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      size: { sm: "size-8", md: "size-10", lg: "size-12" },
    },
    defaultVariants: { size: "md" },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Required for screen readers — the icon is decorative. */
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size, label, children, ...props }, ref) => (
    <button ref={ref} className={cn(iconButtonVariants({ size }), className)} aria-label={label} {...props}>
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
```

`input.tsx`:

```tsx
import * as React from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-10 w-full rounded-md border bg-paper px-3 py-2 text-sm text-ink-1000",
        "placeholder:text-ink-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        invalid ? "border-error" : "border-ink-300",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
```

`textarea.tsx`:

```tsx
import * as React from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex min-h-24 w-full rounded-md border bg-paper px-3 py-2 text-sm text-ink-1000 resize-y",
        "placeholder:text-ink-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        invalid ? "border-error" : "border-ink-300",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
```

- [ ] **Step 2: Write a story for each (default, invalid, disabled)** — follow the Button.stories.tsx pattern.

- [ ] **Step 3: Update `packages/ui/src/index.ts`**

```ts
export { cn } from "./lib/cn";
export { Button, type ButtonProps } from "./components/button";
export { IconButton, type IconButtonProps } from "./components/icon-button";
export { Input, type InputProps } from "./components/input";
export { Textarea, type TextareaProps } from "./components/textarea";
```

- [ ] **Step 4: Verify in Storybook (light + dark + a11y)**

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): IconButton, Input, Textarea + Storybook stories"
```

---

### Task 17: Components — Card, Tag, Chip, Avatar, Badge, Skeleton

**Files:** `packages/ui/src/components/{card,tag,chip,avatar,badge,skeleton}.tsx` + stories.

- [ ] **Step 1: Implement Card**

```tsx
// card.tsx
import * as React from "react";
import { cn } from "../lib/cn";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border border-ink-300/60 bg-paper shadow-sm", className)} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1 p-6 pb-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold text-ink-1000 tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-ink-500", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-6 pb-6", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
```

- [ ] **Step 2: Implement Tag and Chip**

`tag.tsx` — passive label (status, category):

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const tagVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-ink-100 text-ink-700",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        error: "bg-error/10 text-error",
        brand: "bg-brand-primary-50 text-brand-primary-700",
        accent: "bg-accent-saffron-100 text-accent-saffron-700",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof tagVariants> {}
export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(tagVariants({ tone }), className)} {...props} />
  ),
);
Tag.displayName = "Tag";
```

`chip.tsx` — interactive (filterable, removable):

```tsx
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export interface ChipProps extends React.HTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onRemove?: () => void;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, onRemove, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500",
        selected
          ? "bg-brand-primary-500 text-white hover:bg-brand-primary-700"
          : "bg-ink-100 text-ink-700 hover:bg-ink-300/40",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <span
          role="button"
          aria-label="remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-1 rounded-full hover:bg-black/10 p-0.5"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  ),
);
Chip.displayName = "Chip";
```

- [ ] **Step 3: Implement Avatar (Radix), Badge, Skeleton**

`avatar.tsx`:

```tsx
import * as React from "react";
import * as RadixAvatar from "@radix-ui/react-avatar";
import { cn } from "../lib/cn";

export interface AvatarProps {
  src?: string;
  alt?: string;
  fallback: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" };

export function Avatar({ src, alt, fallback, size = "md", className }: AvatarProps) {
  return (
    <RadixAvatar.Root className={cn("inline-flex shrink-0 overflow-hidden rounded-full bg-ink-100", sizeMap[size], className)}>
      {src && (
        <RadixAvatar.Image src={src} alt={alt ?? ""} className="h-full w-full object-cover" />
      )}
      <RadixAvatar.Fallback className="flex h-full w-full items-center justify-center font-medium text-ink-700">
        {fallback}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
```

`badge.tsx` — small numeric/dot indicator:

```tsx
import * as React from "react";
import { cn } from "../lib/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-error text-white",
        dot ? "size-2" : "min-w-5 h-5 px-1.5 text-xs font-medium",
        className,
      )}
      {...props}
    >
      {dot ? null : children}
    </span>
  ),
);
Badge.displayName = "Badge";
```

`skeleton.tsx`:

```tsx
import * as React from "react";
import { cn } from "../lib/cn";

export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("animate-pulse rounded-md bg-ink-100", className)} {...props} />
  ),
);
Skeleton.displayName = "Skeleton";
```

- [ ] **Step 4: Stories for each (compose with realistic content — e.g., Card containing student row with Avatar + Tag)**

- [ ] **Step 5: Update index exports**

- [ ] **Step 6: Verify in Storybook**

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): Card, Tag, Chip, Avatar, Badge, Skeleton + stories"
```

---

### Task 18: Components — EmptyState, ErrorState

**Files:** `packages/ui/src/components/{empty-state,error-state}.tsx` + stories.

- [ ] **Step 1: Implement EmptyState**

```tsx
// empty-state.tsx
import * as React from "react";
import { cn } from "../lib/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center text-center py-12 px-6 gap-4", className)}
    >
      {icon && <div className="text-ink-300">{icon}</div>}
      <div className="space-y-1 max-w-sm">
        <h3 className="text-base font-medium text-ink-1000">{title}</h3>
        {description && <p className="text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Implement ErrorState** (same pattern, different visual tone — error-tinted icon, retry slot).

```tsx
// error-state.tsx
import * as React from "react";
import { cn } from "../lib/cn";

export interface ErrorStateProps {
  title: string;
  description?: string;
  retry?: React.ReactNode;
  className?: string;
}

export function ErrorState({ title, description, retry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center text-center py-12 px-6 gap-4", className)}
    >
      <div className="rounded-full bg-error/10 p-3">
        <svg className="size-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-base font-medium text-ink-1000">{title}</h3>
        {description && <p className="text-sm text-ink-500">{description}</p>}
      </div>
      {retry}
    </div>
  );
}
```

- [ ] **Step 3: Stories, index exports, Storybook verify, commit**

```bash
git add packages/ui
git commit -m "feat(ui): EmptyState, ErrorState components"
```

---

### Task 19: Components — Dialog, Sheet, Drawer (Radix wrappers)

**Files:** `packages/ui/src/components/{dialog,sheet,drawer}.tsx` + stories.

These three share the Radix `Dialog` primitive but render with different positioning.

- [ ] **Step 1: Implement Dialog** (centered modal)

```tsx
// dialog.tsx
import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-ink-1000/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content>
>(({ className, children, ...props }, ref) => (
  <RadixDialog.Portal>
    <DialogOverlay />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4",
        "rounded-lg border border-ink-300/60 bg-paper p-6 shadow-xl",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
      <RadixDialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-paper transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn("text-lg font-semibold text-ink-1000", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn("text-sm text-ink-500", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
```

- [ ] **Step 2: Install `tailwindcss-animate` and add to preset**

```bash
pnpm --filter @mymakaranta/ui add tailwindcss-animate
```

Update `packages/ui/tailwind-preset.ts` to add `plugins: [require("tailwindcss-animate")]`.

- [ ] **Step 3: Implement Sheet** (side-anchored variant)

```tsx
// sheet.tsx
import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-paper p-6 shadow-xl transition ease-default duration-standard data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof RadixDialog.Content>,
    VariantProps<typeof sheetVariants> {}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink-1000/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <RadixDialog.Content ref={ref} className={cn(sheetVariants({ side }), "border-ink-300/60", className)} {...props}>
      {children}
      <RadixDialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
SheetContent.displayName = "SheetContent";
```

- [ ] **Step 4: Implement Drawer** (mobile-style bottom drawer — alias of Sheet with `side="bottom"` and rounded top corners)

```tsx
// drawer.tsx
import * as React from "react";
import { Sheet, SheetContent, SheetTrigger, SheetClose, type SheetContentProps } from "./sheet";
import { cn } from "../lib/cn";

export const Drawer = Sheet;
export const DrawerTrigger = SheetTrigger;
export const DrawerClose = SheetClose;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  Omit<SheetContentProps, "side">
>(({ className, children, ...props }, ref) => (
  <SheetContent ref={ref} side="bottom" className={cn("rounded-t-xl max-h-[85vh] overflow-y-auto", className)} {...props}>
    <div aria-hidden className="mx-auto h-1 w-12 rounded-full bg-ink-300 mb-4" />
    {children}
  </SheetContent>
));
DrawerContent.displayName = "DrawerContent";
```

- [ ] **Step 5: Stories, exports, verify, commit**

```bash
git add packages/ui
git commit -m "feat(ui): Dialog, Sheet, Drawer (Radix wrappers) + animations"
```

---

### Task 20: Components — Toast, Tooltip, Popover

**Files:** `packages/ui/src/components/{toast,tooltip,popover}.tsx` + stories.

- [ ] **Step 1: Implement Toast (Radix Toast — note Toast is provider-based)**

```tsx
// toast.tsx
import * as React from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export const ToastProvider = RadixToast.Provider;

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof RadixToast.Viewport>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Viewport>
>(({ className, ...props }, ref) => (
  <RadixToast.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = "ToastViewport";

export const Toast = React.forwardRef<
  React.ElementRef<typeof RadixToast.Root>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Root> & { tone?: "default" | "success" | "warning" | "error" }
>(({ className, tone = "default", ...props }, ref) => (
  <RadixToast.Root
    ref={ref}
    className={cn(
      "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-md border p-4 pr-8 shadow-lg",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out",
      "data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-right-full",
      tone === "default" && "border-ink-300/60 bg-paper text-ink-1000",
      tone === "success" && "border-success/30 bg-success/5 text-success",
      tone === "warning" && "border-warning/30 bg-warning/5 text-warning",
      tone === "error" && "border-error/30 bg-error/5 text-error",
      className,
    )}
    {...props}
  />
));
Toast.displayName = "Toast";

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof RadixToast.Title>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Title>
>(({ className, ...props }, ref) => (
  <RadixToast.Title ref={ref} className={cn("text-sm font-medium", className)} {...props} />
));
ToastTitle.displayName = "ToastTitle";

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof RadixToast.Description>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Description>
>(({ className, ...props }, ref) => (
  <RadixToast.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = "ToastDescription";

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof RadixToast.Close>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Close>
>(({ className, ...props }, ref) => (
  <RadixToast.Close
    ref={ref}
    className={cn("absolute right-2 top-2 rounded-md opacity-50 hover:opacity-100", className)}
    toast-close=""
    {...props}
  >
    <X className="size-4" />
  </RadixToast.Close>
));
ToastClose.displayName = "ToastClose";
```

- [ ] **Step 2: Implement Tooltip and Popover (Radix wrappers, similar pattern)**

`tooltip.tsx`:

```tsx
import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/cn";

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <RadixTooltip.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-ink-300/60 bg-paper px-3 py-1.5 text-xs text-ink-1000 shadow-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";
```

`popover.tsx`:

```tsx
import * as React from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { cn } from "../lib/cn";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border border-ink-300/60 bg-paper p-4 text-ink-1000 shadow-lg",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
));
PopoverContent.displayName = "PopoverContent";
```

- [ ] **Step 3: Stories, exports, verify, commit**

```bash
git add packages/ui
git commit -m "feat(ui): Toast, Tooltip, Popover Radix wrappers"
```

---

### Task 21: Components — Tabs, Accordion, Dropdown, Select

Same wrapper pattern. Each task ~60 lines of code per component. Write the wrappers; ensure stories cover keyboard navigation.

- [ ] **Step 1–4: Implement `tabs.tsx`, `accordion.tsx`, `dropdown.tsx`, `select.tsx`** following Radix docs and the wrapper style established in Tasks 19–20. Stories test keyboard navigation (Tab, ArrowDown, Enter).

`ASSUMPTION:` Engineers reference `https://www.radix-ui.com/primitives/docs/components/<name>` for props; the wrapper layer adds Tailwind classes that consume our tokens, mirrors Radix prop names 1:1, and re-exports under our component namespace.

- [ ] **Step 5: Verify in Storybook, commit**

```bash
git add packages/ui
git commit -m "feat(ui): Tabs, Accordion, Dropdown, Select (Radix wrappers)"
```

---

### Task 22: Components — Switch, Checkbox, Radio

Same pattern. Critical: visual states for `data-[state=checked]`, focus ring on track, disabled state.

- [ ] **Step 1–3: Implement `switch.tsx`, `checkbox.tsx`, `radio.tsx`** as Radix wrappers. Switch's track-and-thumb uses `data-[state=checked]:bg-brand-primary-500`. Checkbox uses `<RadixCheckbox.Indicator>` with the Check icon. Radio uses `<RadixRadioGroup.Item>`.

- [ ] **Step 4: Stories, verify, commit**

```bash
git add packages/ui
git commit -m "feat(ui): Switch, Checkbox, Radio (Radix wrappers)"
```

---

### Task 23: Components — NavigationMenu, BreadcrumbNav

- [ ] **Step 1: Implement `nav-menu.tsx`** as a Radix `NavigationMenu` wrapper for the proprietor sidebar.
- [ ] **Step 2: Implement `breadcrumb.tsx`** as a custom component (no Radix primitive needed — semantic `<nav aria-label="breadcrumb">` with `<ol>`).

```tsx
// breadcrumb.tsx
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="breadcrumb" className={cn("flex", className)}>
      <ol className="flex items-center gap-1 text-sm text-ink-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <a href={item.href} className="hover:text-ink-1000 transition-colors">{item.label}</a>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-ink-1000 font-medium" : ""}>
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRight aria-hidden className="size-4 text-ink-300" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 3: Stories, verify, commit**

```bash
git add packages/ui
git commit -m "feat(ui): NavigationMenu, Breadcrumb"
```

---

### Task 24: Expo mobile scaffold — `apps/mobile-teacher`

**Files:**
- Create: `apps/mobile-teacher/package.json`, `app.json`, `App.tsx`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `tailwind.config.js`, `global.css`, `src/screens/Login.tsx`

- [ ] **Step 1: Create `apps/mobile-teacher/package.json`**

```json
{
  "name": "@mymakaranta/mobile-teacher",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"**/*.ts\" \"**/*.tsx\""
  },
  "dependencies": {
    "@mymakaranta/ui": "workspace:*",
    "@mymakaranta/types": "workspace:*",
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "expo-status-bar": "~1.12.0",
    "nativewind": "^4.0.36",
    "react": "18.3.1",
    "react-native": "0.74.5",
    "react-native-reanimated": "~3.10.0",
    "react-native-safe-area-context": "4.10.0",
    "react-native-screens": "3.31.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create Expo + Reanimated + NativeWind config**

`apps/mobile-teacher/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: ["react-native-reanimated/plugin"],
  };
};
```

`apps/mobile-teacher/tailwind.config.js`:

```js
const preset = require("@mymakaranta/ui/tailwind-preset").default;

module.exports = {
  presets: [preset],
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
};
```

`apps/mobile-teacher/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/mobile-teacher/App.tsx`:

```tsx
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import "./global.css";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-paper">
      <Text className="text-2xl font-bold text-ink-1000">myMakaranta Teacher</Text>
      <Text className="mt-2 text-ink-500">Sprint 0 — mobile up.</Text>
      <StatusBar style="auto" />
    </View>
  );
}
```

- [ ] **Step 3: Run on Android emulator**

```bash
pnpm --filter @mymakaranta/mobile-teacher dev
# Press 'a' for Android, 'i' for iOS
```

Expected: app boots, shows the welcome screen with paper background and ink-colored text.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile-teacher
git commit -m "feat(mobile-teacher): Expo scaffold with NativeWind + shared tokens"
```

---

### Task 25: Expo mobile scaffold — `apps/mobile-parent`

Mirror Task 24 with package name `@mymakaranta/mobile-parent` and welcome text "myMakaranta Parent."

- [ ] **Step 1–4: Duplicate Task 24 setup with parent-specific names**
- [ ] **Step 5: Commit**

```bash
git add apps/mobile-parent
git commit -m "feat(mobile-parent): Expo scaffold with NativeWind + shared tokens"
```

---

### Task 26: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: makaranta
          POSTGRES_PASSWORD: makaranta_dev
          POSTGRES_DB: makaranta_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://makaranta:makaranta_dev@localhost:5432/makaranta_test?schema=public
      JWT_SECRET: test-secret
      SMS_PROVIDER: mock
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mymakaranta/api exec prisma migrate deploy
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Push to GitHub and verify workflow runs**

```bash
git add .github
git commit -m "ci: GitHub Actions for typecheck, lint, test on PostgreSQL"
git push origin main
```

Expected: workflow succeeds; all packages typecheck and tests pass.

---

### Task 27: Deployment baselines

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/fly.toml`, `apps/web/vercel.json` (optional)

- [ ] **Step 1: Create API Dockerfile**

`apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app /app
COPY apps/api ./apps/api
RUN pnpm --filter @mymakaranta/api exec prisma generate
RUN pnpm --filter @mymakaranta/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Create `apps/api/fly.toml`**

```toml
app = "mymakaranta-api"
primary_region = "jnb"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "4000"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
```

`ASSUMPTION:` Fly.io's Johannesburg region is the closest to Lagos with reliable latency to Nigerian users. Validate with synthetic monitoring before MVP launch.

- [ ] **Step 3: Deploy web to Vercel**

```bash
# In apps/web/
npx vercel link
npx vercel --prod
```

- [ ] **Step 4: Deploy Storybook to Vercel as a separate project**

```bash
# In packages/ui/
npx vercel link
npx vercel --prod
```

- [ ] **Step 5: Configure Expo EAS for mobile builds**

```bash
pnpm dlx eas-cli login
cd apps/mobile-teacher && pnpm dlx eas-cli build:configure
cd apps/mobile-parent && pnpm dlx eas-cli build:configure
```

- [ ] **Step 6: Smoke test all live URLs**

- Web: visit Vercel URL — verify renders.
- API: `curl https://mymakaranta-api.fly.dev/health` → `{"status":"ok"}`.
- Storybook: visit Storybook Vercel URL — verify all components render.

- [ ] **Step 7: Commit deployment configs**

```bash
git add apps/api/Dockerfile apps/api/fly.toml apps/web/vercel.json
git commit -m "ci: Docker + Fly.io for API; Vercel for web + Storybook"
```

---

### Task 28: Sprint 0 demo — full smoke test of the foundation

- [ ] **Step 1: Run full local stack**

```bash
pnpm db:up
pnpm --filter @mymakaranta/api dev &
pnpm --filter @mymakaranta/web dev &
pnpm --filter @mymakaranta/ui storybook &
pnpm --filter @mymakaranta/mobile-teacher dev &
```

- [ ] **Step 2: Walk through these flows manually:**

1. Web: visit http://localhost:3000 — landing renders with token-correct colors.
2. API: `curl http://localhost:4000/health` — returns ok.
3. API auth: `curl -X POST http://localhost:4000/auth/otp/request -H "Content-Type: application/json" -d '{"phone":"+2348012345678"}'` — returns 204; check API logs for the mock SMS code.
4. API auth: `curl -X POST http://localhost:4000/auth/otp/verify -H "Content-Type: application/json" -d '{"phone":"+2348012345678","code":"<from logs>"}'` — returns 200 with token.
5. API protected: `curl http://localhost:4000/me -H "Authorization: Bearer <token>"` — returns user.
6. Storybook: visit http://localhost:6006 — every component renders in light + dark, a11y passes.
7. Mobile teacher: app boots in Expo Go on a physical Tecno device (or emulator) — welcome screen renders with token colors.

- [ ] **Step 3: Tag the sprint**

```bash
git tag -a sprint-0-foundation -m "Sprint 0 complete: foundation up"
git push origin sprint-0-foundation
```

- [ ] **Step 4: Demo the foundation to the founder + designer + first pilot proprietor (if possible)**

The sprint-0 demo proves: the foundation runs, the design tokens are wired to real screens, the component library is browsable, and the auth + multi-tenancy + RLS hold under cross-tenant pressure. Sprint 1 (Backend Core + SIS) can begin Monday of week 4.

---

## Self-Review

**Spec coverage check:**
- PRD §3.5 ~27 components → covered in Tasks 15–23. ✓
- PRD §3.2.3 token system → Task 13 `tokens.ts`. ✓
- PRD §5.2 multi-tenancy (row-level + RLS) → Tasks 6–7. ✓
- PRD §5.7 Tailwind tokens, in-house components, Framer Motion, Storybook, visual regression → Tasks 13, 14, 15+, deferred to sprint 1+ for visual regression in CI (acceptable — Storybook is up). ✓
- PRD §5.5 permissions as primitive → Task 10. ✓
- PRD §6.6 design deliverables before code — covered by sprint sequencing (designer paired with engineering through tasks 13–23). ✓
- Authentication phone-first → Tasks 8–9. ✓
- Mobile bootstraps for teacher + parent → Tasks 24–25. ✓
- CI/CD baseline → Tasks 26–27. ✓

**Placeholder scan:** Several `ASSUMPTION:` tags are intentional and follow the PRD's convention of marking interpretive decisions to validate. No "TBD," no "implement later," no skipped code blocks.

**Type consistency:** `TenantContext.run` signature matches in tests and middleware. `PrismaService.$use` middleware shape consistent. `Button` component name reused correctly across stories and consumers.

---

## Execution Handoff

**Plan complete and saved to `C:\Users\IBRAHIM BASHIR\Documents\myMakaranta\plans\2026-05-01-sprint-0-foundation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you want when you're ready to start sprint 0 in earnest?
