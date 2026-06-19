"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, cn } from "@mymakaranta/ui";
import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/auth";
import { CheckCircle2, GraduationCap } from "lucide-react";

type Step = "school" | "academic-year" | "class-levels" | "done";

const STEPS: Step[] = ["school", "academic-year", "class-levels", "done"];

const STEP_LABELS: Record<Step, string> = {
  school: "Your school",
  "academic-year": "Academic year",
  "class-levels": "Class levels",
  done: "All set",
};

const STEP_TITLES: Record<Step, string> = {
  school: "Set up your school",
  "academic-year": "Current academic year",
  "class-levels": "Class levels",
  done: "All set!",
};

const STEP_DESC: Record<Step, string> = {
  school: "Tell us about your school. You can change any of this later.",
  "academic-year": "Set the current session and its three terms.",
  "class-levels": "Add the levels your school runs — e.g. JSS 1 through SS 3.",
  done: "",
};

const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];
// Values are the API CountryCode enum; labels are display-only.
const COUNTRIES = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
];

const DEFAULT_CLASS_LEVELS = [
  { name: "JSS 1", order: 1 },
  { name: "JSS 2", order: 2 },
  { name: "JSS 3", order: 3 },
  { name: "SS 1", order: 4 },
  { name: "SS 2", order: 5 },
  { name: "SS 3", order: 6 },
];

const FORM_STEPS = STEPS.filter((s) => s !== "done");

