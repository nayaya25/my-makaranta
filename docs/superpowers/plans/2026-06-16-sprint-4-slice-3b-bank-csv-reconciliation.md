# Bank-CSV Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bursar uploads a bank-statement CSV; the system proposes ranked outstanding-invoice matches per deposit row; the bursar reviews/overrides and confirms; confirmed rows record `BANK_TRANSFER` payments. Stateless — no new model.

**Architecture:** A pure `reconcile.util` matcher (fuzzy name + amount) + a `reconciliation.service` in the fees module (`proposeMatches` read-only, `confirmMatches` reusing slice-2 `recordOfflinePayment`) + a controller. Web adds an upload→review→confirm flow on `/fees`. No migration.

**Tech Stack:** NestJS 11 / Prisma 5; Next.js 15 / React 19 (papaparse); Jest e2e + jest unit + vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-sprint-4-slice-3b-bank-csv-reconciliation-design.md`

**Branch:** `sprint-4-csv-recon` (already created).

**KEY CONVENTIONS:** explicit `schoolId` scoping; e2e service-level inside `TenantContext.run` (model on `assessment.e2e-spec.ts`); money kobo Int; `noUncheckedIndexedAccess`. `fees.manage` perm. Reuse `PaymentsService.recordOfflinePayment({invoiceId, amountKobo, channel, reference}, actor)` (channel `BANK_TRANSFER`; dup `reference` → `ConflictException`). `PaymentsModule` exports `PaymentsService`.

---

## File Structure
- Create: `apps/api/src/modules/fees/reconcile.util.ts` + `reconcile.util.spec.ts`, `reconciliation.service.ts`, `reconciliation.controller.ts`, `dto/reconcile.dto.ts`
- Modify: `apps/api/src/modules/fees/fees.module.ts` (import PaymentsModule; register service+controller), create `test/reconciliation.e2e-spec.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx` (reconcile section)

---

## Task 1: Pure matcher + unit test

**Files:** Create `reconcile.util.ts` + `reconcile.util.spec.ts`

- [ ] **Step 1: Failing test** — `apps/api/src/modules/fees/reconcile.util.spec.ts`:
```ts
import { matchRow, scoreCandidate } from "./reconcile.util";

const cands = [
  { invoiceId: "i-ada", studentName: "Ada Eze", admissionNo: "ADM1", balanceKobo: 6000000 },
  { invoiceId: "i-bola", studentName: "Bola Ade", admissionNo: "ADM2", balanceKobo: 5000000 },
];

describe("scoreCandidate", () => {
  it("full-name overlap → high", () => {
    expect(scoreCandidate("transfer from Ada Eze", 6000000, cands[0]!).confidence).toBe("high");
  });
  it("admissionNo substring → high", () => {
    expect(scoreCandidate("deposit ADM1 fees", 100, cands[0]!).confidence).toBe("high");
  });
  it("single weak token → low", () => {
    expect(scoreCandidate("ada", 100, cands[0]!).confidence).toBe("low");
  });
  it("no name overlap → none", () => {
    expect(scoreCandidate("random gibberish xyz", 6000000, cands[0]!).confidence).toBe("none");
  });
  it("exact amount boosts score over a partial", () => {
    const exact = scoreCandidate("Ada Eze", 6000000, cands[0]!).score;
    const partial = scoreCandidate("Ada Eze", 100, cands[0]!).score;
    expect(exact).toBeGreaterThan(partial);
  });
});

describe("matchRow", () => {
  it("suggests the best candidate and ranks by score", () => {
    const r = matchRow({ narration: "payment from Bola Ade", amountKobo: 5000000 }, cands);
    expect(r.suggestedInvoiceId).toBe("i-bola");
    expect(r.candidates[0]!.invoiceId).toBe("i-bola");
  });
  it("suggests null when no candidate has a name match", () => {
    const r = matchRow({ narration: "unknown deposit 999", amountKobo: 5000000 }, cands);
    expect(r.suggestedInvoiceId).toBeNull();
  });
  it("returns no suggestion for empty candidates", () => {
    expect(matchRow({ narration: "Ada Eze", amountKobo: 1 }, []).suggestedInvoiceId).toBeNull();
  });
});
```

- [ ] **Step 2:** `cd apps/api && pnpm exec jest reconcile.util` → FAIL.

- [ ] **Step 3: Implement `reconcile.util.ts`:**
```ts
export interface MatchCandidate { invoiceId: string; studentName: string; admissionNo: string; balanceKobo: number; }
export type Confidence = "high" | "low" | "none";
export interface ScoredCandidate extends MatchCandidate { score: number; confidence: Confidence; }

