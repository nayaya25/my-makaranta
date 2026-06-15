# Results Reveal Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button-triggered, screen-only reveal on the report-card page — suspense → overall result lands (average count-up + position pop, celebratory burst for top performers) → overlay exits to expose the (always print-safe) static card.

**Architecture:** Pure `apps/web` UI. A `ResultReveal` client component wraps the slice-5 static card in a `relative` container and overlays a `framer-motion` phase machine (`print:hidden`). The static card never animates (so Print/Save-as-PDF is always complete); all motion is in the overlay. One pure helper holds the testable "celebrate?" rule. `prefers-reduced-motion` jumps straight to the card.

**Tech Stack:** Next.js 15 / React 19 / `framer-motion` (add to apps/web) / Tailwind; vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-sprint-3-slice-6-reveal-animation-design.md`

**Branch:** `sprint-3-reveal` (already created).

**KEY CONVENTIONS:** client components (`"use client"`); design-system tokens (match `report-card/[studentId]/page.tsx` — `rounded-card`, `bg-surface`/`-dark`, `text-ink-*`, `text-caption`, `Button`); `noUncheckedIndexedAccess` (`?.`/`!`). **PRINT-SAFETY RULE:** never put framer-motion on the static card itself — motion sets inline `opacity:0` which would blank the PDF. All motion stays in the `print:hidden` overlay.

---

## File Structure
- Modify: `apps/web/package.json` (add `framer-motion`)
- Create: `apps/web/src/app/(app)/report-card/reveal.util.ts` + `reveal.util.test.ts`
- Create: `apps/web/src/app/(app)/report-card/ResultReveal.tsx`
- Modify: `apps/web/src/app/(app)/report-card/[studentId]/page.tsx` (wrap the card)

---

## Task 1: `framer-motion` dep + pure celebrate helper (unit-tested)

**Files:** Modify `apps/web/package.json`; create `reveal.util.ts` + `reveal.util.test.ts`

- [ ] **Step 1: Add the dep** (match the version in `packages/ui` for consistency — check `packages/ui/package.json`, it's `^11.18.2`):
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta" && pnpm --filter @mymakaranta/web add framer-motion@^11.18.2
```

- [ ] **Step 2: Failing unit test** — `apps/web/src/app/(app)/report-card/reveal.util.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldCelebrate, topBandMinScore } from "./reveal.util";

const bands = [
  { grade: "A1", minScore: 75 },
  { grade: "B2", minScore: 70 },
  { grade: "F9", minScore: 0 },
];

describe("topBandMinScore", () => {
  it("returns the highest minScore", () => {
    expect(topBandMinScore(bands)).toBe(75);
  });
  it("returns null for empty", () => {
    expect(topBandMinScore([])).toBeNull();
  });
});

describe("shouldCelebrate", () => {
  it("celebrates position 1 regardless of average", () => {
    expect(shouldCelebrate({ position: 1, average: 40, gradeKey: bands })).toBe(true);
  });
  it("celebrates a distinction average even if not first", () => {
    expect(shouldCelebrate({ position: 3, average: 80, gradeKey: bands })).toBe(true);
  });
  it("does not celebrate a mid result that is not first", () => {
    expect(shouldCelebrate({ position: 3, average: 60, gradeKey: bands })).toBe(false);
  });
  it("falls back to position-only when no gradeKey", () => {
    expect(shouldCelebrate({ position: 1, average: 10, gradeKey: [] })).toBe(true);
    expect(shouldCelebrate({ position: 2, average: 99, gradeKey: [] })).toBe(false);
  });
});
```

- [ ] **Step 3:** `pnpm --filter @mymakaranta/web exec vitest run reveal.util` → FAIL (module missing).

- [ ] **Step 4: Implement `reveal.util.ts`:**
```ts
export interface GradeBand {
  grade: string;
  minScore: number;
}

/** Highest minScore among bands (the distinction threshold), or null if empty. */
export function topBandMinScore(gradeKey: GradeBand[]): number | null {
  if (gradeKey.length === 0) return null;
  return gradeKey.reduce((max, b) => (b.minScore > max ? b.minScore : max), gradeKey[0]!.minScore);
}

/** Top performer = finished 1st, or scored at/above the distinction band. */
export function shouldCelebrate(args: { position: number; average: number; gradeKey: GradeBand[] }): boolean {
  if (args.position === 1) return true;
  const top = topBandMinScore(args.gradeKey);
  return top !== null && args.average >= top;
}
```

