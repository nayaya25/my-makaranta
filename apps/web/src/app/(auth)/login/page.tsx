"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@mymakaranta/ui";
import { Check, GraduationCap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/auth";

type Channel = "phone" | "email";

const HIGHLIGHTS = [
  "Take the register in seconds",
  "Fees in Naira that reconcile themselves",
  "Results parents are proud to share",
];

export default function LoginPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("phone");
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = channel === "phone" ? { phone } : { email };
  const sentTo = channel === "phone" ? phone : email;
  const contactValid =
    channel === "phone" ? phone.replace(/\D/g, "").length >= 10 : /^\S+@\S+\.\S+$/.test(email);

  function switchChannel(next: Channel) {
    setChannel(next);
    setError(null);
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.requestOtp(target);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.verifyOtp(target, code);
      session.save(token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-brand-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
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
          <GraduationCap className="h-7 w-7 text-saffron-500" aria-hidden="true" />
          myMakaranta
        </div>
        <div className="relative">
          <h2 className="max-w-md font-display text-h1 font-700 leading-tight">
            Run the whole school from one place.
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-center gap-3 text-body text-white/85">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3.5 w-3.5 text-saffron-500" aria-hidden="true" />
                </span>
                {h}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-small text-white/60">
          Built for Nigerian schools. Works on older phones, even offline.
        </p>
      </aside>

      {/* Form */}
      <div className="flex items-center justify-center bg-paper px-5 py-12 dark:bg-paper-dark">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 font-display text-xl font-700 text-brand-500 lg:hidden">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
            myMakaranta
          </div>

          <h1 className="font-display text-h2 font-700 text-ink-1000 dark:text-ink-100">
            {step === "contact" ? "Welcome back" : "Check your messages"}
          </h1>
          <p className="mt-2 text-small text-ink-500">
            {step === "contact"
              ? "Sign in with a one-time code."
              : `We sent a 6-digit code to ${sentTo}.`}
          </p>

          {step === "contact" ? (
            <div className="mt-8">
              {/* Channel tabs */}
              <div
                role="tablist"
                aria-label="Sign-in method"
                className="mb-5 grid grid-cols-2 gap-1 rounded-button bg-ink-100 p-1 dark:bg-white/5"
              >
                {(["phone", "email"] as Channel[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={channel === c}
                    onClick={() => switchChannel(c)}
                    className={`rounded-[0.375rem] py-2 text-small font-600 capitalize transition-all duration-micro ease-expo active:scale-[0.98] ${
                      channel === c
                        ? "bg-surface text-brand-500 shadow-sm dark:bg-surface-dark"
                        : "text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <form onSubmit={submitContact} className="flex flex-col gap-4">
                {channel === "phone" ? (
                  <Field label="Phone number" htmlFor="phone" error={error ?? undefined}>
                    <Input
                      id="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+234 801 234 5678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      invalid={!!error}
                      required
                    />
                  </Field>
                ) : (
                  <Field label="Email address" htmlFor="email" error={error ?? undefined}>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@school.edu.ng"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      invalid={!!error}
                      required
                    />
                  </Field>
                )}
                <Button type="submit" disabled={busy || !contactValid}>
                  {busy ? "Sending…" : "Send code"}
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={submitCode} className="mt-8 flex flex-col gap-4">
              <Field label="6-digit code" htmlFor="code" error={error ?? undefined}>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  invalid={!!error}
                  required
                />
              </Field>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify & continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("contact");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different {channel}
              </Button>
            </form>
          )}

          <p className="mt-8 text-caption text-ink-500">
            By continuing you agree to the myMakaranta terms. We&apos;ll only use your{" "}
            {channel} to sign you in.
          </p>
        </div>
      </div>
    </main>
  );
}