export function normalizeTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

export function scoreCandidate(narration: string, amountKobo: number, c: MatchCandidate): { score: number; confidence: Confidence } {
  const narrTokens = new Set(normalizeTokens(narration));
  const nameTokens = normalizeTokens(c.studentName);
  const overlap = nameTokens.filter((t) => narrTokens.has(t)).length;
  const admHit = c.admissionNo.length > 0 && narration.toLowerCase().includes(c.admissionNo.toLowerCase()) ? 1 : 0;

  let score = overlap * 10 + admHit * 50;
  if (amountKobo === c.balanceKobo) score += 8;
  else if (amountKobo > 0 && amountKobo <= c.balanceKobo) score += 3;

  let confidence: Confidence = "none";
  if (admHit === 1 || overlap >= 2) confidence = "high";
  else if (overlap === 1) confidence = "low";
  return { score, confidence };
}

export function matchRow(
  row: { narration: string; amountKobo: number },
  candidates: MatchCandidate[],
): { candidates: ScoredCandidate[]; suggestedInvoiceId: string | null } {
  const scored: ScoredCandidate[] = candidates
    .map((c) => ({ ...c, ...scoreCandidate(row.narration, row.amountKobo, c) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const suggestedInvoiceId = top && top.confidence !== "none" ? top.invoiceId : null;
  return { candidates: scored.slice(0, 5), suggestedInvoiceId };
}
```

- [ ] **Step 4:** `pnpm exec jest reconcile.util` → PASS (8). typecheck clean.

- [ ] **Step 5: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees/reconcile.util.ts apps/api/src/modules/fees/reconcile.util.spec.ts
git commit -m "feat(fees): bank-row fuzzy matcher (name + amount, ranked)"
```

---

## Task 2: reconciliation service + controller + e2e

**Files:** Create `reconciliation.service.ts`, `reconciliation.controller.ts`, `dto/reconcile.dto.ts`; modify `fees.module.ts`, create `test/reconciliation.e2e-spec.ts`

- [ ] **Step 1: DTOs** — `dto/reconcile.dto.ts`:
```ts
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BankRowDto {
  @IsString() @IsNotEmpty() reference!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsString() narration!: string;
  @IsOptional() @IsString() date?: string;
}
export class ProposeMatchesDto {
  @IsString() @IsNotEmpty() termId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BankRowDto) rows!: BankRowDto[];
}
export class ConfirmationDto {
  @IsString() @IsNotEmpty() reference!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsString() @IsNotEmpty() invoiceId!: string;
}
export class ConfirmMatchesDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ConfirmationDto) confirmations!: ConfirmationDto[];
}
```

- [ ] **Step 2: Failing e2e** — `test/reconciliation.e2e-spec.ts` (service-level; two-school bootstrap from `assessment.e2e-spec.ts`). Seed a term + 2 outstanding invoices for students "Ada Eze" (ADM-A) and "Bola Ade" (ADM-B). Get `ReconciliationService` via `moduleRef.get`. Tests:
```ts
  describe("reconciliation", () => {
    let termId: string; let adaInv: string; let bolaInv: string;
    const actor = { id: "bursar-1", phone: "+2348093000001", schoolId, identityType: "PROPRIETOR" };

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: "RecYr", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      termId = term.id;
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `RJSS1-${suffix}`, order: 1 } });
      const ada = await prisma.student.create({ data: { schoolId, admissionNo: `ADM-A-${suffix}`, firstName: "Ada", lastName: "Eze", gender: "FEMALE", dateOfBirth: new Date("2010-01-01") } });
      const bola = await prisma.student.create({ data: { schoolId, admissionNo: `ADM-B-${suffix}`, firstName: "Bola", lastName: "Ade", gender: "MALE", dateOfBirth: new Date("2010-01-01") } });
      adaInv = (await prisma.invoice.create({ data: { schoolId, studentId: ada.id, termId: term.id, classLevelId: lvl.id, totalKobo: 6000000, paidKobo: 0 } })).id;
      bolaInv = (await prisma.invoice.create({ data: { schoolId, studentId: bola.id, termId: term.id, classLevelId: lvl.id, totalKobo: 5000000, paidKobo: 0 } })).id;
    });

    it("proposes ranked matches; correct top suggestion + confidence", async () => {
      const res = await asA(() => recon.proposeMatches(termId, [
        { reference: "TXN1", amountKobo: 6000000, narration: "TRF FROM ADA EZE" },
        { reference: "TXN2", amountKobo: 2000000, narration: "school fees bola ade" },
        { reference: "TXN3", amountKobo: 1000000, narration: "anonymous deposit 0000" },
      ]));
      expect(res[0]!.suggestedInvoiceId).toBe(adaInv);
      expect(res[0]!.candidates[0]!.confidence).toBe("high");
      expect(res[1]!.suggestedInvoiceId).toBe(bolaInv);
      expect(res[2]!.suggestedInvoiceId).toBeNull();
    });

    it("confirms matches → records BANK_TRANSFER payments + applies", async () => {
      const r = await asA(() => recon.confirmMatches([
        { reference: "TXN1", amountKobo: 6000000, invoiceId: adaInv },
        { reference: "TXN2", amountKobo: 2000000, invoiceId: bolaInv },
      ], actor));
      expect(r.recorded).toBe(2);
      expect(r.skipped).toBe(0);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: adaInv } })).paidKobo).toBe(6000000);
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: bolaInv } })).paidKobo).toBe(2000000);
      const pay = await prisma.payment.findFirst({ where: { schoolId, reference: "TXN1" } });
      expect(pay!.channel).toBe("BANK_TRANSFER");
    });

    it("skips a duplicate reference on re-confirm (idempotent)", async () => {
      const r = await asA(() => recon.confirmMatches([{ reference: "TXN1", amountKobo: 6000000, invoiceId: adaInv }], actor));
      expect(r.skipped).toBe(1);
      expect(r.recorded).toBe(0);
    });

    it("does not apply a cross-tenant invoice", async () => {
      const r = await asB(() => recon.confirmMatches([{ reference: "TXNX", amountKobo: 1000, invoiceId: adaInv }], { ...actor, schoolId: schoolBId }));
      expect(r.recorded).toBe(0);
      expect(r.errors.length).toBe(1);
      // Ada's invoice unchanged from the earlier confirm
      expect((await prisma.invoice.findFirstOrThrow({ where: { schoolId, id: adaInv } })).paidKobo).toBe(6000000);
    });

    it("rejects propose for a foreign term", async () => {
      await expect(asB(() => recon.proposeMatches(termId, [{ reference: "X", amountKobo: 1, narration: "x" }]))).rejects.toThrow(NotFoundException);
    });
  });
```
Add `recon` (ReconciliationService) handle; import it + `NotFoundException`; use the real school-B id var.

- [ ] **Step 3:** Run e2e → FAIL (service missing).

- [ ] **Step 4: Implement `reconciliation.service.ts`:**
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PaymentsService } from "../payments/payments.service";
import { matchRow, type MatchCandidate } from "./reconcile.util";
import type { RequestUser } from "../../core/auth/current-user.decorator";

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async proposeMatches(termId: string, rows: { reference: string; amountKobo: number; narration: string; date?: string }[]) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, termId },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
    });
    const candidates: MatchCandidate[] = invoices
      .filter((i) => i.totalKobo - i.paidKobo > 0)
      .map((i) => ({ invoiceId: i.id, studentName: `${i.student.firstName} ${i.student.lastName}`, admissionNo: i.student.admissionNo, balanceKobo: i.totalKobo - i.paidKobo }));
    return rows.map((row) => {
      const m = matchRow({ narration: row.narration, amountKobo: row.amountKobo }, candidates);
      return { row, candidates: m.candidates, suggestedInvoiceId: m.suggestedInvoiceId };
    });
  }

  async confirmMatches(confirmations: { reference: string; amountKobo: number; invoiceId: string }[], actor: RequestUser) {
    TenantContext.schoolIdOrThrow(); // ensure tenant context
    let recorded = 0, skipped = 0;
    const errors: { reference: string; message: string }[] = [];
    for (const c of confirmations) {
      try {
        await this.payments.recordOfflinePayment({ invoiceId: c.invoiceId, amountKobo: c.amountKobo, channel: "BANK_TRANSFER", reference: c.reference }, actor);
        recorded++;
      } catch (e) {
        if (e instanceof ConflictException) skipped++;
        else errors.push({ reference: c.reference, message: e instanceof Error ? e.message : "Failed to record." });
      }
    }
    return { recorded, skipped, errors };
  }
}
```
NOTE: `recordOfflinePayment`'s DTO channel type is `PaymentChannel` — pass the string `"BANK_TRANSFER"` (assignable to the enum) or import `PaymentChannel` and pass `PaymentChannel.BANK_TRANSFER`. Use whichever typechecks. A foreign/owned-by-other-school invoiceId → `recordOfflinePayment` throws `NotFoundException` → lands in `errors` (the cross-tenant test asserts `errors.length === 1` + no apply).

- [ ] **Step 5: `reconciliation.controller.ts`** (mirror release.controller guard imports):
```ts
import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ReconciliationService } from "./reconciliation.service";
import { ProposeMatchesDto, ConfirmMatchesDto } from "./dto/reconcile.dto";

