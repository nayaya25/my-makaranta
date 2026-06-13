"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
} from "@mymakaranta/ui";
import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/auth";
import { CheckCircle2 } from "lucide-react";

type Step = "school" | "academic-year" | "class-levels" | "done";

const STEPS: Step[] = ["school", "academic-year", "class-levels", "done"];

const STEP_LABELS: Record<Step, string> = {
  school: "Your School",
  "academic-year": "Academic Year",
  "class-levels": "Class Levels",
  done: "All Set",
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

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.filter((s) => s !== "done").map((step, i) => {
        const stepIdx = STEPS.indexOf(step);
        const done = stepIdx < idx;
        const active = stepIdx === idx;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                "flex h-6 w-6 items-center justify-center rounded-pill text-caption font-semibold",
                done
                  ? "bg-brand-500 text-white"
                  : active
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                    : "bg-ink-100 text-ink-500 dark:bg-white/8",
              ].join(" ")}
            >
              {done ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span
              className={[
                "text-caption hidden sm:block",
                active
                  ? "text-ink-1000 dark:text-ink-100 font-medium"
                  : "text-ink-500",
              ].join(" ")}
            >
              {STEP_LABELS[step]}
            </span>
            {i < STEPS.filter((s) => s !== "done").length - 1 && (
              <div
                className={[
                  "h-px w-6 sm:w-10",
                  done ? "bg-brand-500" : "bg-ink-200 dark:bg-white/10",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
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
        session.save(token, {
          ...currentUser,
          schoolId: school.id,
          identityType: "PROPRIETOR",
        });
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
      <Button type="submit" disabled={busy || !name.trim()}>
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

  function updateTerm(
    i: number,
    field: "startDate" | "endDate",
    value: string,
  ) {
    setTerms((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)),
    );
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
        <Input
          id="year-name"
          value={yearName}
          onChange={(e) => setYearName(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor="year-start">
          <Input
            id="year-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </Field>
        <Field label="End date" htmlFor="year-end">
          <Input
            id="year-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-small font-medium text-ink-700 dark:text-ink-300">Terms</p>
        {terms.map((term, i) => (
          <div
            key={term.number}
            className="rounded-input border border-ink-200 dark:border-white/10 p-3 flex flex-col gap-3"
          >
            <p className="text-caption font-semibold text-ink-500">Term {term.number}</p>
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

      <Button type="submit" disabled={busy}>
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
              aria-label={`Remove ${level.name}`}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addLevel}>
        + Add level
      </Button>
      <Button type="submit" disabled={busy || levels.filter((l) => l.name.trim()).length === 0}>
        {busy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

// ---------- Done ----------
function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="bg-success/10 text-success rounded-pill p-4">
        <CheckCircle2 size={40} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">
          Your school is ready!
        </h2>
        <p className="text-small text-ink-500">
          Now add your first students to get started.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onFinish}>Go to Students</Button>
      </div>
    </div>
  );
}

// ---------- Main ----------
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("school");

  function next() {
    const idx = STEPS.indexOf(step);
    const nextStep = STEPS[idx + 1];
    if (nextStep) setStep(nextStep);
  }

  const STEP_TITLES: Record<Step, string> = {
    school: "Set up your school",
    "academic-year": "Current academic year",
    "class-levels": "Class levels",
    done: "All set!",
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12 bg-paper dark:bg-paper-dark">
      <div className="w-full max-w-lg">
        {step !== "done" && <StepIndicator current={step} />}
        <Card elevation="md">
          <CardHeader>
            <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">
              {STEP_TITLES[step]}
            </h1>
          </CardHeader>
          <CardBody>
            {step === "school" && <SchoolStep onNext={next} />}
            {step === "academic-year" && <AcademicYearStep onNext={next} />}
            {step === "class-levels" && <ClassLevelsStep onNext={next} />}
            {step === "done" && <DoneStep onFinish={() => router.push("/students")} />}
          </CardBody>
          {step !== "done" && step !== "school" && (
            <CardFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const idx = STEPS.indexOf(step);
                  const prevStep = STEPS[idx - 1];
                  if (prevStep) setStep(prevStep);
                }}
              >
                Back
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </main>
  );
}
