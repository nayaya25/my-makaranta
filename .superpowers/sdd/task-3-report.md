# Task 3 Report — Password service (argon2 + policy)

**Status:** COMPLETE

**Files created:**
- `apps/api/src/core/auth/password.service.ts`
- `apps/api/src/core/auth/password.service.spec.ts`

**Dependency change:** `argon2 ^0.44.0` added to `apps/api/package.json`; `argon2` added to `pnpm.onlyBuiltDependencies` in root `package.json` so native module builds.

**Test result:** PASS — 2 tests in 5.4s (`hashes and verifies`, `enforces policy`).

**pnpm audit:** Pre-existing high advisories in `bcrypt>@mapbox/node-pre-gyp>tar`, `storybook`, `next`, `multer`, `jest>js-yaml`, `exceljs>uuid`. Zero advisories introduced by `argon2`.