@Controller("v1/fees/reconcile")
export class ReconciliationController {
  constructor(private service: ReconciliationService) {}

  @Post("propose") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  propose(@Body() dto: ProposeMatchesDto) { return this.service.proposeMatches(dto.termId, dto.rows); }

  @Post("confirm") @HttpCode(200) @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermissions("fees.manage")
  confirm(@Body() dto: ConfirmMatchesDto, @CurrentUser() user: RequestUser) { return this.service.confirmMatches(dto.confirmations, user); }
}
```

- [ ] **Step 6: Register** in `fees.module.ts`: import `PaymentsModule` (exports `PaymentsService`); add `ReconciliationService` to providers + `ReconciliationController` to controllers. (Confirm `PaymentsModule` `exports: [PaymentsService]` — it does per slice 2; if not, add the export. No circular import: PaymentsModule does not import FeesModule.)

- [ ] **Step 7:** Run e2e → all `reconciliation` tests + full suite green. Build + typecheck clean.

- [ ] **Step 8: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/api/src/modules/fees apps/api/test/reconciliation.e2e-spec.ts
git commit -m "feat(fees): bank-CSV reconciliation — propose matches + confirm (BANK_TRANSFER)"
```

---

## Task 3: Web — upload → review → confirm

**Files:** Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/fees/page.tsx`

- [ ] **Step 1: api client** — types + methods:
```ts
export interface BankRow { reference: string; amountKobo: number; narration: string; date?: string }
export interface MatchCandidateView { invoiceId: string; studentName: string; admissionNo: string; balanceKobo: number; score: number; confidence: "high" | "low" | "none" }
export interface ProposedMatch { row: BankRow; candidates: MatchCandidateView[]; suggestedInvoiceId: string | null }
```
```ts
  proposeMatches: (termId: string, rows: BankRow[]) =>
    authedRequest<ProposedMatch[]>("/v1/fees/reconcile/propose", { method: "POST", body: JSON.stringify({ termId, rows }) }),
  confirmMatches: (confirmations: Array<{ reference: string; amountKobo: number; invoiceId: string }>) =>
    authedRequest<{ recorded: number; skipped: number; errors: Array<{ reference: string; message: string }> }>("/v1/fees/reconcile/confirm", { method: "POST", body: JSON.stringify({ confirmations }) }),
