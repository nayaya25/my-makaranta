# myMakaranta Design System

**The single reference for how myMakaranta looks and feels.** Tokens are the source of truth
(`packages/ui/tokens.ts`); Storybook (`pnpm --filter @mymakaranta/ui storybook`, http://localhost:6006)
is the living catalogue. This document is the *rules*.

## Brand context

| | |
|---|---|
| **Brand** | myMakaranta ("makaranta" = school, Hausa) |
| **Industry** | School management SaaS for the Nigerian secondary-education value chain |
| **Personality** | Trustworthy, modern, crafted, confident; Nigerian-rooted without flag-colour cliché |
| **Audiences** | Proprietor, Principal, Bursar, Registrar (dense desktop) · Teacher, Parent, Student (calm mobile-web) |
| **Wedge** | Consumer-grade craft in a category of 2014-era enterprise SaaS |
| **Base direction** | "Bold Ink" (Linear-leaning) + a "Saffron Warmth" layer for parent/student surfaces |

---

## 1. Color system

Indigo is the signature primary — culturally resonant across Nigerian indigo textile traditions
(Hausa, Yoruba adire, Igbo nri), and it reads as trustworthy + academic. We deliberately avoid
green/white flag colours. Saffron is the warmth/celebration accent.

### Brand — electric indigo
| Token | Hex | Use |
|---|---|---|
| `brand-50` | `#EEF0FE` | tinted backgrounds, hover wash |
| `brand-100` | `#DADEFB` | soft fills, subtle borders |
| `brand-300` | `#8B92F0` | accent text, dark-mode chips |
| `brand-500` | `#4338CA` | **primary** — buttons, links, focus ring |
| `brand-700` | `#2E2A9E` | pressed states, dark-mode primary |
| `brand-900` | `#181A4E` | deep accents, logos on light |

### Accent — saffron (parent/student warmth, achievement)
| Token | Hex | Use |
|---|---|---|
| `saffron-100` | `#FEF3D9` | celebration backgrounds, status-pill bg |
| `saffron-500` | `#E8A33C` | achievement chip, parent-surface CTA |
| `saffron-700` | `#A06A1A` | saffron text on light |

### Neutrals — cool ink
| Token | Hex | Use |
|---|---|---|
| `ink-1000` | `#0B0D12` | primary text (light) · base canvas (dark) |
| `ink-700` | `#3C4150` | secondary text |
| `ink-500` | `#6B7180` | tertiary text, placeholder |
| `ink-300` | `#D9DCE3` | borders |
| `ink-100` | `#EEF0F4` | subtle fills |

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F4F5F7` | cool app canvas (admin base) |
| `paper-warm` | `#FBF7EF` | warm cream canvas (parent/student) |
| `paper-dark` | `#0B0D12` | base canvas (dark) — near-black, not pure |
| `surface` | `#FFFFFF` | card surface (light) |
| `surface-dark` | `#15171F` | card surface (dark) |

### Semantic
| Token | Hex | Meaning |
|---|---|---|
| `success` | `#1F9D55` | fee paid, present, on-time |
| `warning` | `#D97706` | outstanding, late, action required |
| `error` | `#E11D48` | overdue, absent, destructive (rose) |
| `info` | `#2D7CE0` | informational |

**Light/dark:** Tailwind `class` strategy (`<html class="dark">`). Cards flip `surface`→`surface-dark`,
canvas `paper`→`paper-dark`. Content text MUST be dark-aware: `text-ink-1000 dark:text-ink-100`
(secondary `text-ink-700 dark:text-ink-300`).

---

## 2. Typography

| Role | Family | Notes |
|---|---|---|
| UI | **Inter** (variable) | screen-optimized, tabular figures, Yoruba diacritics |
| Display / hero | **General Sans** | marketing + signature moments |
| Academic | **Newsreader** (serif) | report cards, certificates, transcripts |

**Numerics:** `tabular-nums` on all money and grades (columns align). Money never abbreviated
(`₦12,450,000`, not `12.45M`).

**Scale** (modular 1.25 — `text-{name}` utilities): display 64/1.05 · h1 40/1.1 · h2 28/1.15 ·
h3 20/1.3 · body 16/1.5 · small 14/1.45 · caption 12/1.35.

**Weights:** Inter 400/500/600/700; General Sans 500/600/700.

---

## 3. Spacing & radius

**Base unit 4px.** Scale (`spacing` token / Tailwind `1`–`24`): 0,4,8,12,16,20,24,32,40,48,64,80,96px.

**Radius:** `sm` 6 · `input`/`button` 8 (crisp, Bold Ink) · `card` 12 · `warm` 16 (parent/student) ·
`sheet` 20 · `pill` 9999.

---

## 4. Elevation & motion

**Elevation** (`shadow-{xs,sm,md,lg,xl}`): soft, layered, cool-ink-tinted — never harsh drop shadows.
Default card `sm`; raised/interactive `md`→`lg`; overlays `xl`. `shadow-focus` = 2px indigo ring + 2px offset.

**Motion** (`ease-expo` = `cubic-bezier(0.16,1,0.3,1)`; linear forbidden except indeterminate progress):
`duration-micro` 120ms (hover/toggle/focus) · `duration-standard` 240ms (page/modal) · hero 560ms
(results reveal, payment success). Animation serves communication, not decoration.

---

## 5. Component specifications

Built in-house over Radix UI primitives (a11y) + Tailwind + `class-variance-authority`. No styled
component library (no shadcn/MUI/Chakra) so the aesthetic stays ours.

**Shipped (TDD + Storybook):** Button, Card, Input, Textarea, Label, Field, Badge, Tag, Avatar,
Skeleton, Spinner.

- **Button** — variants `primary` (indigo) · `secondary` (neutral) · `outline` · `ghost` ·
  `destructive` (rose); sizes `sm/md/lg`. Micro-motion + active-press, `shadow-focus` ring.
- **Card** — `tone` `base` (bordered, crisp, admin) | `warm` (rounded-warm, parent/student);
  `elevation` flat/sm/md/lg; dark surface variants. Sub-parts: Header/Body/Footer.
- **Input / Textarea** — `invalid` toggles error border; dark-aware; focus ring.
- **Field** — Label + control + hint/error (`role="alert"`), `htmlFor` association.
- **Badge** — tones neutral/brand/success/warning/error/info (status pills).
- **Tag** — removable chip (lucide `X`).
- **Avatar** — Radix, image with initials fallback, sizes sm/md/lg.
- **Skeleton / Spinner** — loading states (skeletons preferred over spinners for content).

**Planned (wave 2, Radix-backed):** Dialog, Sheet, Drawer, Tooltip, Popover, Toast, Tabs, Accordion,
Dropdown, Select, Switch, Checkbox, Radio, NavigationMenu, Breadcrumb, EmptyState, ErrorState.

---

## 6. Accessibility

- **WCAG 2.2 AA** floor; **7:1 (AAA)** for text over images/photos (Nigerian midday sunlight is a real context).
- Focus: every interactive element shows `shadow-focus` (2px indigo ring, 2px offset). Never remove focus rings.
- Tap targets ≥ 44×44px (48 preferred on mobile-web).
- Icon-only controls carry an `aria-label`. Radix supplies focus traps / ARIA for overlays; hand-rolled
  components carry their own roles.
- Errors are announced (`role="alert"`); state never communicated by colour alone (pair with icon/text).

---

## 7. Tokens & utilities (implementation)

- **Tokens:** `packages/ui/tokens.ts` — the only place hex/scale values live. Import nothing else for design values.
- **Tailwind:** `packages/ui/tailwind-preset.ts` consumes tokens; apps extend the preset. Use utilities
  (`bg-brand-500`, `rounded-card`, `shadow-md`, `text-h2`, `duration-micro`, `ease-expo`) — **never raw hex, never magic numbers** in JSX.
- **Compose classes** with `cn()` (`packages/ui/src/lib/cn.ts` = clsx + tailwind-merge).
- **Variants** via `cva`. **Import components** from `@mymakaranta/ui`.

---

## 8. Usage do's & don'ts

**Do**
- Reference tokens via Tailwind utilities; flip surfaces and text for dark mode.
- Use `tabular-nums` for every figure; keep currency full-precision.
- Prefer skeletons to spinners for content; use optimistic UI for high-frequency actions.
- Match stakeholder density: dense Bold Ink for proprietor/admin; warm calm for parent/student.

**Don't**
- Hardcode hex or px in components. Add a token instead.
- Introduce a styled component library (defeats the craft wedge).
- Use green/white flag colours as brand signals.
- Animate lists on initial render, or numbers unless the user triggered the change.
- Put destructive actions in the mobile thumb zone.

---

## 9. Mobile-web guidelines (parent / teacher / student surfaces)

**Scope:** myMakaranta ships **responsive mobile-web** now; native iOS/Android (Expo) is a later
milestone. These rules apply to the parent, teacher, and student surfaces of `apps/web` — same tokens,
the `warm` tone for parent/student, dense Bold Ink for teacher tools. iOS HIG / Material native specifics
and native haptics are deferred with the Expo build.

**Design decision lens** (apply to every mobile element): Purpose · Hierarchy · Context · Accessibility · Performance.

### Touch
- Targets ≥ **44×44px** (48 preferred); ≥ **8px** between interactive elements.
- **Thumb zone:** primary actions (Pay, Mark attendance, Send) within the bottom ~60%; destructive
  (Delete, Discard) top-right and confirmed — never in the thumb zone.
- Visual touch feedback within **100ms** (active state / ripple-free press scale `active:scale-[0.98]`).
- Haptics: web `navigator.vibrate` only, sparingly, for key confirmations (graceful no-op where unsupported).

### Navigation patterns (as web components)
- **Bottom tab bar** — parent 4 tabs (Home · Children · Pay · Messages); teacher 5 (Today · Classes ·
  Messages · Tools · Me). Max 5; **no FAB** (PRD: teacher app is FAB-free, actions live in context).
- **Bottom sheet** — the `Sheet` component, bottom-anchored, for modal content/actions.
- **Pull-to-refresh** for content lists; **swipe actions** for row secondaries (later wave).
- Avoid gesture conflicts (horizontal swipe vs vertical scroll).

### Typography (mobile)
- Body **≥ 16px** (prevents iOS auto-zoom on focus). Line-height 1.5 body, 1.1–1.3 headings.
- Measure 45–75 chars. Max 3 weights on a screen.

### Micro-interactions (Trigger → Rules → Feedback → Mode)
- **Mark attendance:** tap tile → status cycles → tile shifts colour + 2px inset (`duration-micro`) →
  optimistic local state, syncs in background.
- **Pay fee:** tap Pay → Paystack flow → hero checkmark draw (`duration-hero`) + bottom-sheet receipt →
  invoice state flips to paid.
- **Result release:** open → choreographed reveal (cover → photo → subjects stagger → position) →
  share-ready card.

### Performance budget (defended in CI — PRD §3.6)
- First-load JS ≤ **200KB gz**; TTI ≤ **3s** on mid-range 4G Android; tested on a real **Tecno Spark**.
- Images AVIF/WebP, responsive `srcset`, lazy-loaded, ≤ 200KB per visible image.
- Animate `transform`/`opacity` only; hardware-accelerated; no layout-thrashing properties.
- Skeleton screens for content > 200ms; optimistic UI for high-frequency actions.

### Forms (mobile)
- Single column, smart defaults, inline validation (`Field` error with `role="alert"`), correct
  `inputmode`/`type` (numeric keyboards for scores/amounts), explicit Next affordance.

### iOS/Android web quirks
- Use `100dvh` (not `100vh`) for full-height; respect safe areas via `env(safe-area-inset-*)`.
- 16px inputs to avoid iOS zoom; `-webkit-tap-highlight-color: transparent` with our own focus/active states.

### Accessibility & testing
- WCAG AA (4.5:1) min, 7:1 for text over photos; visible focus everywhere; semantic markup + ARIA.
- Test: real Tecno Spark, Lighthouse mobile in CI, VoiceOver (iOS Safari) + TalkBack (Android Chrome).
