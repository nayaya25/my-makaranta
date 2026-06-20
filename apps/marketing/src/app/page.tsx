import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Check,
  Clock,
  CreditCard,
  FileText,
  Megaphone,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { CountUp, Reveal } from "../components/motion-primitives";
import { Logomark } from "../components/logomark";
import { ThemeToggle } from "../components/theme-toggle";
import {
  AnnouncementsVignette,
  AttendanceVignette,
  DashboardVignette,
  FeesVignette,
  ResultsVignette,
} from "../components/vignettes";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mymakaranta.com";

const TRUST = [
  { icon: WifiOff, label: "Works offline" },
  { icon: Banknote, label: "Naira-native" },
  { icon: Smartphone, label: "Runs on older phones" },
  { icon: Clock, label: "Set up in a day" },
];

const PLATFORM = [
  { icon: Clock, title: "Attendance", blurb: "Whole-class roll call in under a minute.", tint: "bg-teal-50 dark:bg-white/[0.04]", fg: "text-teal-800 dark:text-teal-200" },
  { icon: CreditCard, title: "Fees", blurb: "Collect in Naira; ledgers reconcile themselves.", tint: "bg-lime-50 dark:bg-white/[0.04]", fg: "text-lime-800 dark:text-lime-200" },
  { icon: FileText, title: "Results", blurb: "Publish result sheets families screenshot.", tint: "bg-lilac-50 dark:bg-white/[0.04]", fg: "text-lilac-800 dark:text-lilac-100" },
  { icon: Megaphone, title: "Parents", blurb: "Announcements and alerts, with read receipts.", tint: "bg-blush-50 dark:bg-white/[0.04]", fg: "text-blush-800 dark:text-blush-100" },
];

const JOURNEY = [
  {
    eyebrow: "Attendance",
    title: "Take the register in seconds.",
    body: "Tap once per student; the whole class is marked before assembly ends. Parents of absentees are notified automatically — no calls, no notes home.",
    bullets: ["Offline-ready roll call", "Automatic absentee alerts", "Termly attendance, per student"],
    Vignette: AttendanceVignette,
    tint: "bg-teal-50 dark:bg-white/[0.04]",
    reverse: false,
  },
  {
    eyebrow: "Fees",
    title: "Fees in Naira that reconcile themselves.",
    body: "Collect by transfer or card. Every payment is matched to the right student, the receipt is written, and the ledger balances itself. Bursary reports stop being a weekend job.",
    bullets: ["Auto-matched transfers", "Receipts written for you", "Live outstanding-fees view"],
    Vignette: FeesVignette,
    tint: "bg-lime-50 dark:bg-white/[0.04]",
    reverse: true,
  },
  {
    eyebrow: "Results",
    title: "Results parents are proud to share.",
    body: "Enter scores once and publish a polished result sheet in a click. Families see it the same minute — and screenshot it for the group chat.",
    bullets: ["One-click publishing", "Clean, branded result sheets", "Instant parent access"],
    Vignette: ResultsVignette,
    tint: "bg-lilac-50 dark:bg-white/[0.04]",
    reverse: false,
  },
  {
    eyebrow: "Parents",
    title: "Reach every parent, and know they saw it.",
    body: "Send an announcement to a class or the whole school. It lands where parents already are — and you see exactly who has read it.",
    bullets: ["Class or school-wide", "WhatsApp-friendly", "Read receipts"],
    Vignette: AnnouncementsVignette,
    tint: "bg-blush-50 dark:bg-white/[0.04]",
    reverse: true,
  },
];

const SOCIAL_PROOF = [
  { value: 3200, prefix: "", suffix: "+", label: "Students on the register" },
  { value: 18, prefix: "₦", suffix: "M+", label: "Fees reconciled" },
  { value: 98, prefix: "", suffix: "%", label: "Attendance accuracy" },
  { value: 14, prefix: "", suffix: "", label: "Schools, and counting" },
];

