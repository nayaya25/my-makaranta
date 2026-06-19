"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageContainer,
  PageHeader,
  Spinner,
} from "@mymakaranta/ui";
import { api, ApiError, type Staff } from "@/lib/api";
import { UserSquare2 } from "lucide-react";

function AddStaffDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (s: Staff) => void;
}) {
  const [form, setForm] = useState({
    staffNo: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
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
      const staff = await api.createStaff(form);
      onAdded(staff);
      onOpenChange(false);
      setForm({ staffNo: "", firstName: "", lastName: "", email: "", phone: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add staff. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = form.staffNo && form.firstName && form.lastName && form.email && form.phone;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add staff member</Dialog.Title>
          <Dialog.Description>Enter the staff member&apos;s details.</Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
          )}
          <Field label="Staff number" htmlFor="st-no">
            <Input
              id="st-no"
              value={form.staffNo}
              onChange={(e) => update("staffNo", e.target.value)}
              className="tabular-nums"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="st-first">
              <Input id="st-first" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
            </Field>
            <Field label="Last name" htmlFor="st-last">
              <Input id="st-last" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
            </Field>
          </div>
          <Field label="Email" htmlFor="st-email">
            <Input id="st-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </Field>
          <Field label="Phone" htmlFor="st-phone">
            <Input id="st-phone" inputMode="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
          </Field>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy ? "Adding…" : "Add staff"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.listStaff();
      setStaff(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load staff.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        description={loading ? undefined : `${staff.length} ${staff.length === 1 ? "member" : "members"} on record`}
        actions={<Button onClick={() => setDialogOpen(true)}>Add staff</Button>}
      />

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && <ErrorState description={loadError} onRetry={load} />}

      {!loading && !loadError && staff.length === 0 && (
        <EmptyState
          icon={<UserSquare2 size={26} />}
          title="No staff yet"
          description="Add your first staff member to get started."
          action={<Button onClick={() => setDialogOpen(true)}>Add staff</Button>}
        />
      )}

      {!loading && !loadError && staff.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-ink-1000/[0.08] bg-ink-1000/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Staff No.</th>
                <th className="px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500">Name</th>
                <th className="hidden px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500 sm:table-cell">Email</th>
                <th className="hidden px-4 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-ink-500 md:table-cell">Phone</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s, i) => (
                <tr
                  key={s.id}
                  className={[
                    "transition-colors duration-micro hover:bg-ink-1000/[0.02] dark:hover:bg-white/[0.03]",
                    i < staff.length - 1 ? "border-b border-ink-1000/[0.06] dark:border-white/[0.06]" : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-3 tabular-nums text-ink-500">{s.staffNo}</td>
                  <td className="px-4 py-3 font-medium text-ink-1000 dark:text-ink-100">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-700 dark:text-ink-300 sm:table-cell">{s.email}</td>
                  <td className="hidden px-4 py-3 tabular-nums text-ink-700 dark:text-ink-300 md:table-cell">{s.phone}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/staff/${s.id}`}
                      className="text-caption font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AddStaffDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={(s) => setStaff((prev) => [s, ...prev])} />
    </PageContainer>
  );
}
