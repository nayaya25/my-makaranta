# Sprint 3 · Slice 6 — Results Reveal Animation (Design)

- **Date:** 2026-06-15
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 6 — the final slice. Builds on slice 5 (report-card page).
- **Builds on:** `apps/web/src/app/(app)/report-card/[studentId]/page.tsx` + the `ReportCard` type/`getReportCard` client (slice 5); `framer-motion` (already in `packages/ui`).

## Goal

A delightful, button-triggered reveal on the report-card page: a brief suspense beat, then
the overall result lands (average counts up, position pops), then subject rows cascade in —
with a celebratory burst for top performers. Screen-only and accessibility-aware; the
printable card is untouched.

## Scope (locked decisions)

1. **Placement:** on the existing `/report-card/[studentId]` page, as a **screen-only
   overlay** over the already-rendered static card. **Button-triggered** ("Reveal results").
2. **Print-safe:** the static card (slice 5) stays fully in the DOM at all times; the entire
   reveal layer is `print:hidden`, so Print/Save-as-PDF always yields the complete card.
3. **Sequence:** headline-first — `idle` (CTA) → `suspense` → `headline` (average count-up +
   position pop, + celebration burst for top performers) → `done` (overlay fades, subject
   rows stagger in).
4. **Celebration:** a DIY `framer-motion` particle/confetti burst (NO new dependency) for top
   performers; rule is pure + unit-tested.
5. **Accessibility:** `useReducedMotion()` → tapping jumps straight to `done` (no count-up,
   stagger, or burst); CTA/overlay are keyboard-focusable + labeled.

### Non-goals
- No backend changes, no new routes, no new dependencies.
- Parent/student-facing portal or a shareable reveal link (no identity link yet).
- Sound; reveal on `/release` or `/verify`; reveal for the class-wide sheet.

## Architecture

Pure UI, entirely within `apps/web`. The slice-5 report card renders unchanged; a new
`ResultReveal` client component wraps it and overlays a phase-driven reveal on screen. One
pure helper holds the testable "celebrate?" logic. No `packages/ui` change (the component is
page-specific; it imports `framer-motion` directly, as `packages/ui` already depends on it —
confirm the web app can import `framer-motion` transitively or add it to `apps/web` deps if
the import doesn't resolve).

### Pure helper — `apps/web/src/app/(app)/report-card/reveal.util.ts`
```
topBandMinScore(gradeKey: { grade: string; minScore: number }[]): number | null
  → the highest minScore among bands (the distinction threshold), or null if empty.

shouldCelebrate(args: { position: number; average: number;
  gradeKey: { grade: string; minScore: number }[] }): boolean
  → true if position === 1, OR (topBandMinScore !== null && average >= topBandMinScore).
```
Pure, deterministic, vitest-tested.

### Component — `apps/web/src/app/(app)/report-card/ResultReveal.tsx`
- Props: `{ data: ReportCard; children: React.ReactNode }` (children = the static card markup).
- Local `phase` state: `"idle" | "suspense" | "headline" | "done"`.
- Renders `children` always (so print + DOM are complete). When `phase !== "done"`, an
  absolutely-positioned overlay (`print:hidden`, covers the card area) shows the current
  phase's UI; at `done` the overlay is unmounted/faded so the card is fully visible.
- **idle:** overlay with the student's name + a "Reveal results" button (focusable).
- **suspense:** ~800ms shimmer/pulse, then auto-advance to `headline` (via a timer; cleared on
  unmount).
- **headline:** the overall `average` counts up 0→value (framer-motion `animate`/`useMotionValue`
  + `useTransform`, or a small rAF count-up), the `position` pops in (scale/opacity spring);
  if `shouldCelebrate(...)`, a burst of ~12–20 motion particles animates outward from the
  headline. A "See full result" affordance (or auto-advance after the count-up) → `done`.
- **done:** overlay gone; the card's **subject rows stagger in** (framer-motion staggered
  children on the rows — implemented by the page passing motion-wrapped rows, OR `ResultReveal`
  exposing a `revealed` flag via context/prop; keep it simple — a brief one-shot stagger on
  mount of the now-visible card is acceptable).
- **Reduced motion:** `const reduce = useReducedMotion();` — if `reduce`, the "Reveal results"
  click sets `phase="done"` directly (skip suspense/headline/burst); the count-up shows the
  final number immediately; no stagger.
- All timers cleaned up on unmount; no animation runs on the server (client component).

### Page integration — `report-card/[studentId]/page.tsx`
Wrap the existing static card in `<ResultReveal data={rc}>…</ResultReveal>`. The "Print /
Save as PDF" button stays (it prints the full card regardless of phase). No data/flow change.

## Error handling / edge cases
- The reveal is purely presentational; data loading/errors are handled by the existing page
  (slice 5). If `rc` is loading/errored, `ResultReveal` isn't rendered.
- A student with no celebration (`shouldCelebrate` false) gets the same sequence minus the
  burst.
- Print at any phase → the static card prints in full (overlay is `print:hidden`).
- `prefers-reduced-motion` → instant card, no motion.

## Testing
- **Unit (vitest, web):** `shouldCelebrate` — position 1 → true; `average >= topBand` → true;
  mid average + non-1 position → false; empty `gradeKey` → position-only (1 → true, else false).
  `topBandMinScore` — picks the max minScore; empty → null.
- **Browser QA:** open a report card → "Reveal results" → suspense → average counts up +
  position pops → (burst for a position-1/distinction student; NO burst for a mid-rank one) →
  overlay fades → subject rows cascade → full card shown. Emulate reduced motion → click jumps
  straight to the full card (no motion). Print/Save-as-PDF at idle AND after reveal → the
  complete static card prints both times (no overlay, no CTA).

## Dependencies
- Slice 5 (`/report-card` page + `ReportCard` data). `framer-motion` (already in
  `packages/ui`; ensure it resolves from `apps/web` — add to `apps/web` deps if needed). No
  other new deps. No API/DB changes.

## Out-of-scope future
- Parent/student portal + shareable celebratory reveal link.
- Sound/haptics; theme-specific celebration variants.
- This completes Sprint 3 (Assessment & Grading).
