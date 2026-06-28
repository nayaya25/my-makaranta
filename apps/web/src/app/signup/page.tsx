"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button, Field, Input, Select, cn } from "@mymakaranta/ui";
import { Check, GraduationCap, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { checkSlug, signup, ApiError, type SignupBody } from "@/lib/api";

// ── Constants ────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
];

const SCHOOL_TYPES = [
  { value: "PRIMARY", label: "Primary School" },
  { value: "SECONDARY", label: "Secondary School" },
  { value: "TERTIARY", label: "Tertiary Institution" },
  { value: "OTHER", label: "Other" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const HIGHLIGHTS = [
  "Live slug availability — claim your school’s address",
  "One transaction: school + owner account created together",
  "Walk in to your school’s own subdomain immediately",
];

// ── Password policy ───────────────────────────────────────────────────────────

interface PolicyCheck {
  label: string;
  ok: (pw: string) => boolean;
}

const PASSWORD_POLICY: PolicyCheck[] = [
  { label: "At least 8 characters", ok: (pw) => pw.length >= 8 },
  { label: "Uppercase letter", ok: (pw) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", ok: (pw) => /[a-z]/.test(pw) },
  { label: "Number", ok: (pw) => /[0-9]/.test(pw) },
  { label: "Special character (!@#$…)", ok: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function passwordValid(pw: string) {
  return PASSWORD_POLICY.every((p) => p.ok(pw));
}

// ── Slug availability state ───────────────────────────────────────────────────

type SlugStatus = "idle" | "checking" | "available" | "unavailable";

// ── Step 1 data shape ─────────────────────────────────────────────────────────

interface Step1Data {
  schoolName: string;
  slug: string;
  country: string;
  type: string;
}

// ── Step 2 data shape ─────────────────────────────────────────────────────────

interface Step2Data {
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  phone: string;
  password: string;
}

// ── Step 1: About the School ──────────────────────────────────────────────────

interface Step1Props {
  initial: Step1Data;
  onNext: (data: Step1Data) => void;
}

function Step1({ initial, onNext }: Step1Props) {
  const [schoolName, setSchoolName] = useState(initial.schoolName);
  const [slug, setSlug] = useState(initial.slug);
  const [country, setCountry] = useState(initial.country);
  const [type, setType] = useState(initial.type);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugReason, setSlugReason] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSlugDebounced = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setSlugStatus("idle");
      setSlugReason(null);
      return;
    }
    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkSlug(trimmed);
        if (result.available) {
          setSlugStatus("available");
          setSlugReason(null);
        } else {
          setSlugStatus("unavailable");
          setSlugReason(result.reason);
        }
      } catch {
        setSlugStatus("idle");
        setSlugReason(null);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSlugChange(value: string) {
    const normalised = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(normalised);
    checkSlugDebounced(normalised);
  }

  const canContinue =
    schoolName.trim().length > 0 &&
    slug.trim().length > 0 &&
    slugStatus === "available" &&
    country.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    onNext({ schoolName: schoolName.trim(), slug: slug.trim(), country, type });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="School name" htmlFor="s1-school-name">
        <Input
          id="s1-school-name"
          placeholder="e.g. Bright Future Academy"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          required
        />
      </Field>

      <Field
        label="School address (slug)"
        htmlFor="s1-slug"
        hint={`Your school URL: ${slug || "yourschool"}.mymakaranta.com`}
        error={slugStatus === "unavailable" ? (slugReason ?? "Slug is taken") : undefined}
      >
        <div className="relative">
          <Input
            id="s1-slug"
            placeholder="e.g. brightfuture"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            invalid={slugStatus === "unavailable"}
            required
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            {slugStatus === "checking" && (
              <Loader2 className="h-4 w-4 animate-spin text-ink-400" aria-label="Checking" />
            )}
            {slugStatus === "available" && (
              <CheckCircle2 className="h-4 w-4 text-success" aria-label="Available" />
            )}
            {slugStatus === "unavailable" && (
              <XCircle className="h-4 w-4 text-error" aria-label="Unavailable" />
            )}
          </span>
        </div>
        {slugStatus === "available" && (
          <p className="mt-1 text-caption text-success">
            {slug}.mymakaranta.com is available
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Country" htmlFor="s1-country">
          <Select.Root value={country} onValueChange={setCountry}>
            <Select.Trigger id="s1-country">
              <Select.Value placeholder="Select country" />
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

        <Field label="School type" htmlFor="s1-type">
          <Select.Root value={type} onValueChange={setType}>
            <Select.Trigger id="s1-type">
              <Select.Value placeholder="Select type" />
            </Select.Trigger>
            <Select.Content>
              {SCHOOL_TYPES.map((t) => (
                <Select.Item key={t.value} value={t.value}>
                  {t.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
      </div>

      <Button type="submit" size="lg" disabled={!canContinue} className="mt-1 w-full">
        Continue
      </Button>
    </form>
  );
}

// ── Step 2: About You ─────────────────────────────────────────────────────────

interface Step2Props {
  initial: Step2Data;
  step1: Step1Data;
  onBack: () => void;
  onSuccess: (slug: string) => void;
}

function Step2({ initial, step1, onBack, onSuccess }: Step2Props) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [gender, setGender] = useState(initial.gender);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [password, setPassword] = useState(initial.password);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwValid = passwordValid(password);
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    gender.length > 0 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    phone.replace(/\D/g, "").length >= 10 &&
    pwValid &&
    agreed;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const body: SignupBody = {
        schoolName: step1.schoolName,
        slug: step1.slug,
        country: step1.country,
        ...(step1.type ? { type: step1.type } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        email: email.trim(),
        phone: phone.trim(),
        password,
      };
      const result = await signup(body);
      onSuccess(result.slug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-error/10 px-4 py-2.5 text-small text-error" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="s2-first">
          <Input
            id="s2-first"
            placeholder="Ada"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </Field>
        <Field label="Last name" htmlFor="s2-last">
          <Input
            id="s2-last"
            placeholder="Okonkwo"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </Field>
      </div>

      <Field label="Gender" htmlFor="s2-gender">
        <Select.Root value={gender} onValueChange={setGender}>
          <Select.Trigger id="s2-gender">
            <Select.Value placeholder="Select gender" />
          </Select.Trigger>
          <Select.Content>
            {GENDER_OPTIONS.map((g) => (
              <Select.Item key={g.value} value={g.value}>
                {g.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field>

      <Field label="Email address" htmlFor="s2-email">
        <Input
          id="s2-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@school.edu.ng"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>

      <Field label="Phone number" htmlFor="s2-phone">
        <Input
          id="s2-phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+234 801 234 5678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </Field>

      <Field label="Password" htmlFor="s2-password">
        <Input
          id="s2-password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={password.length > 0 && !pwValid}
          required
        />
      </Field>

      {/* Live password policy checklist */}
      {password.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-ink-1000/[0.08] p-3 dark:border-white/10">
          {PASSWORD_POLICY.map((rule) => {
            const ok = rule.ok(password);
            return (
              <li
                key={rule.label}
                className={cn(
                  "flex items-center gap-2 text-caption",
                  ok ? "text-success" : "text-ink-500",
                )}
              >
                {ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />
                )}
                {rule.label}
              </li>
            );
          })}
        </ul>
      )}

      {/* T&C checkbox */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-brand-500"
        />
        <span className="text-caption text-ink-500">
          I agree to the myMakaranta{" "}
          <a href="/terms" className="text-brand-500 underline hover:text-brand-700">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-brand-500 underline hover:text-brand-700">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      <Button type="submit" size="lg" disabled={!canSubmit || busy} className="mt-1 w-full">
        {busy ? "Creating your school…" : "Create my school"}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="text-small font-medium text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        {"←"} Back
      </button>
    </form>
  );
}

// ── Success panel ─────────────────────────────────────────────────────────────

function SuccessPanel({ slug }: { slug: string }) {
  const schoolUrl = `https://${slug}.mymakaranta.com`;
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={36} aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
          Your school is live!
        </h1>
        <p className="text-small text-ink-500">
          Your school has been created. Head to your school address to log in as proprietor.
        </p>
        <p className="mt-2 rounded-lg bg-ink-100 px-4 py-2 font-mono text-small text-brand-700 dark:bg-white/10 dark:text-brand-300">
          {schoolUrl}
        </p>
      </div>
      <a
        href={schoolUrl}
        className="inline-flex h-11 items-center justify-center rounded-button bg-brand-500 px-6 text-body font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Go to your school
      </a>
    </div>
  );
}

// ── Main Signup Page ──────────────────────────────────────────────────────────

type WizardStep = "school" | "you" | "done";

const STEP_TITLES: Record<Exclude<WizardStep, "done">, string> = {
  school: "About your school",
  you: "About you",
};

const STEP_DESC: Record<Exclude<WizardStep, "done">, string> = {
  school: "Claim your school address and set the basics.",
  you: "Create your proprietor account.",
};

const FORM_STEPS: Exclude<WizardStep, "done">[] = ["school", "you"];

export default function SignupPage() {
  const [step, setStep] = useState<WizardStep>("school");
  const [step1Data, setStep1Data] = useState<Step1Data>({
    schoolName: "",
    slug: "",
    country: "NG",
    type: "SECONDARY",
  });
  const [step2Data] = useState<Step2Data>({
    firstName: "",
    lastName: "",
    gender: "",
    email: "",
    phone: "",
    password: "",
  });
  const [successSlug, setSuccessSlug] = useState<string>("");

  const stepIdx = step === "done" ? 2 : FORM_STEPS.indexOf(step as Exclude<WizardStep, "done">);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(179,204,24,0.35), transparent 65%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(81,224,205,0.35), transparent 65%)" }}
        />

        <div className="relative flex items-center gap-2.5 font-display text-xl font-700">
          <GraduationCap className="h-7 w-7 text-saffron-500" aria-hidden />
          myMakaranta
        </div>

        <div className="relative">
          <h2 className="max-w-md font-display text-h1 font-700 leading-tight">
            Get your school online in minutes.
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-center gap-3 text-body text-white/85">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3.5 w-3.5 text-saffron-500" aria-hidden />
                </span>
                {h}
              </li>
            ))}
          </ul>

          {/* Desktop step indicators */}
          {step !== "done" && (
            <ol className="mt-10 flex flex-col gap-1.5">
              {FORM_STEPS.map((s, i) => {
                const sIdx = FORM_STEPS.indexOf(s);
                const done = sIdx < stepIdx;
                const active = sIdx === stepIdx;
                return (
                  <li
                    key={s}
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
                        "text-small capitalize",
                        active ? "font-semibold text-white" : done ? "text-white/80" : "text-white/50",
                      )}
                    >
                      {STEP_TITLES[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="relative text-small text-white/60">
          Built for Nigerian schools. Works on older phones, even offline.
        </p>
      </aside>

      {/* Form side */}
      <div className="flex items-center justify-center bg-paper px-5 py-12 dark:bg-paper-dark">
        <div className="w-full max-w-md">
          {/* Mobile brand mark */}
          <div className="mb-8 flex items-center gap-2.5 font-display text-xl font-700 text-brand-500 lg:hidden">
            <GraduationCap className="h-6 w-6" aria-hidden />
            myMakaranta
          </div>

          {/* Mobile progress bar */}
          {step !== "done" && (
            <div className="mb-7 flex gap-1.5 lg:hidden">
              {FORM_STEPS.map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    FORM_STEPS.indexOf(s) <= stepIdx
                      ? "bg-brand-500"
                      : "bg-ink-1000/10 dark:bg-white/10",
                  )}
                />
              ))}
            </div>
          )}

          {step !== "done" && (
            <div className="mb-6">
              <p className="text-caption font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                Step {stepIdx + 1} of {FORM_STEPS.length}
              </p>
              <h1 className="mt-1.5 font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
                {STEP_TITLES[step as Exclude<WizardStep, "done">]}
              </h1>
              <p className="mt-1.5 text-small leading-relaxed text-ink-500">
                {STEP_DESC[step as Exclude<WizardStep, "done">]}
              </p>
            </div>
          )}

          {step === "school" && (
            <Step1
              initial={step1Data}
              onNext={(data) => {
                setStep1Data(data);
                setStep("you");
              }}
            />
          )}

          {step === "you" && (
            <Step2
              initial={step2Data}
              step1={step1Data}
              onBack={() => setStep("school")}
              onSuccess={(slug) => {
                setSuccessSlug(slug);
                setStep("done");
              }}
            />
          )}

          {step === "done" && <SuccessPanel slug={successSlug} />}

          {step === "school" && (
            <p className="mt-8 text-caption text-ink-500">
              Already have a school?{" "}
              <a href="/login" className="font-medium text-brand-500 hover:text-brand-700">
                Sign in
              </a>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
