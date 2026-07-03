"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
} from "@mymakaranta/ui";
import { api, ApiError, type Applicant, type ClassLevel, type AcademicYear } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (a: Applicant) => void;
  classLevels: ClassLevel[];
  academicYears: AcademicYear[];
}

const BLANK = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "M",
  dateOfBirth: "",
  stateOfOrigin: "",
  desiredClassLevelId: "",
  academicYearId: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianRelation: "Parent",
  previousSchool: "",
};

export function NewApplicantForm({ open, onOpenChange, onAdded, classLevels, academicYears }: Props) {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof BLANK, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function reset() {
    setForm(BLANK);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const applicant = await api.createApplicant({
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        lastName: form.lastName,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        stateOfOrigin: form.stateOfOrigin || undefined,
        desiredClassLevelId: form.desiredClassLevelId,
        academicYearId: form.academicYearId,
        guardianName: form.guardianName,
        guardianPhone: form.guardianPhone,
        guardianEmail: form.guardianEmail || undefined,
        guardianRelation: form.guardianRelation,
        previousSchool: form.previousSchool || undefined,
      });
      onAdded(applicant);
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit application. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !!form.firstName &&
    !!form.lastName &&
    !!form.dateOfBirth &&
    !!form.desiredClassLevelId &&
    !!form.academicYearId &&
    !!form.guardianName &&
    !!form.guardianPhone;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>New applicant</Dialog.Title>
          <Dialog.Description>Enter the applicant&apos;s details to create an application.</Dialog.Description>
        </Dialog.Header>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
          )}

          {/* Applicant bio */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="na-first">
              <Input
                id="na-first"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Last name" htmlFor="na-last">
              <Input
                id="na-last"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Middle name (optional)" htmlFor="na-middle">
            <Input
              id="na-middle"
              value={form.middleName}
              onChange={(e) => update("middleName", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender" htmlFor="na-gender">
              <Select.Root value={form.gender} onValueChange={(v) => update("gender", v)}>
                <Select.Trigger id="na-gender">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="M">Male</Select.Item>
                  <Select.Item value="F">Female</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
            <Field label="Date of birth" htmlFor="na-dob">
              <Input
                id="na-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Desired class level" htmlFor="na-level">
              <Select.Root
                value={form.desiredClassLevelId}
                onValueChange={(v) => update("desiredClassLevelId", v)}
              >
                <Select.Trigger id="na-level">
                  <Select.Value placeholder="Select level" />
                </Select.Trigger>
                <Select.Content>
                  {classLevels.map((cl) => (
                    <Select.Item key={cl.id} value={cl.id}>
                      {cl.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>
            <Field label="Academic year" htmlFor="na-year">
              <Select.Root
                value={form.academicYearId}
                onValueChange={(v) => update("academicYearId", v)}
              >
                <Select.Trigger id="na-year">
                  <Select.Value placeholder="Select year" />
                </Select.Trigger>
                <Select.Content>
                  {academicYears.map((ay) => (
                    <Select.Item key={ay.id} value={ay.id}>
                      {ay.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="State of origin (optional)" htmlFor="na-state">
              <Input
                id="na-state"
                value={form.stateOfOrigin}
                onChange={(e) => update("stateOfOrigin", e.target.value)}
                placeholder="e.g. Kano"
              />
            </Field>
            <Field label="Previous school (optional)" htmlFor="na-prev">
              <Input
                id="na-prev"
                value={form.previousSchool}
                onChange={(e) => update("previousSchool", e.target.value)}
              />
            </Field>
          </div>

          {/* Guardian block */}
          <p className="mt-1 text-caption font-semibold uppercase tracking-wider text-ink-500">
            Guardian / Contact
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Guardian name" htmlFor="na-gname">
              <Input
                id="na-gname"
                value={form.guardianName}
                onChange={(e) => update("guardianName", e.target.value)}
                required
              />
            </Field>
            <Field label="Relationship" htmlFor="na-grel">
              <Select.Root
                value={form.guardianRelation}
                onValueChange={(v) => update("guardianRelation", v)}
              >
                <Select.Trigger id="na-grel">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="Parent">Parent</Select.Item>
                  <Select.Item value="Guardian">Guardian</Select.Item>
                  <Select.Item value="Sibling">Sibling</Select.Item>
                  <Select.Item value="Other">Other</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" htmlFor="na-gphone">
              <Input
                id="na-gphone"
                type="tel"
                value={form.guardianPhone}
                onChange={(e) => update("guardianPhone", e.target.value)}
                required
              />
            </Field>
            <Field label="Email (optional)" htmlFor="na-gemail">
              <Input
                id="na-gemail"
                type="email"
                value={form.guardianEmail}
                onChange={(e) => update("guardianEmail", e.target.value)}
              />
            </Field>
          </div>

          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy ? "Submitting…" : "Submit application"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
