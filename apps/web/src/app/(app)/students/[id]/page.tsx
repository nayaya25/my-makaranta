"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageContainer,
  Skeleton,
  Tabs,
} from "@mymakaranta/ui";
import { api, ApiError, type Student, type Guardian, type DiscountScheme, type StudentDiscount } from "@/lib/api";
import { ArrowLeft, Camera, FileText, UserPlus } from "lucide-react";

const cls = "h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small text-ink-1000 dark:text-ink-100";

function formatSchemeValue(method: "PERCENT" | "FIXED", value: number): string {
  // FIXED scheme value is stored in kobo; render as naira.
  return method === "PERCENT" ? `${value}%` : `₦${(value / 100).toLocaleString("en-NG")}`;
}

function StudentDiscountsPanel({ studentId }: { studentId: string }) {
  const [schemes, setSchemes] = useState<DiscountScheme[]>([]);
  const [assignments, setAssignments] = useState<StudentDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [allSchemes, current] = await Promise.all([
        api.listDiscountSchemes(),
        api.listStudentDiscounts(studentId),
      ]);
      setSchemes(allSchemes);
      setAssignments(current);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load discounts.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [studentId]);

  const activeSchemes = schemes.filter((s) => s.active);
  const assignedSchemeIds = new Set(assignments.map((a) => a.schemeId));
  const assignableSchemes = activeSchemes.filter((s) => !assignedSchemeIds.has(s.id));

  const assign = async () => {
    if (!selectedSchemeId) return;
    setAssigning(true);
    setAssignErr(null);
    try {
      await api.assignDiscount(studentId, selectedSchemeId);
      setSelectedSchemeId("");
      await load();
    } catch (e) {
      setAssignErr(e instanceof ApiError ? e.message : "Could not assign the discount.");
    } finally {
      setAssigning(false);
    }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    setAssignErr(null);
    try {
      await api.revokeStudentDiscount(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setAssignErr(e instanceof ApiError ? e.message : "Could not revoke the discount.");
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="py-6">
        <ErrorState description={loadErr} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <div>
        <h3 className="text-small font-semibold text-ink-1000 dark:text-ink-100 mb-2">Current discounts</h3>
        {assignments.length === 0 ? (
          <p className="text-small text-ink-500">No discounts assigned to this student.</p>
        ) : (
          <Card className="divide-y divide-ink-1000/[0.06] dark:divide-white/[0.06]">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-ink-1000 dark:text-ink-100">{a.name}</p>
                  <p className="text-caption tabular-nums text-ink-500">{formatSchemeValue(a.method, a.value)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(a.id)}
                  disabled={revokingId === a.id}
                >
                  {revokingId === a.id ? "Revoking…" : "Revoke"}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-small font-semibold text-ink-1000 dark:text-ink-100 mb-2">Assign a scheme</h3>
        {activeSchemes.length === 0 ? (
          <p className="text-small text-ink-500">
            No active discount schemes. Create one in <Link href="/settings/discounts" className="underline font-medium">Settings → Discount schemes</Link>.
          </p>
        ) : assignableSchemes.length === 0 ? (
          <p className="text-small text-ink-500">All active schemes are already assigned to this student.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Discount scheme"
              value={selectedSchemeId}
              onChange={(e) => setSelectedSchemeId(e.target.value)}
              className={cls}
            >
              <option value="">Select a scheme…</option>
              {assignableSchemes.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({formatSchemeValue(s.method, s.value)})</option>
              ))}
            </select>
            <Button size="sm" onClick={assign} disabled={!selectedSchemeId || assigning}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </div>
        )}
        {assignErr && <p className="mt-2 text-caption text-error">{assignErr}</p>}
      </div>

      <p className="text-caption text-ink-400 dark:text-ink-500">
        Discounts apply on the next invoice generation for this student&apos;s unpaid invoices — they do not retroactively
        change invoices that are already fully paid.
      </p>
    </div>
  );
}

function AddGuardianDialog({
  studentId,
  open,
  onOpenChange,
  onAdded,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (g: Guardian) => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    relationship: "Parent",
    isPrimary: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const parent = await api.createParent({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email || undefined,
      });
      const guardian = await api.addGuardian(studentId, {
        parentId: parent.id,
        relationship: form.relationship,
        isPrimary: form.isPrimary,
      });
      onAdded({ ...guardian, parent });
      onOpenChange(false);
      setForm({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        relationship: "Parent",
        isPrimary: false,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add guardian. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add guardian</Dialog.Title>
          <Dialog.Description>
            Create a parent/guardian and link them to this student.
          </Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="g-first">
              <Input
                id="g-first"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Last name" htmlFor="g-last">
              <Input
                id="g-last"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Phone" htmlFor="g-phone">
            <Input
              id="g-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
            />
          </Field>
          <Field label="Email (optional)" htmlFor="g-email">
            <Input
              id="g-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          <Field label="Relationship" htmlFor="g-rel">
            <Input
              id="g-rel"
              value={form.relationship}
              onChange={(e) => update("relationship", e.target.value)}
              placeholder="e.g. Father, Mother, Guardian"
              required
            />
          </Field>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="submit"
              disabled={busy || !form.firstName || !form.lastName || !form.phone}
            >
              {busy ? "Adding…" : "Add guardian"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">{label}</p>
      <p className="text-small text-ink-500">Coming in a later sprint.</p>
    </div>
  );
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guardianDialogOpen, setGuardianDialogOpen] = useState(false);
  const [photoSrc, setPhotoSrc] = useState<string | undefined>(undefined);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const { photoUrl } = await api.uploadStudentPhoto(id, file);
      setPhotoSrc(photoUrl);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getStudent(id);
      setStudent(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load student.");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <PageContainer className="flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </PageContainer>
    );
  }

  if (loadError || !student) {
    return (
      <PageContainer className="max-w-3xl">
        <ErrorState
          description={loadError ?? "Student not found."}
          onRetry={loadError ? load : undefined}
        />
      </PageContainer>
    );
  }

  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");

  const guardians = student.guardians ?? [];

  return (
    <PageContainer className="max-w-3xl">
      <Link
        href="/students"
        className="mb-6 flex items-center gap-2 text-small text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100 transition-colors duration-micro"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to Students
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative shrink-0">
          <Avatar name={fullName} size="lg" src={photoSrc} />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Change photo"
            onChange={handlePhotoChange}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={photoUploading}
            onClick={() => photoInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full p-0 bg-surface dark:bg-surface-dark border border-ink-1000/[0.12] dark:border-white/15 shadow-sm"
            aria-label="Change photo"
          >
            {photoUploading ? (
              <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
            ) : (
              <Camera size={12} aria-hidden />
            )}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            {fullName}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-small text-ink-500 tabular-nums">
              #{student.admissionNo}
            </span>
            <Badge tone={student.gender === "F" ? "info" : "neutral"}>
              {student.gender === "M" ? "Male" : "Female"}
            </Badge>
          </div>
          {photoError && (
            <p className="text-caption text-error mt-0.5" role="alert">
              {photoError}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="academic">
        <Tabs.List>
          <Tabs.Trigger value="academic">Academic</Tabs.Trigger>
          <Tabs.Trigger value="attendance">Attendance</Tabs.Trigger>
          <Tabs.Trigger value="fees">Fees</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="academic">
          <div className="flex flex-col gap-3 py-6">
            <p className="text-small text-ink-500">Quick links for this student&apos;s academic records.</p>
            <Link
              href={`/report-card/${id}`}
              className="inline-flex items-center gap-2 text-small font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              <FileText size={14} aria-hidden />
              View Report Card
            </Link>
          </div>
        </Tabs.Content>
        <Tabs.Content value="attendance">
          <PlaceholderTab label="Attendance" />
        </Tabs.Content>
        <Tabs.Content value="fees">
          <StudentDiscountsPanel studentId={id} />
        </Tabs.Content>
      </Tabs.Root>

      {/* Guardians */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">Guardians</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGuardianDialogOpen(true)}
          >
            <UserPlus size={14} className="mr-2" aria-hidden />
            Add guardian
          </Button>
        </div>

        {guardians.length === 0 ? (
          <p className="py-4 text-small text-ink-500">No guardians linked yet.</p>
        ) : (
          <Card className="divide-y divide-ink-1000/[0.06] dark:divide-white/[0.06]">
            {guardians.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={`${g.parent.firstName} ${g.parent.lastName}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-ink-1000 dark:text-ink-100">
                    {g.parent.firstName} {g.parent.lastName}
                  </p>
                  <p className="text-caption tabular-nums text-ink-500">
                    {g.parent.phone}
                    {g.parent.email ? ` · ${g.parent.email}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{g.relationship}</Badge>
                  {g.isPrimary && <Badge tone="brand">Primary</Badge>}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <AddGuardianDialog
        studentId={id}
        open={guardianDialogOpen}
        onOpenChange={setGuardianDialogOpen}
        onAdded={(g) =>
          setStudent((prev) =>
            prev ? { ...prev, guardians: [...(prev.guardians ?? []), g] } : prev,
          )
        }
      />
    </PageContainer>
  );
}
