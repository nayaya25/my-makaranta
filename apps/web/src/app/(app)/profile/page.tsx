"use client";

import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Badge,
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
import { api, ApiError, type MyProfile } from "@/lib/api";
import { Camera } from "lucide-react";

const LANGS = [
  { code: "EN", label: "English" },
  { code: "HA", label: "Hausa" },
  { code: "YO", label: "Yoruba" },
  { code: "IG", label: "Igbo" },
];

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredLang: "EN",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function hydrate(p: MyProfile) {
    setProfile(p);
    setForm({
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      preferredLang: p.preferredLang ?? "EN",
    });
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      hydrate(await api.getMyProfile());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load your profile.");
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

  const isStaff = profile?.identityType === "STAFF";
  const isParent = profile?.identityType === "PARENT";
  const hasName = isStaff || isParent;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (hasName) {
        payload.firstName = form.firstName;
        payload.lastName = form.lastName;
      }
      payload.email = form.email;
      payload.phone = form.phone;
      if (isParent) payload.preferredLang = form.preferredLang;
      hydrate(await api.updateMyProfile(payload));
      setSavedMsg("Profile updated.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const { photoUrl } = await api.uploadMyPhoto(file);
      setProfile((p) => (p ? { ...p, photoUrl } : p));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <PageContainer className="max-w-2xl">
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (loadError || !profile) {
    return (
      <PageContainer className="max-w-2xl">
        <ErrorState description={loadError ?? "Profile not found."} onRetry={load} />
      </PageContainer>
    );
  }

  const displayName = hasName
    ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") || titleCase(profile.identityType)
    : titleCase(profile.identityType);

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="My profile" description="View and update your personal information." />

      {/* Identity header */}
      <Card className="mb-5">
        <CardBody className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar name={displayName} size="lg" src={profile.photoUrl ?? undefined} />
            {profile.photoSupported && (
              <>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Change photo"
                  onChange={onPhoto}
                />
                <button
                  type="button"
                  disabled={photoUploading}
                  onClick={() => photoRef.current?.click()}
                  aria-label="Change photo"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-ink-1000/[0.12] bg-surface text-ink-700 shadow-sm transition-colors hover:text-brand-500 disabled:opacity-50 dark:border-white/15 dark:bg-surface-dark dark:text-ink-300"
                >
                  {photoUploading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-500 border-t-transparent" />
                  ) : (
                    <Camera size={13} aria-hidden />
                  )}
                </button>
              </>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">{displayName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="brand">{titleCase(profile.identityType)}</Badge>
              {profile.staffNo && <span className="text-caption tabular-nums text-ink-500">#{profile.staffNo}</span>}
            </div>
            {photoError && (
              <p className="mt-1 text-caption text-error" role="alert">
                {photoError}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Editable form */}
      <Card>
        <CardBody>
          <form onSubmit={save} className="flex flex-col gap-4">
            {hasName && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" htmlFor="p-first">
                  <Input id="p-first" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
                </Field>
                <Field label="Last name" htmlFor="p-last">
                  <Input id="p-last" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
                </Field>
              </div>
            )}
            <Field label="Phone" htmlFor="p-phone">
              <Input id="p-phone" inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="e.g. 0801 234 5678" />
            </Field>
            <Field label="Email" htmlFor="p-email">
              <Input id="p-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
            </Field>
            {isParent && (
              <Field label="Preferred language" htmlFor="p-lang">
                <Select.Root value={form.preferredLang} onValueChange={(v) => update("preferredLang", v)}>
                  <Select.Trigger id="p-lang">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {LANGS.map((l) => (
                      <Select.Item key={l.code} value={l.code}>
                        {l.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            )}

            {saveError && <p className="text-small text-error" role="alert">{saveError}</p>}
            {savedMsg && <p className="text-small text-success">{savedMsg}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