/** Vertical stepper shown in the brand panel (desktop only). */
function VerticalSteps({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <ol className="mt-10 flex flex-col gap-1.5">
      {FORM_STEPS.map((step, i) => {
        const stepIdx = STEPS.indexOf(step);
        const done = stepIdx < idx;
        const active = stepIdx === idx;
        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors",
              active && "bg-white/10",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                done
                  ? "bg-white text-brand-700"
                  : active
                    ? "bg-white/20 text-white ring-1 ring-white/40"
                    : "bg-white/10 text-white/50",
              )}
            >
              {done ? <CheckCircle2 size={15} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "text-small",
                active ? "font-semibold text-white" : done ? "text-white/80" : "text-white/50",
              )}
            >
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Step 1: School ----------
function SchoolStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [country, setCountry] = useState("NG");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { school, token } = await api.createSchool({ name, currency, country });
      const currentUser = session.user();
      if (currentUser) {
        session.save(token, { ...currentUser, schoolId: school.id, identityType: "PROPRIETOR" });
      }
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create school. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="School name" htmlFor="school-name" error={error ?? undefined}>
        <Input
          id="school-name"
          placeholder="e.g. Bright Future Academy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          invalid={!!error}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country" htmlFor="country">
          <Select.Root value={country} onValueChange={setCountry}>
            <Select.Trigger id="country">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {COUNTRIES.map((c) => (
                <Select.Item key={c.code} value={c.code}>
                  {c.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select.Root value={currency} onValueChange={setCurrency}>
            <Select.Trigger id="currency">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {CURRENCIES.map((c) => (
                <Select.Item key={c} value={c}>
                  {c}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={busy || !name.trim()} className="mt-1 w-full">
        {busy ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}

// ---------- Step 2: Academic Year ----------
function AcademicYearStep({ onNext }: { onNext: () => void }) {
  const currentYear = new Date().getFullYear();
  const [yearName, setYearName] = useState(`${currentYear}/${currentYear + 1}`);
  const [startDate, setStartDate] = useState(`${currentYear}-09-01`);
  const [endDate, setEndDate] = useState(`${currentYear + 1}-07-31`);
  const [terms, setTerms] = useState([
    { number: 1, startDate: `${currentYear}-09-01`, endDate: `${currentYear}-12-15`, isCurrent: true },
    { number: 2, startDate: `${currentYear + 1}-01-08`, endDate: `${currentYear + 1}-04-04` },
    { number: 3, startDate: `${currentYear + 1}-04-22`, endDate: `${currentYear + 1}-07-31` },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateTerm(i: number, field: "startDate" | "endDate", value: string) {
    setTerms((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createAcademicYear({ name: yearName, startDate, endDate, terms });
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create academic year. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <p className="text-small text-error" role="alert">
          {error}
        </p>
      )}
      <Field label="Academic year name" htmlFor="year-name">
        <Input id="year-name" value={yearName} onChange={(e) => setYearName(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor="year-start">
          <Input id="year-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="End date" htmlFor="year-end">
          <Input id="year-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-small font-medium text-ink-700 dark:text-ink-300">Terms</p>
        {terms.map((term, i) => (
          <div
            key={term.number}
            className="flex flex-col gap-3 rounded-[12px] border border-ink-1000/[0.08] p-3.5 dark:border-white/10"
          >
            <p className="text-caption font-semibold uppercase tracking-wide text-ink-500">Term {term.number}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" htmlFor={`term-${i}-start`}>
                <Input
                  id={`term-${i}-start`}
                  type="date"
                  value={term.startDate}
                  onChange={(e) => updateTerm(i, "startDate", e.target.value)}
                  required
                />
              </Field>
              <Field label="End" htmlFor={`term-${i}-end`}>
                <Input
                  id={`term-${i}-end`}
                  type="date"
                  value={term.endDate}
                  onChange={(e) => updateTerm(i, "endDate", e.target.value)}
                  required
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
        {busy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

// ---------- Step 3: Class Levels ----------
function ClassLevelsStep({ onNext }: { onNext: () => void }) {
  const [levels, setLevels] = useState(DEFAULT_CLASS_LEVELS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateLevel(i: number, field: "name" | "order", value: string) {
    setLevels((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, [field]: field === "order" ? parseInt(value, 10) || 0 : value } : l,
      ),
    );
  }

  function addLevel() {
    setLevels((prev) => [...prev, { name: "", order: prev.length + 1 }]);
  }

  function removeLevel(i: number) {
    setLevels((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createClassLevels(levels.filter((l) => l.name.trim()));
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save class levels. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <p className="text-small text-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1 text-caption font-semibold uppercase tracking-wide text-ink-500">
          <span className="flex-1">Level name</span>
          <span className="w-16 text-center">Order</span>
          <span className="w-9" />
        </div>
        {levels.map((level, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Class level ${i + 1} name`}
              placeholder="e.g. JSS 1"
              value={level.name}
              onChange={(e) => updateLevel(i, "name", e.target.value)}
              className="flex-1"
            />
            <Input
              aria-label={`Class level ${i + 1} order`}
              type="number"
              min={1}
              value={level.order}
              onChange={(e) => updateLevel(i, "order", e.target.value)}
              className="w-16 tabular-nums"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeLevel(i)}
              aria-label={`Remove ${level.name || `level ${i + 1}`}`}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addLevel} className="self-start">
        + Add level
      </Button>
      <Button
        type="submit"
        size="lg"
        disabled={busy || levels.filter((l) => l.name.trim()).length === 0}
        className="mt-1 w-full"
      >
        {busy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

// ---------- Done ----------
function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={36} aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
          Your school is ready!
        </h1>
        <p className="max-w-sm text-small text-ink-500">
          Everything&apos;s set up. Add your first students to start enrolling, recording results, and collecting fees.
        </p>
      </div>
      <Button onClick={onFinish} size="lg" className="w-full sm:w-auto">
        Go to Students
      </Button>
    </div>
  );
}

// ---------- Main ----------
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("school");
  const idx = STEPS.indexOf(step);

  function next() {
    const nextStep = STEPS[idx + 1];
    if (nextStep) setStep(nextStep);
  }

  function back() {
    const prevStep = STEPS[idx - 1];
    if (prevStep) setStep(prevStep);
  }

  return (
    <main className="flex min-h-screen bg-paper dark:bg-paper-dark">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden w-[42%] max-w-md flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15">
            <GraduationCap size={20} aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">myMakaranta</span>
        </div>

        <div className="relative">
          <h2 className="max-w-sm font-display text-h2 font-bold leading-tight">
            Let&apos;s get your school running.
          </h2>
          <p className="mt-3 max-w-xs text-small leading-relaxed text-white/70">
            A few quick steps and you&apos;ll be ready to enroll students, record results, and collect fees.
          </p>
          <VerticalSteps current={step} />
        </div>

        <p className="relative text-caption text-white/50">Built for schools across Nigeria.</p>
      </aside>

      {/* Form side */}
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand mark */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500 text-white">
              <GraduationCap size={18} aria-hidden />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink-1000 dark:text-ink-100">
              myMakaranta
            </span>
          </div>

          {/* Mobile progress bar */}
          {step !== "done" && (
            <div className="mb-7 flex gap-1.5 lg:hidden">
              {FORM_STEPS.map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    STEPS.indexOf(s) <= idx ? "bg-brand-500" : "bg-ink-1000/10 dark:bg-white/10",
                  )}
                />
              ))}
            </div>
          )}

          {step !== "done" && (
            <div className="mb-6">
              <p className="text-caption font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                Step {idx + 1} of {FORM_STEPS.length}
              </p>
              <h1 className="mt-1.5 font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
                {STEP_TITLES[step]}
              </h1>
              <p className="mt-1.5 text-small leading-relaxed text-ink-500">{STEP_DESC[step]}</p>
            </div>
          )}

          {step === "school" && <SchoolStep onNext={next} />}
          {step === "academic-year" && <AcademicYearStep onNext={next} />}
          {step === "class-levels" && <ClassLevelsStep onNext={next} />}
          {step === "done" && <DoneStep onFinish={() => router.push("/students")} />}

          {step !== "done" && step !== "school" && (
            <button
              type="button"
              onClick={back}
              className="mt-5 text-small font-medium text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
            >
              ← Back
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