- [ ] **Step 5:** `pnpm --filter @mymakaranta/web exec vitest run reveal.util` → PASS (6). `pnpm --filter @mymakaranta/web typecheck` clean.

- [ ] **Step 6: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add apps/web/package.json pnpm-lock.yaml "apps/web/src/app/(app)/report-card/reveal.util.ts" "apps/web/src/app/(app)/report-card/reveal.util.test.ts"
git commit -m "feat(report-card): framer-motion dep + shouldCelebrate helper"
```

---

## Task 2: `ResultReveal` overlay + page integration

**Files:** Create `ResultReveal.tsx`; modify `report-card/[studentId]/page.tsx`

- [ ] **Step 1: Implement `apps/web/src/app/(app)/report-card/ResultReveal.tsx`:**
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "@mymakaranta/ui";
import { shouldCelebrate, type GradeBand } from "./reveal.util";

type Phase = "idle" | "suspense" | "headline" | "done";

interface RevealData {
  student: { name: string };
  average: number;
  position: number;
  classSize: number;
  gradeKey: GradeBand[];
}

const SUSPENSE_MS = 800;
const COUNTUP_MS = 1200;
const HOLD_MS = 1400; // after count-up before auto-advancing

/** Count-up number; jumps to target instantly when reduced-motion. */
function CountUp({ to, durationMs, reduce }: { to: number; durationMs: number; reduce: boolean }) {
  const [val, setVal] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, durationMs, reduce]);
  return <span className="tabular-nums">{val}</span>;
}

/** Deterministic radial burst (no Math.random → no hydration drift). */
function Burst({ count = 16 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dist = 90 + (i % 3) * 22;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const colors = ["bg-brand-500", "bg-saffron-500", "bg-success", "bg-brand-300"];
        return (
          <motion.span
            key={i}
            className={`absolute h-2 w-2 rounded-full ${colors[i % colors.length]}`}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x, y, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export function ResultReveal({ data, children }: { data: RevealData; children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const celebrate = shouldCelebrate({ position: data.position, average: data.average, gradeKey: data.gradeKey });

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const start = () => {
    if (reduce) {
      setPhase("done");
      return;
    }
    setPhase("suspense");
    timers.current.push(setTimeout(() => setPhase("headline"), SUSPENSE_MS));
    timers.current.push(setTimeout(() => setPhase("done"), SUSPENSE_MS + COUNTUP_MS + HOLD_MS));
  };

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {phase !== "done" && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-card bg-surface dark:bg-surface-dark print:hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {phase === "idle" && (
              <div className="text-center">
                <p className="text-small text-ink-500 mb-1">{data.student.name}</p>
                <p className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-4">Your results are ready</p>
                <Button onClick={start}>Reveal results</Button>
              </div>
            )}
            {phase === "suspense" && (
              <motion.div
                className="text-center"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              >
                <p className="font-display text-h3 font-semibold text-ink-700 dark:text-ink-300">Revealing…</p>
              </motion.div>
            )}
            {phase === "headline" && (
              <div className="relative text-center">
                {celebrate && <Burst />}
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 16 }}>
                  <p className="text-small text-ink-500 mb-1">Overall average</p>
                  <p className="font-display text-[3rem] leading-none font-semibold text-brand-500">
                    <CountUp to={data.average} durationMs={COUNTUP_MS} reduce={reduce} />
                  </p>
                  <motion.p
                    className="mt-3 text-body text-ink-1000 dark:text-ink-100"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 18 }}
                  >
                    Position <span className="font-semibold tabular-nums">{data.position}</span> of <span className="tabular-nums">{data.classSize}</span>
                    {celebrate && " 🎉"}
                  </motion.p>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```
