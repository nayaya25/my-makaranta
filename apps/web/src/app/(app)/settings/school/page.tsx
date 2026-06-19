"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  ErrorState,
  Field,
  Input,
  PageContainer,
  PageHeader,
  Select,
  Spinner,
} from "@mymakaranta/ui";
import { api, ApiError, type School } from "@/lib/api";
import { ArrowLeft, Building2, ImageIcon } from "lucide-react";

const COUNTRIES = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
];
const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];

export default function SchoolSettingsPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", country: "NG", currency: "NGN" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const logoRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  function hydrate(s: School) {
    setSchool(s);
    setForm({ name: s.name ?? "", country: s.country ?? "NG", currency: s.currency ?? "NGN" });
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      hydrate(await api.getMySchool());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load school.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSavedMsg(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      hydrate(await api.updateSchool(form));
      setSavedMsg("School details updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const { logoUrl } = await api.uploadSchoolLogo(file);
      setSchool((s) => (s ? { ...s, logoUrl } : s));
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : "Logo upload failed.");
    } finally {
      setLogoUploading(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  return (
    <PageContainer className="max-w-2xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Settings
      </Link>
      <PageHeader title="School profile" description="Your school's identity — name, region, currency, and logo." />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : loadError || !school ? (
        <ErrorState description={loadError ?? "School not found."} onRetry={load} />
      ) : (
        <>
          {/* Logo */}
          <Card className="mb-5">
            <CardBody className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink-1000/[0.08] bg-brand-50 dark:border-white/10 dark:bg-brand-500/15">
                {school.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <Building2 size={26} className="text-brand-500 dark:text-brand-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-ink-1000 dark:text-ink-100">School logo</p>
                <p className="text-caption text-ink-500">PNG, JPG, or WebP, up to 5MB.</p>
                {logoError && <p className="mt-1 text-caption text-error">{logoError}</p>}
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload logo"
                onChange={onLogo}
              />
              <Button variant="outline" size="sm" disabled={logoUploading} onClick={() => logoRef.current?.click()}>
                <ImageIcon size={15} aria-hidden />
                {logoUploading ? "Uploading…" : "Upload"}
              </Button>
            </CardBody>
          </Card>

          {/* Details */}
          <Card>
            <CardBody>
              <form onSubmit={save} className="flex flex-col gap-4">
                <Field label="School name" htmlFor="s-name">
                  <Input id="s-name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Country" htmlFor="s-country">
                    <Select.Root value={form.country} onValueChange={(v) => update("country", v)}>
                      <Select.Trigger id="s-country">
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
                  <Field label="Currency" htmlFor="s-currency">
                    <Select.Root value={form.currency} onValueChange={(v) => update("currency", v)}>
                      <Select.Trigger id="s-currency">
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

                {error && <p className="text-small text-error" role="alert">{error}</p>}
                {savedMsg && <p className="text-small text-success">{savedMsg}</p>}

                <div className="pt-1">
                  <Button type="submit" disabled={saving || !form.name.trim()}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
