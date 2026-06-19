"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  ErrorState,
  Field,
  Input,
  PageContainer,
  Skeleton,
  Badge,
} from "@mymakaranta/ui";
import { api, ApiError, type Staff } from "@/lib/api";
import { ArrowLeft, Camera, ShieldCheck } from "lucide-react";

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({ staffNo: "", firstName: "", lastName: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function hydrate(s: Staff) {
    setStaff(s);
    setForm({
      staffNo: s.staffNo ?? "",
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
    });
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      hydrate(await api.getStaff(id));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load staff member.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      hydrate(await api.updateStaff(id, form));
      setSavedMsg("Staff details updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Try again.");
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
      const { photoUrl } = await api.uploadStaffPhoto(id, file);
      setStaff((s) => (s ? { ...s, photoUrl } : s));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <PageContainer className="flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
      </PageContainer>
    );
  }

  if (loadError || !staff) {
    return (
      <PageContainer className="max-w-2xl">
        <ErrorState description={loadError ?? "Staff member not found."} onRetry={load} />
      </PageContainer>
    );
  }

  const fullName = [staff.firstName, staff.lastName].filter(Boolean).join(" ");

  return (
    <PageContainer className="max-w-2xl">
      <Link
        href="/staff"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Staff
      </Link>

      {/* Header */}
      <Card className="mb-5">
        <CardBody className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar name={fullName} size="lg" src={staff.photoUrl ?? undefined} />
            <input ref={photoRef} type="file" accept="image/*" className="sr-only" aria-label="Change photo" onChange={onPhoto} />
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
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">{fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Staff</Badge>
              <span className="text-caption tabular-nums text-ink-500">#{staff.staffNo}</span>
            </div>
            {photoError && <p className="mt-1 text-caption text-error">{photoError}</p>}
          </div>
          <Link href="/settings/permissions">
            <Button variant="outline" size="sm">
              <ShieldCheck size={15} aria-hidden />
              Permissions
            </Button>
          </Link>
        </CardBody>
      </Card>

      {/* Edit form */}
      <Card>
        <CardBody>
          <form onSubmit={save} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="st-first">
                <Input id="st-first" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
              </Field>
              <Field label="Last name" htmlFor="st-last">
                <Input id="st-last" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
              </Field>
            </div>
            <Field label="Staff number" htmlFor="st-no">
              <Input id="st-no" value={form.staffNo} onChange={(e) => update("staffNo", e.target.value)} className="tabular-nums" required />
            </Field>
            <Field label="Phone" htmlFor="st-phone">
              <Input id="st-phone" inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
            </Field>
            <Field label="Email" htmlFor="st-email">
              <Input id="st-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
            </Field>

            {error && <p className="text-small text-error" role="alert">{error}</p>}
            {savedMsg && <p className="text-small text-success">{savedMsg}</p>}

            <div className="pt-1">
              <Button type="submit" disabled={saving || !form.firstName || !form.lastName}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
