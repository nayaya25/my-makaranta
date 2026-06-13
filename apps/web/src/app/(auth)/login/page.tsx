"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Field, Input } from "@mymakaranta/ui";
import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.requestOtp(phone);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.verifyOtp(phone, code);
      session.save(token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card elevation="md" className="w-full max-w-sm">
        <CardHeader>
          <p className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">
            myMakaranta
          </p>
          <h1 className="text-small text-ink-500">
            {step === "phone" ? "Sign in with your phone" : `Enter the code sent to ${phone}`}
          </h1>
        </CardHeader>
        <CardBody>
          {step === "phone" ? (
            <form onSubmit={submitPhone} className="flex flex-col gap-4">
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
              <Button type="submit" disabled={busy || phone.length < 10}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
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
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different number
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
