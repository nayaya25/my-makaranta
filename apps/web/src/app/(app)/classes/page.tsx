"use client";

import { useEffect, useState } from "react";
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
import { api, ApiError, type Class, type ClassLevel } from "@/lib/api";
import { BookOpen } from "lucide-react";

function AddClassDialog({
  open,
  onOpenChange,
  classLevels,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classLevels: ClassLevel[];
  onAdded: (c: Class) => void;
}) {
  const [classLevelId, setClassLevelId] = useState(classLevels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = classLevels[0];
    if (first && !classLevelId) {
      setClassLevelId(first.id);
    }
  }, [classLevels, classLevelId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cls = await api.createClass({ classLevelId, name });
      onAdded(cls);
      onOpenChange(false);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add class. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add class</Dialog.Title>
          <Dialog.Description>Select a class level and give this class a name.</Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
          )}
          <Field label="Class level" htmlFor="cl-level">
            {classLevels.length === 0 ? (
              <p className="text-small text-ink-500">
                No class levels found. Complete onboarding first.
              </p>
            ) : (
              <Select.Root value={classLevelId} onValueChange={setClassLevelId}>
                <Select.Trigger id="cl-level">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {classLevels.map((l) => (
                    <Select.Item key={l.id} value={l.id}>
                      {l.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          </Field>
          <Field label="Class name" htmlFor="cl-name">
            <Input
              id="cl-name"
              placeholder="e.g. A, Gold, Science"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              disabled={busy || !name.trim() || !classLevelId || classLevels.length === 0}
            >
              {busy ? "Adding…" : "Add class"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [cls, levels] = await Promise.all([api.listClasses(), api.listClassLevels()]);
      setClasses(cls);
      setClassLevels(levels);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load classes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function levelName(classLevelId: string) {
    return classLevels.find((l) => l.id === classLevelId)?.name ?? "—";
  }

  return (
    <div className="px-4 py-8 mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Classes
          </h1>
          <p className="text-small text-ink-500 tabular-nums">
            {loading ? "" : `${classes.length} total`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Add class</Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && loadError && (
        <ErrorState description={loadError} onRetry={load} />
      )}

      {!loading && !loadError && classes.length === 0 && (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="No classes yet"
          description="Add your first class to get started."
          action={<Button onClick={() => setDialogOpen(true)}>Add class</Button>}
        />
      )}

      {!loading && !loadError && classes.length > 0 && (
        <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-ink-200 dark:border-white/10 bg-ink-100/50 dark:bg-white/4">
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">
                  Level
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">
                  Class name
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c, i) => (
                <tr
                  key={c.id}
                  className={[
                    "hover:bg-ink-100/40 dark:hover:bg-white/4 transition-colors duration-micro",
                    i < classes.length - 1
                      ? "border-b border-ink-200 dark:border-white/10"
                      : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-3">
                    <Badge tone="brand">{levelName(c.classLevelId)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-1000 dark:text-ink-100 font-medium">
                    {c.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddClassDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        classLevels={classLevels}
        onAdded={(c) => setClasses((prev) => [...prev, c])}
      />
    </div>
  );
}