```

- [ ] **Step 2: Reconcile UI** on `/fees` (a collapsible "Reconcile bank statement" section, or a `/fees/reconcile` route — keep it on `/fees` for simplicity). Steps:
  - A **file input** (accept `.csv`) → on change, parse with **papaparse** (`import Papa from "papaparse"` — already a web dep; confirm import style used by the student-import UI and mirror it). `Papa.parse(file, { header: true, skipEmptyLines: true })`.
  - **Auto-detect columns** from the parsed headers (case-insensitive): amount = first header matching `/amount|credit|deposit/`, narration = `/narration|description|details|particulars/`, reference = `/reference|ref|teller/`, date = `/date/`. Map each row → `{ reference: row[refCol] || `ROW-${i}`, amountKobo: Math.round(parseFloat(String(row[amtCol]).replace(/[^0-9.]/g, "")) * 100), narration: row[narrCol] ?? "" }`; drop rows with `amountKobo <= 0` or NaN.
  - POST to `proposeMatches(termId, rows)` → render a **review table**: per row — narration, amount (`formatMoney`), reference, a **`<select>`** of candidates (label `studentName · balance` + confidence chip) defaulting to `suggestedInvoiceId` (plus a "— Skip —" option), and an editable amount input (defaults to the row amount). 
  - **Confirm** → collect non-skipped rows → `confirmMatches([{reference, amountKobo, invoiceId}])` → show `{recorded, skipped, errors}` + reload the collections/invoices table. Loading/empty/error states; if a CSV has no detectable amount/narration column, show a clear error.

- [ ] **Step 3: Verify (no dev server):** `pnpm --filter @mymakaranta/web typecheck` + `lint` + `build`. `/fees` builds. Reconcile tokens/ui + the papaparse import against the student-import page.

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/src/lib/api.ts "apps/web/src/app/(app)/fees/page.tsx"
git commit -m "feat(fees): bank-CSV reconcile UI — upload, review matches, confirm"
```

