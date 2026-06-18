import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Check, GraduationCap, Smartphone, WifiOff } from "lucide-react";
import { CountUp, Reveal } from "../components/motion-primitives";
import { FeatureShowcase } from "../components/feature-showcase";
import { Logomark } from "../components/logomark";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mymakaranta.com";

const HERO_STATS = [
  { label: "Present today", value: "412" },
  { label: "Fees collected", value: "₦2.4M" },
  { label: "Outstanding", value: "₦640K" },
];

const TRUST = [
  { icon: WifiOff, label: "Works offline" },
  { icon: Banknote, label: "Naira-native" },
  { icon: Smartphone, label: "Runs on a Tecno" },
  { icon: GraduationCap, label: "Set up in a day" },
];

const SOCIAL_PROOF = [
  { value: 3200, prefix: "", suffix: "+", label: "Students on the register" },
  { value: 18, prefix: "₦", suffix: "M+", label: "Fees reconciled" },
  { value: 98, prefix: "", suffix: "%", label: "Attendance accuracy" },
  { value: 14, prefix: "", suffix: "", label: "Schools, and counting" },
];

const TIERS = [
  {
    name: "Sprout",
    tagline: "For schools finding their feet",
    price: "Free",
    unit: "",
    limit: "Up to 100 students",
    highlight: false,
    features: ["Attendance tracking", "Basic fee management", "Student register", "1 admin user"],
  },
  {
    name: "Grow",
    tagline: "Small to mid-size schools",
    price: "₦1,500",
    unit: "/ student / term",
    limit: "101 – 300 students",
    highlight: false,
    features: ["Everything in Sprout", "Full fee ledger + receipts", "Result-sheet publishing", "5 staff users"],
  },
  {
    name: "Bloom",
    tagline: "The one most schools pick",
    price: "₦1,200",
    unit: "/ student / term",
    limit: "301 – 600 students",
    highlight: true,
    features: ["Everything in Grow", "Parent portal & alerts", "WhatsApp fee reminders", "Unlimited staff users"],
  },
  {
    name: "Flourish",
    tagline: "Large schools & groups",
    price: "₦950",
    unit: "/ student / term",
    limit: "601+ students",
    highlight: false,
    features: ["Everything in Bloom", "Multi-campus support", "Priority support line", "Custom report branding"],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-bark/10 bg-cream/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logomark className="h-7 w-7" />
            <span className="font-display text-xl font-600 tracking-tight text-bark">myMakaranta</span>
          </Link>
          <div className="hidden items-center gap-8 text-small text-stone md:flex">
            <a href="#features" className="transition-colors hover:text-bark">What it does</a>
            <a href="#pricing" className="transition-colors hover:text-bark">Pricing</a>
            <a href="#demo" className="transition-colors hover:text-bark">Demo</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href={APP_URL} className="px-3 py-2 text-small font-500 text-bark transition-colors hover:text-forest">
              Sign in
            </a>
            <a
              href={APP_URL}
              className="rounded-full bg-forest px-5 py-2.5 text-small font-500 text-cream transition-colors duration-300 hover:bg-forest-dark"
            >
              Start free
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <span className="text-caption font-500 uppercase tracking-[0.18em] text-forest">
                School management, made in Nigeria
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-5 font-display text-[clamp(2.75rem,6vw,4.5rem)] font-500 leading-[1.04] tracking-tight text-bark">
                Run a calmer,
                <br />
                <span className="italic text-forest">sharper</span> school.
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-[1.15rem] leading-relaxed text-stone">
                myMakaranta takes the register, reconciles the fees, and publishes the results — quietly,
                in the background — so your teachers can teach and your bursar can finally breathe. Built
                for Nigerian schools, priced in Naira, fast on the phones your staff already carry.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href={APP_URL}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-7 py-3.5 text-body font-500 text-cream transition-colors duration-300 hover:bg-forest-dark"
                >
                  Start free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center rounded-full ring-hair bg-transparent px-7 py-3.5 text-body font-500 text-bark transition-colors duration-300 hover:bg-bark/[0.04]"
                >
                  See a 15-minute demo
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-4 text-small text-stone">Free under 100 students. No card. No setup fee.</p>
            </Reveal>
          </div>

          {/* Hero image + floating stat card */}
          <Reveal delay={0.18} y={40}>
            <div className="relative">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] ring-hair">
                <Image
                  src="/images/students-joy.jpg"
                  alt="Nigerian schoolchildren in uniform, smiling"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-4 w-[15rem] rounded-2xl bg-cream p-4 shadow-[0_30px_70px_-30px_rgba(26,26,26,0.5)] ring-hair sm:-left-8">
                <p className="text-caption uppercase tracking-wider text-stone">Today at Unity College</p>
                <div className="mt-3 space-y-2.5">
                  {HERO_STATS.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="text-small text-stone">{s.label}</span>
                      <span className="font-display text-body font-600 tabular-nums text-bark">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Trust pills */}
        <Reveal delay={0.2}>
          <div className="mt-20 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-y border-bark/10 py-6">
            {TRUST.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 text-small text-stone">
                <t.icon className="h-4 w-4 text-forest" aria-hidden="true" />
                {t.label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Feature showcase */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal>
          <div className="max-w-2xl">
            <span className="text-caption font-500 uppercase tracking-[0.18em] text-forest">What it does</span>
            <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-500 leading-tight tracking-tight text-bark">
              The whole school day, handled.
            </h2>
            <p className="mt-4 text-body leading-relaxed text-stone">
              We built myMakaranta in the staff rooms and bursaries of real Nigerian schools. Every feature
              here earns its place. Tap one to watch it move.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-14">
            <FeatureShowcase />
          </div>
        </Reveal>
      </section>

      {/* Made for Nigeria — editorial image + text */}
      <section className="bg-cream-deep">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
          <Reveal y={40}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] ring-hair">
              <Image
                src="/images/uniform-portrait.jpg"
                alt="Students in school uniform"
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div>
              <span className="text-caption font-500 uppercase tracking-[0.18em] text-forest">Why it fits</span>
              <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-500 leading-tight tracking-tight text-bark">
                Built for how Nigerian schools actually run.
              </h2>
              <p className="mt-5 text-body leading-relaxed text-stone">
                Software written for somewhere else always shows. So we wrote this one here — for the
                realities your office knows by heart.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  "The network drops, the work doesn't. Take the register and check the timetable offline; everything syncs the moment you're back.",
                  "Fees in Naira, by transfer or card, matched to the right student automatically — receipts written, ledger balanced.",
                  "Light enough for a mid-range Android, and parents get results and reminders where they already are: on WhatsApp.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest/10">
                      <Check className="h-3 w-3 text-forest" aria-hidden="true" />
                    </span>
                    <span className="text-small leading-relaxed text-stone">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Community band — assembly image + count-up stats */}
      <section className="relative overflow-hidden">
        <Image
          src="/images/assembly.jpg"
          alt="Secondary-school assembly"
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-forest-dark/88" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <Reveal>
            <p className="max-w-xl font-display text-[clamp(1.5rem,3vw,2.25rem)] font-400 italic leading-snug text-cream">
              “The first term it just worked. The bursary stopped chasing paper and started chasing
              fees.”
            </p>
            <p className="mt-4 text-small text-cream/70">— Proprietor, secondary school in Ibadan</p>
          </Reveal>
          <div className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
            {SOCIAL_PROOF.map((item) => (
              <Reveal key={item.label}>
                <div>
                  <p className="font-display text-[clamp(2rem,4vw,2.75rem)] font-600 tabular-nums text-cream">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-1 text-small text-cream/70">{item.label}</p>
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
            <span className="text-caption font-500 uppercase tracking-[0.18em] text-forest">Pricing</span>
            <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-500 leading-tight tracking-tight text-bark">
              Pay per student, per term. Nothing hidden.
            </h2>
            <p className="mt-4 text-body leading-relaxed text-stone">
              Move up or down each term as your school grows. All prices in Naira, exclusive of VAT.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.06}>
              <div
                className={`flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 ${
                  tier.highlight
                    ? "bg-forest text-cream shadow-[0_30px_70px_-30px_rgba(70,95,92,0.7)]"
                    : "bg-white ring-hair"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-display text-h3 font-600 ${tier.highlight ? "text-cream" : "text-bark"}`}>
                      {tier.name}
                    </p>
                    <p className={`text-small ${tier.highlight ? "text-cream/70" : "text-stone"}`}>
                      {tier.tagline}
                    </p>
                  </div>
                  {tier.highlight && (
                    <span className="rounded-full bg-cream/15 px-2.5 py-1 text-caption font-500 text-cream">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-5">
                  <span className={`font-display text-h1 font-600 tabular-nums ${tier.highlight ? "text-cream" : "text-bark"}`}>
                    {tier.price}
                  </span>
                  {tier.unit && (
                    <span className={`ml-1 text-small ${tier.highlight ? "text-cream/70" : "text-stone"}`}>
                      {tier.unit}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-caption ${tier.highlight ? "text-cream/60" : "text-stone"}`}>{tier.limit}</p>

                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className={`flex items-start gap-2 text-small ${tier.highlight ? "text-cream/90" : "text-stone"}`}>
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tier.highlight ? "text-cream" : "text-forest"}`} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.price === "Free" ? APP_URL : "#demo"}
                  className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-small font-500 transition-colors duration-300 ${
                    tier.highlight
                      ? "bg-cream text-forest-dark hover:bg-white"
                      : "ring-hair text-bark hover:bg-bark/[0.04]"
                  }`}
                >
                  {tier.price === "Free" ? "Get started free" : "Book a demo"}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Demo CTA — forest band */}
      <section id="demo" className="bg-forest">
        <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
          <Reveal>
            <span className="text-caption font-500 uppercase tracking-[0.18em] text-cream/70">
              A real walkthrough
            </span>
            <h2 className="mt-5 font-display text-[clamp(2rem,4.5vw,3.25rem)] font-500 leading-tight tracking-tight text-cream">
              See it running your school in fifteen minutes.
            </h2>
            <p className="mt-5 text-body leading-relaxed text-cream/80">
              No slides. No sales pitch. We load your real classes and your real fee structure, then hand
              you the product. Bring your toughest questions.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href="mailto:demo@mymakaranta.com?subject=Book%20a%20demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cream px-7 py-3.5 text-body font-500 text-forest-dark transition-colors duration-300 hover:bg-white sm:w-auto"
              >
                Request a demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={APP_URL}
                className="inline-flex w-full items-center justify-center rounded-full border border-cream/30 px-7 py-3.5 text-body font-500 text-cream transition-colors duration-300 hover:bg-cream/10 sm:w-auto"
              >
                Or start free
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bark/10 bg-cream">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <Logomark className="h-6 w-6" />
              <span className="font-display text-lg font-600 tracking-tight text-bark">myMakaranta</span>
            </Link>
            <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-small text-stone">
              <a href="#features" className="transition-colors hover:text-bark">What it does</a>
              <a href="#pricing" className="transition-colors hover:text-bark">Pricing</a>
              <a href="#demo" className="transition-colors hover:text-bark">Demo</a>
              <a href={APP_URL} className="transition-colors hover:text-bark">Sign in</a>
              <a href="mailto:hello@mymakaranta.com" className="transition-colors hover:text-bark">Contact</a>
              <a href="/privacy" className="transition-colors hover:text-bark">Privacy</a>
            </nav>
            <p className="text-caption text-stone">
              &copy; {new Date().getFullYear()} myMakaranta
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