const TIERS = [
  { name: "Sprout", tagline: "Finding your feet", price: "Free", unit: "", limit: "Up to 100 students", highlight: false, features: ["Attendance tracking", "Basic fee management", "Student register", "1 admin user"] },
  { name: "Grow", tagline: "Small to mid-size", price: "₦1,500", unit: "/ student / term", limit: "101 – 300 students", highlight: false, features: ["Everything in Sprout", "Full fee ledger + receipts", "Result-sheet publishing", "5 staff users"] },
  { name: "Bloom", tagline: "Most schools pick this", price: "₦1,200", unit: "/ student / term", limit: "301 – 600 students", highlight: true, features: ["Everything in Grow", "Parent portal & alerts", "WhatsApp fee reminders", "Unlimited staff users"] },
  { name: "Flourish", tagline: "Large schools & groups", price: "₦950", unit: "/ student / term", limit: "601+ students", highlight: false, features: ["Everything in Bloom", "Multi-campus support", "Priority support line", "Custom report branding"] },
];

function Eyebrow({ children, className = "text-teal-800 dark:text-teal-200" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-xs font-600 uppercase tracking-[0.14em] ${className}`}>{children}</span>;
}

/**
 * Primary call-to-action with the "button-in-button" trailing arrow: the icon
 * lives in its own nested circle that drifts diagonally on hover (magnetic
 * physics) while the whole pill presses inward on click. House ease throughout.
 */
function MagneticCta({
  href,
  children,
  tone = "teal",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "teal" | "lime";
  className?: string;
}) {
  const surface =
    tone === "teal"
      ? "bg-teal-800 text-white hover:bg-teal-1000"
      : "bg-lime-400 text-ink hover:bg-lime-200";
  const iconWrap = tone === "teal" ? "bg-white/15" : "bg-ink/10";
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-3 rounded-full py-2 pl-7 pr-2 text-body font-600 shadow-sm transition-all duration-500 ease-house hover:shadow-md active:scale-[0.98] ${surface} ${className}`}
    >
      {children}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-500 ease-house group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${iconWrap}`}
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </a>
  );
}

export default function HomePage() {
  return (
    <div
      className="min-h-[100dvh] bg-canvas"
      style={{
        backgroundImage:
          "radial-gradient(48% 30% at 82% 3%, rgba(0,163,163,0.10), transparent 60%), radial-gradient(40% 26% at 6% 1%, rgba(179,204,24,0.07), transparent 55%)",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Nav — a floating glass island detached from the top edge */}
      <header className="sticky top-0 z-50 px-4 pt-4 sm:pt-5">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-line bg-canvas/70 py-2 pl-5 pr-2 shadow-[0_8px_30px_-12px_rgba(0,31,31,0.20)] backdrop-blur-xl sm:pl-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logomark className="h-7 w-7" />
            <span className="text-lg font-700 tracking-tight text-content">myMakaranta</span>
          </Link>
          <div className="hidden items-center gap-8 text-small font-500 text-muted md:flex">
            <a href="#platform" className="transition-colors hover:text-content">Platform</a>
            <a href="#pricing" className="transition-colors hover:text-content">Pricing</a>
            <a href="#demo" className="transition-colors hover:text-content">Demo</a>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <a href={APP_URL} className="hidden px-3 py-2 text-small font-500 text-content transition-colors hover:text-teal-600 sm:block">
              Sign in
            </a>
            <a href="#demo" className="rounded-full bg-teal-800 px-5 py-2.5 text-small font-600 text-white shadow-sm transition-all duration-500 ease-house hover:bg-teal-1000 hover:shadow-md active:scale-[0.97]">
              Request a demo
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:px-8 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3.5 py-1.5 dark:bg-white/[0.06]">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                <Eyebrow>Made for Nigerian schools</Eyebrow>
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-5 text-[clamp(2.6rem,6vw,4.25rem)] font-700 leading-[1.03] tracking-[-0.02em] text-content">
                Run the <span className="text-pop">whole school</span> from one place.
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-[1.15rem] leading-relaxed text-muted">
                Attendance, fees in Naira, results, and parent updates — together on one platform built
                for how Nigerian schools actually run. Your office stops chasing paper, and your teachers
                get their time back.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <MagneticCta href="#demo">Request a demo</MagneticCta>
                <a href={APP_URL} className="inline-flex items-center justify-center rounded-full ring-hair bg-card px-7 py-3 text-body font-600 text-content shadow-xs transition-all duration-500 ease-house hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98]">
                  Start free
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-4 text-small text-faint">Free under 100 students. No card. Set up in a day.</p>
            </Reveal>
          </div>

          {/* Hero product panel */}
          <Reveal delay={0.18} y={40}>
            <div className="relative rounded-3xl bg-teal-50 p-5 dark:bg-white/[0.04] sm:p-7">
              <div className="[animation:float-slow_7s_ease-in-out_infinite]">
                <DashboardVignette />
              </div>
              <span className="absolute -right-3 -top-3 hidden rounded-full bg-lime-400 px-3 py-1 text-xs font-700 text-ink shadow-md sm:block">
                Live
              </span>
            </div>
          </Reveal>
        </div>

        {/* Trust pills */}
        <Reveal delay={0.2}>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-y border-line py-6">
            {TRUST.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 text-small font-500 text-muted">
                <t.icon className="h-4 w-4 text-teal-600" aria-hidden="true" />
                {t.label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Platform overview grid */}
      <section id="platform" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <Reveal>
          <div className="max-w-2xl">
            <Eyebrow>The platform</Eyebrow>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] font-700 leading-tight tracking-[-0.02em] text-content">
              Everything the school day needs, in one place.
            </h2>
            <p className="mt-4 text-body leading-relaxed text-muted">
              No more juggling notebooks, spreadsheets, and three different WhatsApp groups. One login for
              your whole school.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <div
                className={`group h-full rounded-2xl ${p.tint} p-6 ring-1 ring-inset ring-ink/[0.04] transition-all duration-500 ease-house hover:-translate-y-1.5 hover:shadow-lg dark:ring-white/[0.06]`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-card/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] ring-1 ring-ink/[0.04] transition-transform duration-500 ease-house group-hover:-translate-y-0.5 group-hover:scale-105 dark:ring-white/10">
                  <p.icon className={`h-5 w-5 ${p.fg}`} aria-hidden="true" />
                </span>
                <h3 className={`mt-4 text-h3 font-700 ${p.fg}`}>{p.title}</h3>
                <p className="mt-2 text-small leading-relaxed text-muted">{p.blurb}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Journey rows */}
      {JOURNEY.map((row) => {
        const V = row.Vignette;
        return (
          <section key={row.eyebrow} className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <div className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${row.reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <Reveal>
                <div>
                  <Eyebrow>{row.eyebrow}</Eyebrow>
                  <h2 className="mt-3 text-[clamp(1.6rem,3.2vw,2.25rem)] font-700 leading-tight tracking-[-0.02em] text-content">
                    {row.title}
                  </h2>
                  <p className="mt-4 text-body leading-relaxed text-muted">{row.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {row.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2.5 text-small text-content">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mint-50 dark:bg-white/[0.06]">
                          <Check className="h-3 w-3 text-mint-800 dark:text-mint-100" aria-hidden="true" />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={0.1} y={36}>
                <div className={`rounded-3xl ${row.tint} p-5 ring-1 ring-inset ring-ink/[0.04] transition-all duration-700 ease-house hover:-translate-y-1 hover:shadow-xl dark:ring-white/[0.06] sm:p-8`}>
                  <V />
                </div>
              </Reveal>
            </div>
          </section>
        );
      })}

      {/* Built for Nigeria — photo + copy */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2">
          <Reveal y={36}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl ring-hair">
              <Image src="/images/uniform-portrait.jpg" alt="Students in school uniform" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div>
              <Eyebrow>Why it fits</Eyebrow>
              <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] font-700 leading-tight tracking-[-0.02em] text-content">
                Built for how Nigerian schools actually run.
              </h2>
              <p className="mt-5 text-body leading-relaxed text-muted">
                Software written for somewhere else always shows. We built this one here — for the realities
                your office already knows by heart.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  "The network drops, the work doesn't — take the register and check the timetable offline; it syncs when you're back.",
                  "Fees in Naira, by transfer or card, matched to the right student automatically.",
                  "Light on older phones, and parents get results and reminders on WhatsApp, where they already are.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 dark:bg-white/[0.06]">
                      <Check className="h-3 w-3 text-teal-800 dark:text-teal-200" aria-hidden="true" />
                    </span>
                    <span className="text-small leading-relaxed text-muted">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats / testimonial band */}
      <section className="relative overflow-hidden bg-teal-1000">
        <Image src="/images/assembly.jpg" alt="" fill sizes="100vw" className="object-cover opacity-15" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <Reveal>
            <p className="max-w-2xl text-[clamp(1.4rem,3vw,2rem)] font-500 leading-snug text-white">
              “The first term it just worked. The bursary stopped chasing paper and started chasing fees.”
            </p>
            <p className="mt-4 text-small text-teal-100">— Proprietor, secondary school in Ibadan</p>
          </Reveal>
          <div className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
            {SOCIAL_PROOF.map((item) => (
              <Reveal key={item.label}>
                <div>
                  <p className="text-[clamp(2rem,4vw,2.75rem)] font-700 tabular-nums text-lime-200">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-1 text-small text-teal-100">{item.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal>
          <div className="max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] font-700 leading-tight tracking-[-0.02em] text-content">
              Pay per student, per term. Nothing hidden.
            </h2>
            <p className="mt-4 text-body leading-relaxed text-muted">
              Move up or down each term as your school grows. All prices in Naira, exclusive of VAT.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.06}>
              <div className={`flex h-full flex-col rounded-2xl p-6 transition-all duration-500 ease-house hover:-translate-y-1.5 hover:shadow-xl ${tier.highlight ? "bg-teal-1000 text-white shadow-lg lg:-translate-y-2" : "bg-surface ring-hair"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-h3 font-700 ${tier.highlight ? "text-white" : "text-content"}`}>{tier.name}</p>
                    <p className={`text-small ${tier.highlight ? "text-teal-100" : "text-faint"}`}>{tier.tagline}</p>
                  </div>
                  {tier.highlight && (
                    <span className="rounded-full bg-lime-400 px-2.5 py-1 text-caption font-700 text-ink">Popular</span>
                  )}
                </div>
                <div className="mt-5">
                  <span className={`text-h1 font-700 tabular-nums ${tier.highlight ? "text-white" : "text-content"}`}>{tier.price}</span>
                  {tier.unit && <span className={`ml-1 text-small ${tier.highlight ? "text-teal-100" : "text-faint"}`}>{tier.unit}</span>}
                </div>
                <p className={`mt-1 text-caption ${tier.highlight ? "text-teal-100/80" : "text-faint"}`}>{tier.limit}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-small ${tier.highlight ? "text-teal-50" : "text-muted"}`}>
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tier.highlight ? "text-lime-200" : "text-teal-600"}`} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={tier.price === "Free" ? APP_URL : "#demo"}
                  className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-small font-600 transition-all duration-500 ease-house active:scale-[0.98] ${
                    tier.highlight ? "bg-lime-400 text-ink hover:bg-lime-200" : "ring-hair text-content hover:bg-surface hover:shadow-sm"
                  }`}
                >
                  {tier.price === "Free" ? "Get started free" : "Book a demo"}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="bg-teal-1000">
        <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
          <Reveal>
            <Eyebrow className="text-lime-200">A real walkthrough</Eyebrow>
            <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)] font-700 leading-tight tracking-[-0.02em] text-white">
              See it running your school in fifteen minutes.
            </h2>
            <p className="mt-5 text-body leading-relaxed text-teal-100">
              No slides. No sales pitch. We load your real classes and your real fee structure, then hand
              you the product. Bring your toughest questions.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <MagneticCta
                href="mailto:demo@mymakaranta.com?subject=Book%20a%20demo"
                tone="lime"
                className="w-full justify-between sm:w-auto sm:justify-start"
              >
                Request a demo
              </MagneticCta>
              <a href={APP_URL} className="inline-flex w-full items-center justify-center rounded-full border border-white/25 px-7 py-3.5 text-body font-600 text-white transition-all duration-500 ease-house hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 active:scale-[0.98] sm:w-auto">
                Or start free
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <Logomark className="h-6 w-6" />
              <span className="text-lg font-700 tracking-tight text-content">myMakaranta</span>
            </Link>
            <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-small text-muted">
              <a href="#platform" className="transition-colors hover:text-content">Platform</a>
              <a href="#pricing" className="transition-colors hover:text-content">Pricing</a>
              <a href="#demo" className="transition-colors hover:text-content">Demo</a>
              <a href={APP_URL} className="transition-colors hover:text-content">Sign in</a>
              <a href="mailto:hello@mymakaranta.com" className="transition-colors hover:text-content">Contact</a>
              <a href="/privacy" className="transition-colors hover:text-content">Privacy</a>
            </nav>
            <p className="text-caption text-faint">&copy; {new Date().getFullYear()} myMakaranta</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