---

## Task 4: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; per-call auth re-inject; one bash call per sequence; React inputs via native-setter+dispatch; file upload via the browse `upload` command or by driving the parse path). Start API + web. Log in as the QA proprietor (`+2348033344455`, "S3 Gradebook QA", JSS1 invoices for Ada/Bola). Prepare a tiny CSV (cwd-relative or `$TMPDIR`) with 2 deposit rows naming "Ada Eze" and "Bola Ade" + amounts. On `/fees`: open **Reconcile bank statement** → upload the CSV → confirm the review table shows Ada/Bola as suggested matches (confidence chips) → Confirm → `{recorded:2}`, balances drop, receipts exist (cross-check `GET /v1/fees/collections`). Re-upload + confirm the same → all `skipped`. If driving a real file-upload through the browser is awkward, exercise `proposeMatches`/`confirmMatches` directly via authed `curl` to prove the API seam, then verify the UI renders the review table for a posted set. Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored).

- [ ] **Step 2: Update `docs/RESUME.md`** — Sprint 4 slice 3b (bank-CSV reconciliation) built + QA'd; remaining 3c (finance reports) + slice 4 (parent pay). Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify full e2e + unit + web vitest + builds, then merge `sprint-4-csv-recon` → main per the user's choice).

---

## Notes for the implementer
- **No new model, no migration** — `proposeMatches` is read-only; `confirmMatches` mutates only via the proven slice-2 `recordOfflinePayment` (tenant-scoped invoice validation + apply + receipt + dup-ref 409 all happen there).
- **Matcher is pure** — all scoring/ranking in `reconcile.util`; the service just loads candidates + maps. Keep amount-only matches as `none` confidence (never auto-suggested).
- **`confirmMatches` is resilient** — per-row try/catch: `ConflictException` (dup ref) → `skipped`; other errors (e.g. foreign invoice → `NotFoundException`) → `errors[]`; never aborts the batch.
- **Explicit `schoolId`** in `proposeMatches` (term + invoice reads). `confirmMatches` relies on `recordOfflinePayment`'s scoping (it reads the invoice by `{id, schoolId}` from `TenantContext`).
- **Don't `next build` while `next dev` runs**; stop dev servers before API `prisma`/builds.
- **Tokens/ui + papaparse import** — reconcile against the existing student-import UI + prior fees pages.
