"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, CreditCard, FileText, Megaphone } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Feature = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
};

const FEATURES: Feature[] = [
  {
    key: "attendance",
    icon: Clock,
    title: "Attendance",
    blurb: "Mark a class in under a minute. Parents of absentees hear from you before assembly ends.",
  },
  {
    key: "fees",
    icon: CreditCard,
    title: "Fees",
    blurb: "Naira in, ledger updated, receipt written. Every transfer matched without a spreadsheet in sight.",
  },
  {
    key: "results",
    icon: FileText,
    title: "Results",
    blurb: "Publish a polished result sheet in one click. Families see it the same minute, and screenshot it.",
  },
  {
    key: "announcements",
    icon: Megaphone,
    title: "Announcements",
    blurb: "Say it once, reach every parent — and see exactly who has read it.",
  },
];

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg ring-hair bg-cream/60 px-4 py-2.5">
      {children}
    </div>
  );
}

function Panel({ k }: { k: string }) {
  if (k === "attendance") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-small text-stone">JSS 1A · Morning roll call</span>
          <span className="rounded-pill bg-success/10 px-2.5 py-1 text-caption font-600 text-success">
            Marked in 28s
          </span>
        </div>
        {["Ada Eze", "Bola Okoro", "Chidi Nwosu", "Fatima Bello"].map((n, i) => (
          <Row key={n}>
            <span className="text-small text-bark">{n}</span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${
                i === 2 ? "bg-error/80" : "bg-success"
              }`}
            >
              {i === 2 ? "✕" : <Check className="h-3.5 w-3.5" />}
            </span>
          </Row>
        ))}
      </div>
    );
  }
  if (k === "fees") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg ring-hair bg-cream/60 p-4">
            <p className="text-caption text-stone">Collected</p>
            <p className="mt-1 font-display text-h2 font-600 tabular-nums text-forest">₦2.4M</p>
          </div>
          <div className="rounded-lg ring-hair bg-cream/60 p-4">
            <p className="text-caption text-stone">Outstanding</p>
            <p className="mt-1 font-display text-h2 font-600 tabular-nums text-bark">₦640K</p>
          </div>
        </div>
        <Row>
          <div>
            <p className="text-small text-bark">Transfer · Ada Eze</p>
            <p className="text-caption text-stone">Ref TRX-0091 · ₦45,000</p>
          </div>
          <span className="rounded-pill bg-success/10 px-2.5 py-1 text-caption font-600 text-success">
            Reconciled
          </span>
        </Row>
      </div>
    );
  }
  if (k === "results") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-small text-stone">First Term · JSS 1A · Ada Eze</span>
          <span className="rounded-pill bg-forest/10 px-2.5 py-1 text-caption font-600 text-forest">
            Published
          </span>
        </div>
        {[
          ["Mathematics", "92", "A"],
          ["English", "85", "A"],
          ["Basic Science", "78", "B"],
        ].map(([subj, score, grade]) => (
          <Row key={subj}>
            <span className="text-small text-bark">{subj}</span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums text-small text-stone">{score}</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-caption font-700 text-forest">
                {grade}
              </span>
            </span>
          </Row>
        ))}
        <p className="text-caption text-stone">Parents notified on WhatsApp · 2 min ago</p>
      </div>
    );
  }
  // announcements
  return (
    <div className="space-y-4">
      <div className="rounded-lg ring-hair bg-cream/60 p-4">
        <p className="text-small font-600 text-bark">Mid-term break</p>
        <p className="mt-1 text-small text-stone">
          School resumes Monday 14th. Buses run the normal schedule.
        </p>
      </div>
      <Row>
        <span className="text-small text-stone">Sent to 312 parents</span>
        <span className="rounded-pill bg-forest/10 px-2.5 py-1 text-caption font-600 text-forest">
          286 read
        </span>
      </Row>
    </div>
  );
}

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setActive((a) => (a + 1) % FEATURES.length), 4500);
    return () => clearInterval(id);
  }, [auto]);

  const select = (i: number) => {
    setAuto(false);
    setActive(i);
  };

  const current = FEATURES[active]!;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Selectable feature list */}
      <div className="flex flex-col gap-3">
        {FEATURES.map((f, i) => {
          const isActive = i === active;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => select(i)}
              aria-pressed={isActive}
              className={`group relative overflow-hidden rounded-xl px-5 py-4 text-left transition-all duration-300 ${
                isActive ? "bg-white shadow-[0_18px_50px_-24px_rgba(26,26,26,0.35)] ring-hair" : "ring-hair hover:bg-white/60"
              }`}
            >
              {isActive && (
                <motion.span layoutId="feature-bar" className="absolute inset-y-0 left-0 w-1 bg-forest" />
              )}
              <div className="flex items-start gap-4">
                <span
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive ? "bg-forest text-cream" : "bg-forest/10 text-forest"
                  }`}
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-h3 font-600 text-bark">{f.title}</h3>
                  <p className="mt-1 text-small leading-relaxed text-stone">{f.blurb}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Morphing product panel */}
      <div className="relative min-h-[22rem]">
        <div className="grain relative h-full overflow-hidden rounded-2xl bg-white p-5 shadow-[0_30px_80px_-40px_rgba(26,26,26,0.4)] ring-hair">
          <div className="relative z-10 flex items-center gap-1.5 border-b border-bark/10 pb-3">
            <span className="h-2.5 w-2.5 rounded-full bg-error/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
            <span className="ml-3 text-caption text-stone">myMakaranta — {current.title}</span>
          </div>
          <div className="relative z-10 pt-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <Panel k={current.key} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