NOTES for the implementer:
- Confirm the tokens exist: `bg-saffron-500`, `bg-brand-300`/`-500`, `bg-success`, `text-caption` — check `packages/ui/tokens.ts`/`tailwind-preset.ts` and the slice-5 pages; swap any that differ (e.g. if there's no `saffron-500`, use the real saffron token name, or drop to brand/success colors). The slice-5 reconciliation found `bg-paper`, `text-brand-500`, `text-caption` are valid and `bg-canvas`/`text-brand-600` are NOT — apply the same real tokens here.
- `useReducedMotion()` can return `null` initially; `?? false` handles it.
- The overlay is `print:hidden` and sits over the card via `absolute inset-0`; the card (`children`) is always rendered at full opacity → prints complete at any phase.
- `framer-motion`'s `animate(from, to, opts)` is the imperative count-up driver; `controls.stop()` cleans up.

- [ ] **Step 2: Integrate** in `report-card/[studentId]/page.tsx`. Import `{ ResultReveal } from "../ResultReveal";` (adjust the relative path — the page is at `report-card/[studentId]/page.tsx`, the component at `report-card/ResultReveal.tsx`, so `"../ResultReveal"`). Wrap ONLY the static card `<div className="rounded-card border ...">…</div>` (the one containing header/table/footer) with:
```tsx
<ResultReveal data={{ student: rc.student, average: rc.average, position: rc.position, classSize: rc.classSize, gradeKey: rc.gradeKey }}>
  <div className="rounded-card border border-ink-100 dark:border-white/10 p-6 print:border-0">
    {/* ...existing card contents unchanged... */}
  </div>
</ResultReveal>
```
Leave the "Print / Save as PDF" button (outside/above the card) exactly as-is — it must stay clickable at all phases and print the full card.

- [ ] **Step 3: Verify (no dev server running):**
```
pnpm --filter @mymakaranta/web typecheck
pnpm --filter @mymakaranta/web lint
pnpm --filter @mymakaranta/web build
```
All pass; `/report-card/[studentId]` builds. Fix unused imports / token / type mismatches (e.g. the `RevealData` shape must match what the page passes).

- [ ] **Step 4: Commit**
```bash
cd "c:/Users/IBRAHIM BASHIR/Documents/myMakaranta"
git add "apps/web/src/app/(app)/report-card/ResultReveal.tsx" "apps/web/src/app/(app)/report-card/[studentId]/page.tsx"
git commit -m "feat(report-card): button-triggered results reveal (count-up, pop, celebratory burst)"
```

---

## Task 3: Browser QA + docs + finish

- [ ] **Step 1: Browser QA** (RESUME playbook; auth re-inject per call). Start API + web. Log in as the QA proprietor (`+2348033344455`). Open a report card for a **position-1** student (Ada Eze in the released JSS1A, position 1, avg 85 — celebrates) at `/report-card/<adaId>?termId=<term>`:
  - Idle: the card is masked by the overlay showing the name + "Reveal results".
  - Click → "Revealing…" suspense → the average counts up to 85 + "Position 1 of 2" pops + a **burst** fires (celebrate=true) → overlay fades → the full static card shows.
  - Open a **non-celebrating** student (Bola Ade, position 2, avg 8): same sequence, **no burst**.
  - **Reduced motion:** emulate `prefers-reduced-motion: reduce` (via the browser tool's emulation, or DevTools), reload, click "Reveal results" → it jumps straight to the full card (no count-up/suspense/burst).
  - **Print-safety:** trigger Print/Save-as-PDF BOTH at idle (before revealing) AND after reveal → the complete static card prints both times (no overlay, no CTA, all rows present).
  Fix any seam bug (`fix(qa):`). Record findings in `.gstack/qa-reports/` (gitignored). (Gotchas: stop web dev before any prod build; the overlay must be `print:hidden`.)

- [ ] **Step 2: Update `docs/RESUME.md`** — current state: slice 6 (reveal animation) built + QA'd on `sprint-3-reveal`; **Sprint 3 (Assessment & Grading) complete**. Commit.

- [ ] **Step 3: Finish** — `superpowers:finishing-a-development-branch` (verify web typecheck/lint/build + the vitest unit + the API e2e are green, then merge `sprint-3-reveal` → main per the user's choice).

---

## Notes for the implementer
- **PRINT-SAFETY is the load-bearing constraint:** all framer-motion stays in the `print:hidden` overlay; the static card never gets motion/opacity styles. Verify by printing at idle.
- **Reduced motion** must fully short-circuit (no count-up animation, no timers firing motion) — clicking goes straight to `done`.
- **Tokens:** reconcile every color/spacing token against the real design system (`packages/ui`), per the slice-5 findings (`bg-canvas`/`text-brand-600` do NOT exist; `bg-paper`/`text-brand-500`/`text-caption` do). If `saffron`/`success` shades differ, use the real names or fall back to brand.
- **No backend/API/e2e changes** — this is pure web; the API suite should remain untouched and green.
- **Don't `next build` while `next dev` runs**; stop dev servers before any prod build.
- This is the final Sprint 3 slice — after merge, Sprint 3 (Assessment & Grading) is complete.
