import Link from "next/link";
import { Badge, Button, Card, CardBody, CardHeader } from "@mymakaranta/ui";
import {
  Clock,
  CreditCard,
  FileText,
  Smartphone,
  CheckCircle,
  ArrowRight,
  GraduationCap,
} from "lucide-react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mymakaranta.com";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper dark:bg-paper-dark">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-ink-300/50 bg-paper/90 backdrop-blur-sm dark:border-white/10 dark:bg-paper-dark/90">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-700 text-brand-500">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
            <span>myMakaranta</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href={APP_URL}>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </a>
            <a href="#demo">
              <Button variant="primary" size="sm">
                Book a demo
              </Button>
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="warning" className="mb-6 inline-flex">
            Built for Nigerian secondary schools
          </Badge>

          <h1 className="font-display text-display font-700 leading-[1.05] tracking-tight text-ink-1000 dark:text-ink-100">
            The school platform Nigerian schools actually want to use.
          </h1>

          <p className="mt-6 text-h3 font-400 leading-relaxed text-ink-700 dark:text-ink-300">
            myMakaranta brings consumer-grade craft to school administration — attendance in seconds,
            fees in Naira that reconcile themselves, and report cards parents screenshot and share.
            Works on a Tecno. Works offline.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a href="#demo">
              <Button variant="primary" size="lg" className="w-full sm:w-auto">
                Book a free demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </a>
            <a href={APP_URL}>
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Start free — no card needed
              </Button>
            </a>
          </div>

          <p className="mt-4 text-small text-ink-500">
            Free for schools under 100 students. No setup fee. Cancel anytime.
          </p>
        </div>

        {/* Hero visual placeholder */}
        <div className="mt-16 overflow-hidden rounded-sheet border border-ink-300/50 bg-surface shadow-xl dark:border-white/10 dark:bg-surface-dark">
          <div className="flex items-center gap-1.5 border-b border-ink-100 px-4 py-3 dark:border-white/10">
            <div className="h-3 w-3 rounded-full bg-error/60" />
            <div className="h-3 w-3 rounded-full bg-warning/60" />
            <div className="h-3 w-3 rounded-full bg-success/60" />
            <span className="ml-3 text-caption text-ink-500">myMakaranta — Dashboard</span>
          </div>
          <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
            {[
              { label: "Present today", value: "412", tone: "text-success" },
              { label: "Fees collected", value: "₦2.4M", tone: "text-brand-500" },
              { label: "Outstanding", value: "₦640K", tone: "text-warning" },
              { label: "Classes active", value: "18", tone: "text-ink-1000 dark:text-ink-100" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-card border border-ink-100 bg-paper p-4 dark:border-white/10 dark:bg-surface-dark">
                <p className="text-caption text-ink-500">{stat.label}</p>
                <p className={`mt-1 font-display text-h2 font-700 tabular-nums ${stat.tone}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="bg-surface py-16 dark:bg-surface-dark sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-h1 font-700 text-ink-1000 dark:text-ink-100">
              Everything your school needs. Nothing it doesn&apos;t.
            </h2>
            <p className="mt-4 text-body text-ink-700 dark:text-ink-300">
              Built from real conversations with proprietors, principals, and bursars across Nigeria.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Clock,
                title: "Attendance in 30 seconds",
                description:
                  "Tap once per student. Mark the whole class in under a minute. Absent notes land in parents' inboxes automatically.",
                accent: "bg-brand-50 text-brand-500 dark:bg-brand-500/20 dark:text-brand-300",
              },
              {
                icon: CreditCard,
                title: "Fees that reconcile themselves",
                description:
                  "Collect school fees in Naira via bank transfer or card. Ledgers update instantly. Bursar reports write themselves.",
                accent: "bg-success/10 text-success",
              },
              {
                icon: FileText,
                title: "Report cards parents screenshot",
                description:
                  "Publish polished result sheets with one click. Parents see them immediately, share on WhatsApp, and thank you for it.",
                accent: "bg-saffron-100 text-saffron-700",
              },
              {
                icon: Smartphone,
                title: "Works on a Tecno",
                description:
                  "Optimised for mid-range Android. Loads fast on 4G or 3G. Core features keep working offline — attendance, roll call, timetable.",
                accent: "bg-info/10 text-info",
              },
            ].map((prop) => (
              <Card key={prop.title} tone="base" elevation="sm" className="flex flex-col">
                <CardHeader>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-card ${prop.accent}`}>
                    <prop.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-h3 font-600 text-ink-1000 dark:text-ink-100">
                    {prop.title}
                  </h3>
                </CardHeader>
                <CardBody>
                  <p className="text-small text-ink-700 dark:text-ink-300">{prop.description}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-y border-ink-300/50 bg-paper py-10 dark:border-white/10 dark:bg-paper-dark">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 text-center">
            {[
              { stat: "3,200+", label: "Students managed" },
              { stat: "₦18M+", label: "Fees processed" },
              { stat: "98%", label: "Attendance accuracy" },
              { stat: "14", label: "Schools onboarded" },
            ].map((item) => (
              <div key={item.label} className="min-w-[120px]">
                <p className="font-display text-h1 font-700 tabular-nums text-brand-500">
                  {item.stat}
                </p>
                <p className="mt-1 text-small text-ink-700 dark:text-ink-300">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface py-16 dark:bg-surface-dark sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="brand" className="mb-4 inline-flex">
              Simple, honest pricing
            </Badge>
            <h2 className="font-display text-h1 font-700 text-ink-1000 dark:text-ink-100">
              Pay per student, per term.
            </h2>
            <p className="mt-4 text-body text-ink-700 dark:text-ink-300">
              No hidden fees. No annual lock-in. Upgrade or downgrade each term as your school grows.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: "Sprout",
                tagline: "Perfect for starting out",
                price: "Free",
                unit: "",
                limit: "Up to 100 students",
                highlight: false,
                features: [
                  "Attendance tracking",
                  "Basic fee management",
                  "Student register",
                  "1 admin user",
                ],
              },
              {
                name: "Grow",
                tagline: "Small to mid-size schools",
                price: "₦1,500",
                unit: "/ student / term",
                limit: "101 – 300 students",
                highlight: false,
                features: [
                  "Everything in Sprout",
                  "Full fee ledger + receipts",
                  "Result sheet publishing",
                  "5 staff users",
                ],
              },
              {
                name: "Bloom",
                tagline: "Most popular",
                price: "₦1,200",
                unit: "/ student / term",
                limit: "301 – 600 students",
                highlight: true,
                features: [
                  "Everything in Grow",
                  "Parent portal & notifications",
                  "WhatsApp fee reminders",
                  "Unlimited staff users",
                ],
              },
              {
                name: "Flourish",
                tagline: "Large schools & groups",
                price: "₦950",
                unit: "/ student / term",
                limit: "601+ students",
                highlight: false,
                features: [
                  "Everything in Bloom",
                  "Multi-campus support",
                  "Priority support line",
                  "Custom report branding",
                ],
              },
            ].map((tier) => (
              <Card
                key={tier.name}
                tone="base"
                elevation={tier.highlight ? "md" : "sm"}
                className={`flex flex-col ${
                  tier.highlight
                    ? "border-brand-500 ring-2 ring-brand-500"
                    : ""
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-h3 font-700 text-ink-1000 dark:text-ink-100">{tier.name}</p>
                      <p className="text-small text-ink-500">{tier.tagline}</p>
                    </div>
                    {tier.highlight && (
                      <Badge tone="brand">Popular</Badge>
                    )}
                  </div>
                  <div className="mt-4">
                    <span className="font-display text-h1 font-700 tabular-nums text-ink-1000 dark:text-ink-100">
                      {tier.price}
                    </span>
                    {tier.unit && (
                      <span className="ml-1 text-small text-ink-500">{tier.unit}</span>
                    )}
                  </div>
                  <p className="mt-1 text-caption text-ink-500">{tier.limit}</p>
                </CardHeader>
                <CardBody className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-2.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-small text-ink-700 dark:text-ink-300">
                        <CheckCircle
                          className="mt-0.5 h-4 w-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <a href="#demo" className="block">
                      <Button
                        variant={tier.highlight ? "primary" : "outline"}
                        size="md"
                        className="w-full"
                      >
                        {tier.price === "Free" ? "Get started free" : "Book a demo"}
                      </Button>
                    </a>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          <p className="mt-8 text-center text-small text-ink-500">
            All prices in Nigerian Naira (₦) and exclusive of VAT. Billing is per academic term.
          </p>
        </div>
      </section>

      {/* Demo CTA */}
      <section
        id="demo"
        className="bg-brand-900 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Badge tone="brand" className="mb-6 inline-flex bg-brand-700 text-brand-100">
            15-minute demo
          </Badge>
          <h2 className="font-display text-h1 font-700 text-white">
            See myMakaranta running your school in 15 minutes.
          </h2>
          <p className="mt-4 text-body text-brand-300">
            We&apos;ll set up a live walkthrough with your real school data — fee structure, class lists,
            term dates. No slides, no sales pitch. Just the product.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a href="mailto:demo@mymakaranta.com?subject=Book%20a%20demo">
              <Button
                variant="primary"
                size="lg"
                className="w-full bg-saffron-500 text-ink-1000 hover:bg-saffron-700 hover:text-white sm:w-auto"
              >
                Request a demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </a>
            <a href={APP_URL}>
              <Button
                variant="outline"
                size="lg"
                className="w-full border-brand-700 text-white hover:bg-brand-700 sm:w-auto"
              >
                Or sign up free
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-300/50 bg-paper py-10 dark:border-white/10 dark:bg-paper-dark">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-700 text-brand-500">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
              <span>myMakaranta</span>
            </Link>

            <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-small text-ink-700 dark:text-ink-300">
              <a href="#pricing" className="hover:text-ink-1000 dark:hover:text-ink-100">Pricing</a>
              <a href="#demo" className="hover:text-ink-1000 dark:hover:text-ink-100">Book a demo</a>
              <a href={APP_URL} className="hover:text-ink-1000 dark:hover:text-ink-100">Sign in</a>
              <a href="mailto:hello@mymakaranta.com" className="hover:text-ink-1000 dark:hover:text-ink-100">Contact</a>
              <a href="/privacy" className="hover:text-ink-1000 dark:hover:text-ink-100">Privacy</a>
            </nav>

            <p className="text-caption text-ink-500">
              &copy; {new Date().getFullYear()} myMakaranta. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
