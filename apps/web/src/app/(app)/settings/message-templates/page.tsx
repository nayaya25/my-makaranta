"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageContainer,
  PageHeader,
  Spinner,
  Textarea,
} from "@mymakaranta/ui";
import { api, ApiError, type MessageTemplate } from "@/lib/api";
import { ArrowLeft, MessageSquareText, RotateCcw } from "lucide-react";

/* ── Copy ────────────────────────────────────────────────────────────────── */

const LABELS: Record<string, string> = {
  FEE_INSTALLMENT_REMINDER: "Fee installment reminder",
  FEE_BALANCE_REMINDER: "Fee balance reminder",
  RESULTS_READY: "Results ready",
};

/** Sample values used to render the live preview, keyed by variable name. */
const SAMPLE_VALUES: Record<string, string> = {
  studentName: "Amina Yusuf",
  amount: "₦15,000",
  dueDate: "12 Aug 2026",
  termLabel: "First Term",
  balance: "₦8,500",
};

const VAR_RE = /\{\{\s*(\w+)\s*\}\}/g;

function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

function sampleFor(variable: string): string {
  return SAMPLE_VALUES[variable] ?? `{${variable}}`;
}

/** Client-side mirror of the server's `validateTemplate`: flags any {{token}} not in allowedVariables. */
function findUnknownVariables(body: string, allowedVariables: string[]): string[] {
  const used = [...body.matchAll(VAR_RE)]
    .map((m) => m[1])
    .filter((v): v is string => typeof v === "string");
  return [...new Set(used.filter((v) => !allowedVariables.includes(v)))];
}

function renderPreview(body: string): string {
  return body.replace(VAR_RE, (_m, name: string) => sampleFor(name));
}

/* ── Template editor card ────────────────────────────────────────────────── */

function TemplateCard({
  template,
  onSaved,
  onReset,
}: {
  template: MessageTemplate;
  onSaved: (key: string, body: string) => void;
  onReset: (key: string) => void;
}) {
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(template.body);
    setError(null);
    setSaved(false);
  }, [template.body, template.key]);

  const dirty = body !== template.body;
  const unknownVars = findUnknownVariables(body, template.allowedVariables);

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const el = textareaRef.current;
    if (el && document.activeElement === el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + token.length;
      });
    } else {
      setBody((prev) => `${prev}${token}`);
    }
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (unknownVars.length > 0) {
      setError(`Unknown variable(s): ${unknownVars.map((v) => `{{${v}}}`).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setMessageTemplate(template.key, body);
      onSaved(template.key, body);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save this template.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    setError(null);
    try {
      await api.resetMessageTemplate(template.key);
      onReset(template.key);
      setBody(template.defaultBody);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset this template.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">
            {labelFor(template.key)}
          </span>
          {template.isCustomized && <Badge tone="brand">Customized</Badge>}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-ink-500">Variables — click to insert</span>
          <div className="flex flex-wrap gap-2">
            {template.allowedVariables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="inline-flex items-center rounded-pill border border-brand-200 bg-brand-50 px-2.5 py-1 text-caption font-semibold text-brand-700 transition-colors duration-micro hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          ref={textareaRef}
          rows={4}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
            setError(null);
          }}
          invalid={unknownVars.length > 0}
          aria-label={`${labelFor(template.key)} message body`}
        />

        {unknownVars.length > 0 && (
          <p className="text-caption text-error">
            Unknown variable(s): {unknownVars.map((v) => `{{${v}}}`).join(", ")}. Allowed:{" "}
            {template.allowedVariables.map((v) => `{{${v}}}`).join(", ")}.
          </p>
        )}

        <div className="flex flex-col gap-1.5 rounded-card border border-ink-200 bg-ink-50/60 p-3 dark:border-white/10 dark:bg-white/5">
          <span className="text-caption font-medium text-ink-500">Preview</span>
          <p className="text-small text-ink-700 dark:text-ink-300">{renderPreview(body)}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || saving || unknownVars.length > 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {template.isCustomized && (
            <Button variant="outline" size="sm" onClick={reset} disabled={resetting}>
              <RotateCcw size={14} aria-hidden />
              {resetting ? "Resetting…" : "Reset to default"}
            </Button>
          )}
          {error && <p className="text-caption text-error">{error}</p>}
          {saved && !error && <p className="text-caption text-success">Saved.</p>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await api.listMessageTemplates();
      setTemplates(data);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load message templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSaved = (key: string, body: string) => {
    setTemplates((prev) =>
      prev?.map((t) => (t.key === key ? { ...t, body, isCustomized: true } : t)) ?? prev,
    );
  };

  const handleReset = (key: string) => {
    setTemplates((prev) =>
      prev?.map((t) => (t.key === key ? { ...t, body: t.defaultBody, isCustomized: false } : t)) ?? prev,
    );
  };

  return (
    <PageContainer className="max-w-2xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-2 text-small text-ink-500 transition-colors hover:text-ink-1000 dark:hover:text-ink-100"
      >
        <ArrowLeft size={16} aria-hidden /> Settings
      </Link>

      <PageHeader
        title="Message templates"
        description="Customize the wording of automated fee reminders and results-ready alerts sent to parents."
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : loadErr ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-small text-error">{loadErr}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <MessageSquareText size={28} className="text-ink-300" aria-hidden />
          <p className="text-small text-ink-500">No message templates available.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {templates.map((t) => (
            <TemplateCard key={t.key} template={t} onSaved={handleSaved} onReset={handleReset} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
