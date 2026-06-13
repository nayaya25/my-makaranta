"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Tabs,
} from "@mymakaranta/ui";
import { api, ApiError, type Student, type Guardian } from "@/lib/api";
import { ArrowLeft, UserPlus } from "lucide-react";

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
      <div className="px-4 py-8 mx-auto max-w-3xl flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadError || !student) {
    return (
      <div className="px-4 py-8 mx-auto max-w-3xl">
        <ErrorState
          description={loadError ?? "Student not found."}
          onRetry={loadError ? load : undefined}
        />
      </div>
    );
  }

  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");

  const guardians = student.guardians ?? [];

  return (
    <div className="px-4 py-8 mx-auto max-w-3xl">
      <Link
        href="/students"
        className="mb-6 flex items-center gap-2 text-small text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100 transition-colors duration-micro"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to Students
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar name={fullName} size="lg" />
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
          <PlaceholderTab label="Academic records" />
        </Tabs.Content>
        <Tabs.Content value="attendance">
          <PlaceholderTab label="Attendance" />
        </Tabs.Content>
        <Tabs.Content value="fees">
          <PlaceholderTab label="Fee records" />
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
          <p className="text-small text-ink-500 py-4">No guardians linked yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {guardians.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-input border border-ink-200 dark:border-white/10 px-4 py-3"
              >
                <Avatar
                  name={`${g.parent.firstName} ${g.parent.lastName}`}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-small font-medium text-ink-1000 dark:text-ink-100">
                    {g.parent.firstName} {g.parent.lastName}
                  </p>
                  <p className="text-caption text-ink-500 tabular-nums">
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
          </div>
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
    </div>
  );
}
