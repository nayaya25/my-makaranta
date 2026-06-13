"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
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

  const canSubmit =
    form.staffNo && form.firstName && form.lastName && form.email && form.phone;

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
              <Input
                id="st-first"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Last name" htmlFor="st-last">
              <Input
                id="st-last"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Email" htmlFor="st-email">
            <Input
              id="st-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
          </Field>
          <Field label="Phone" htmlFor="st-phone">
            <Input
              id="st-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
            />
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
    <div className="px-4 py-8 mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Staff
          </h1>
          <p className="text-small text-ink-500 tabular-nums">
            {loading ? "" : `${staff.length} total`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Add staff</Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && (
        <ErrorState description={loadError} onRetry={load} />
      )}

      {!loading && !loadError && staff.length === 0 && (
        <EmptyState
          icon={<UserSquare2 size={28} />}
          title="No staff yet"
          description="Add your first staff member to get started."
          action={<Button onClick={() => setDialogOpen(true)}>Add staff</Button>}
        />
      )}

      {!loading && !loadError && staff.length > 0 && (
        <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-ink-200 dark:border-white/10 bg-ink-100/50 dark:bg-white/4">
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 tabular-nums">
                  Staff No.
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 hidden sm:table-cell">
                  Email
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 hidden md:table-cell">
                  Phone
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s, i) => (
                <tr
                  key={s.id}
                  className={[
                    "hover:bg-ink-100/40 dark:hover:bg-white/4 transition-colors duration-micro",
                    i < staff.length - 1
                      ? "border-b border-ink-200 dark:border-white/10"
                      : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-3 tabular-nums text-ink-700 dark:text-ink-300">
                    {s.staffNo}
                  </td>
                  <td className="px-4 py-3 text-ink-1000 dark:text-ink-100 font-medium">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-300 hidden sm:table-cell">
                    {s.email}
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-300 tabular-nums hidden md:table-cell">
                    {s.phone}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddStaffDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={(s) => setStaff((prev) => [s, ...prev])}
      />
    </div>
  );
}
