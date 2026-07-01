"use client";

import { useState, useEffect } from "react";
import { Button, Field, Input, Select } from "@mymakaranta/ui";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { parseTenantHost, brandStyle } from "@/lib/tenant";

// ── Types ────────────────────────────────────────────────────────────────────

interface AdmissionMeta {
  schoolName: string;
  classLevels: { id: string; name: string }[];
  academicYears: { id: string; name: string }[];
}

interface FormData {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  stateOfOrigin: string;
  desiredClassLevelId: string;
  academicYearId: string;
  previousSchool: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianRelation: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const RELATION_OPTIONS = [
  { value: "MOTHER", label: "Mother" },
  { value: "FATHER", label: "Father" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "AUNT", label: "Aunt" },
  { value: "UNCLE", label: "Uncle" },
  { value: "OTHER", label: "Other" },
];

const EMPTY_FORM: FormData = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  stateOfOrigin: "",
  desiredClassLevelId: "",
  academicYearId: "",
  previousSchool: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianRelation: "",
};

// ── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  applicationNo,
  schoolName,
}: {
  applicationNo: string;
  schoolName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
        <CheckCircle2 size={36} aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 font-700 tracking-tight text-ink-1000 dark:text-ink-100">
          Application submitted!
        </h1>
        <p className="text-small text-ink-500">
          Thank you for applying to{" "}
          <span className="font-semibold text-ink-700 dark:text-ink-200">{schoolName}</span>. The
          school will contact you soon.
        </p>
      </div>
      <div className="w-full rounded-xl border border-brand-500/20 bg-brand-500/5 px-6 py-5 text-center">
        <p className="text-caption text-ink-500">Your application number</p>
        <p className="mt-1 font-mono text-2xl font-700 tracking-wider text-brand-600 dark:text-brand-300">
          {applicationNo}
        </p>
        <p className="mt-2 text-caption text-ink-400">
          Keep this number — you&apos;ll need it to track your application.
        </p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ApplyPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [meta, setMeta] = useState<AdmissionMeta | null>(null);
  const [metaState, setMetaState] = useState<"loading" | "not-found" | "error" | "ready">(
    "loading",
  );

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applicationNo, setApplicationNo] = useState<string | null>(null);

  // Resolve slug from subdomain on mount.
  useEffect(() => {
    const resolved = parseTenantHost(window.location.host);
    if (!resolved) {
      setMetaState("not-found");
      return;
    }
    setSlug(resolved);
  }, []);

  // Fetch admission meta once we have the slug.
  useEffect(() => {
    if (!slug) return;
    setMetaState("loading");
    api
      .publicAdmissionMeta(slug)
      .then((data) => {
        setMeta(data);
        setMetaState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setMetaState("not-found");
        } else {
          setMetaState("error");
        }
      });
  }, [slug]);

  function set<K extends keyof FormData>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const dto = {
        schoolSlug: slug,
        firstName: form.firstName.trim(),
        ...(form.middleName.trim() ? { middleName: form.middleName.trim() } : {}),
        lastName: form.lastName.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        ...(form.stateOfOrigin.trim() ? { stateOfOrigin: form.stateOfOrigin.trim() } : {}),
        desiredClassLevelId: form.desiredClassLevelId,
        academicYearId: form.academicYearId,
        ...(form.previousSchool.trim() ? { previousSchool: form.previousSchool.trim() } : {}),
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        ...(form.guardianEmail.trim() ? { guardianEmail: form.guardianEmail.trim() } : {}),
        guardianRelation: form.guardianRelation,
      };
      const result = await api.publicApply(dto);
      setApplicationNo(result.applicationNo);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.gender.length > 0 &&
    form.dateOfBirth.length > 0 &&
    form.desiredClassLevelId.length > 0 &&
    form.academicYearId.length > 0 &&
    form.guardianName.trim().length > 0 &&
    form.guardianPhone.trim().length >= 7 &&
    form.guardianRelation.length > 0;

  return (
    <main className="min-h-screen bg-paper px-4 py-10 dark:bg-paper-dark" style={brandStyle("teal")}>
      <div className="mx-auto w-full max-w-2xl">
        {/* Brand header */}
        <div className="mb-8 flex items-center gap-2.5 font-display text-xl font-700 text-brand-500">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
          myMakaranta
        </div>

        {/* Loading state */}
        {metaState === "loading" && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500/20 border-t-brand-500" />
            <p className="text-small text-ink-500">Loading school information…</p>
          </div>
        )}

        {/* Not found */}
        {metaState === "not-found" && (
          <div className="rounded-xl border border-error/20 bg-error/5 px-6 py-10 text-center">
            <p className="font-display text-h3 font-700 text-ink-1000 dark:text-ink-100">
              School not found
            </p>
            <p className="mt-2 text-small text-ink-500">
              This link doesn&apos;t appear to be a valid school application page. Please check the
              URL and try again.
            </p>
          </div>
        )}

        {/* Network error */}
        {metaState === "error" && (
          <div className="rounded-xl border border-error/20 bg-error/5 px-6 py-10 text-center">
            <p className="font-display text-h3 font-700 text-ink-1000 dark:text-ink-100">
              Something went wrong
            </p>
            <p className="mt-2 text-small text-ink-500">
              Could not load school information. Please refresh the page and try again.
            </p>
            <button
              type="button"
              onClick={() => slug && setMetaState("loading")}
              className="mt-4 text-small font-medium text-brand-500 hover:text-brand-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Success */}
        {metaState === "ready" && applicationNo && meta && (
          <SuccessScreen applicationNo={applicationNo} schoolName={meta.schoolName} />
        )}

        {/* Form */}
        {metaState === "ready" && !applicationNo && meta && (
          <>
            <div className="mb-8">
              <h1 className="font-display text-h2 font-700 text-ink-1000 dark:text-ink-100">
                Apply to {meta.schoolName}
              </h1>
              <p className="mt-2 text-small text-ink-500">
                Fill in the details below to submit an application. All fields marked * are
                required.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
              {/* ── Applicant bio ─────────────────────────────────── */}
              <section className="rounded-xl border border-ink-1000/[0.06] bg-surface p-6 dark:border-white/[0.06] dark:bg-surface-dark">
                <h2 className="mb-5 font-display text-base font-700 text-ink-1000 dark:text-ink-100">
                  Applicant details
                </h2>

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="First name *" htmlFor="ap-first">
                      <Input
                        id="ap-first"
                        placeholder="e.g. Amara"
                        value={form.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Last name *" htmlFor="ap-last">
                      <Input
                        id="ap-last"
                        placeholder="e.g. Okafor"
                        value={form.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Middle name" htmlFor="ap-middle" hint="Optional">
                    <Input
                      id="ap-middle"
                      placeholder="e.g. Chisom"
                      value={form.middleName}
                      onChange={(e) => set("middleName", e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Gender *" htmlFor="ap-gender">
                      <Select.Root value={form.gender} onValueChange={(v) => set("gender", v)}>
                        <Select.Trigger id="ap-gender">
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

                    <Field label="Date of birth *" htmlFor="ap-dob">
                      <Input
                        id="ap-dob"
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(e) => set("dateOfBirth", e.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="State of origin" htmlFor="ap-state" hint="Optional">
                    <Input
                      id="ap-state"
                      placeholder="e.g. Anambra"
                      value={form.stateOfOrigin}
                      onChange={(e) => set("stateOfOrigin", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {/* ── Admission preferences ─────────────────────────── */}
              <section className="rounded-xl border border-ink-1000/[0.06] bg-surface p-6 dark:border-white/[0.06] dark:bg-surface-dark">
                <h2 className="mb-5 font-display text-base font-700 text-ink-1000 dark:text-ink-100">
                  Admission preferences
                </h2>

                <div className="flex flex-col gap-4">
                  <Field label="Class applying for *" htmlFor="ap-level">
                    <Select.Root
                      value={form.desiredClassLevelId}
                      onValueChange={(v) => set("desiredClassLevelId", v)}
                    >
                      <Select.Trigger id="ap-level">
                        <Select.Value placeholder="Select class level" />
                      </Select.Trigger>
                      <Select.Content>
                        {meta.classLevels.map((cl) => (
                          <Select.Item key={cl.id} value={cl.id}>
                            {cl.name}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </Field>

                  <Field label="Academic year *" htmlFor="ap-year">
                    <Select.Root
                      value={form.academicYearId}
                      onValueChange={(v) => set("academicYearId", v)}
                    >
                      <Select.Trigger id="ap-year">
                        <Select.Value placeholder="Select academic year" />
                      </Select.Trigger>
                      <Select.Content>
                        {meta.academicYears.map((ay) => (
                          <Select.Item key={ay.id} value={ay.id}>
                            {ay.name}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </Field>

                  <Field label="Previous school" htmlFor="ap-prev" hint="Optional">
                    <Input
                      id="ap-prev"
                      placeholder="e.g. Sunrise Primary School"
                      value={form.previousSchool}
                      onChange={(e) => set("previousSchool", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {/* ── Guardian block ────────────────────────────────── */}
              <section className="rounded-xl border border-ink-1000/[0.06] bg-surface p-6 dark:border-white/[0.06] dark:bg-surface-dark">
                <h2 className="mb-5 font-display text-base font-700 text-ink-1000 dark:text-ink-100">
                  Guardian / parent details
                </h2>

                <div className="flex flex-col gap-4">
                  <Field label="Full name *" htmlFor="gd-name">
                    <Input
                      id="gd-name"
                      placeholder="e.g. Mrs. Ngozi Okafor"
                      value={form.guardianName}
                      onChange={(e) => set("guardianName", e.target.value)}
                      required
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Phone number *" htmlFor="gd-phone">
                      <Input
                        id="gd-phone"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+234 801 234 5678"
                        value={form.guardianPhone}
                        onChange={(e) => set("guardianPhone", e.target.value)}
                        required
                      />
                    </Field>

                    <Field label="Relationship to applicant *" htmlFor="gd-rel">
                      <Select.Root
                        value={form.guardianRelation}
                        onValueChange={(v) => set("guardianRelation", v)}
                      >
                        <Select.Trigger id="gd-rel">
                          <Select.Value placeholder="Select relationship" />
                        </Select.Trigger>
                        <Select.Content>
                          {RELATION_OPTIONS.map((r) => (
                            <Select.Item key={r.value} value={r.value}>
                              {r.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    </Field>
                  </div>

                  <Field label="Email address" htmlFor="gd-email" hint="Optional — for updates">
                    <Input
                      id="gd-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="guardian@example.com"
                      value={form.guardianEmail}
                      onChange={(e) => set("guardianEmail", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {/* Submit error */}
              {submitError && (
                <p
                  className="rounded-lg bg-error/10 px-4 py-2.5 text-small text-error"
                  role="alert"
                >
                  {submitError}
                </p>
              )}

              <Button type="submit" size="lg" disabled={!canSubmit || busy} className="w-full">
                {busy ? "Submitting application…" : "Submit application"}
              </Button>
            </form>

            <p className="mt-8 text-caption text-ink-400">
              Your information is handled securely and only shared with{" "}
              <span className="font-medium">{meta.schoolName}</span>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
