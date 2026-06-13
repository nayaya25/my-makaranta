"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  Badge,
} from "@mymakaranta/ui";
import { api, ApiError, type Student } from "@/lib/api";
import { Users } from "lucide-react";

function AddStudentDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (s: Student) => void;
}) {
  const [form, setForm] = useState({
    admissionNo: "",
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "M",
    dateOfBirth: "",
    stateOfOrigin: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const student = await api.createStudent({
        admissionNo: form.admissionNo,
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        lastName: form.lastName,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        stateOfOrigin: form.stateOfOrigin || undefined,
      });
      onAdded(student);
      onOpenChange(false);
      setForm({
        admissionNo: "",
        firstName: "",
        middleName: "",
        lastName: "",
        gender: "M",
        dateOfBirth: "",
        stateOfOrigin: "",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add student. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add student</Dialog.Title>
          <Dialog.Description>Enter the student&apos;s details below.</Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="s-first">
              <Input
                id="s-first"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Last name" htmlFor="s-last">
              <Input
                id="s-last"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Middle name (optional)" htmlFor="s-middle">
            <Input
              id="s-middle"
              value={form.middleName}
              onChange={(e) => update("middleName", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Admission no." htmlFor="s-adm">
              <Input
                id="s-adm"
                value={form.admissionNo}
                onChange={(e) => update("admissionNo", e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="Gender" htmlFor="s-gender">
              <Select.Root value={form.gender} onValueChange={(v) => update("gender", v)}>
                <Select.Trigger id="s-gender">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="M">Male</Select.Item>
                  <Select.Item value="F">Female</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth" htmlFor="s-dob">
              <Input
                id="s-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                required
              />
            </Field>
            <Field label="State of origin" htmlFor="s-state">
              <Input
                id="s-state"
                value={form.stateOfOrigin}
                onChange={(e) => update("stateOfOrigin", e.target.value)}
                placeholder="e.g. Kano"
              />
            </Field>
          </div>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="submit"
              disabled={busy || !form.firstName || !form.lastName || !form.admissionNo}
            >
              {busy ? "Adding…" : "Add student"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.listStudents();
      setStudents(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="px-4 py-8 mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Students
          </h1>
          <p className="text-small text-ink-500 tabular-nums">
            {loading ? "" : `${students.length} total`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Add student</Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && (
        <ErrorState description={loadError} onRetry={load} />
      )}

      {!loading && !loadError && students.length === 0 && (
        <EmptyState
          icon={<Users size={28} />}
          title="No students yet"
          description="Add your first student to get started."
          action={<Button onClick={() => setDialogOpen(true)}>Add student</Button>}
        />
      )}

      {!loading && !loadError && students.length > 0 && (
        <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-ink-200 dark:border-white/10 bg-ink-100/50 dark:bg-white/4">
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 tabular-nums">
                  Adm. No.
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 hidden sm:table-cell">
                  Gender
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr
                  key={s.id}
                  className={[
                    "hover:bg-ink-100/40 dark:hover:bg-white/4 transition-colors duration-micro",
                    i < students.length - 1
                      ? "border-b border-ink-200 dark:border-white/10"
                      : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-3 tabular-nums text-ink-700 dark:text-ink-300">
                    {s.admissionNo}
                  </td>
                  <td className="px-4 py-3 text-ink-1000 dark:text-ink-100 font-medium">
                    {s.firstName} {s.middleName ? `${s.middleName} ` : ""}{s.lastName}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge tone={s.gender === "F" ? "info" : "neutral"}>
                      {s.gender === "M" ? "Male" : "Female"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/students/${s.id}`}
                      className="text-brand-500 hover:underline text-caption font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddStudentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={(s) => setStudents((prev) => [s, ...prev])}
      />
    </div>
  );
}
