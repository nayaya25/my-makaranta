"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, PageContainer, PageHeader, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type ReportCardConfig } from "@/lib/api";

type Layout = ReportCardConfig["layout"];

const LAYOUTS: { value: Layout; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Traditional table layout with all subjects listed row by row." },
  { value: "modern", label: "Modern", description: "Cards with colour-coded grade bands and a summary sidebar." },
  { value: "compact", label: "Compact", description: "Condensed single-page format, optimised for A4 printing." },
];

const TOGGLES: { key: keyof Pick<ReportCardConfig, "showSkills" | "showAttendance" | "showRemarks" | "showGradingKey" | "showPosition">; label: string }[] = [
  { key: "showSkills", label: "Show skills section" },
  { key: "showAttendance", label: "Show attendance summary" },
  { key: "showRemarks", label: "Show teacher remarks" },
  { key: "showGradingKey", label: "Show grading key" },
  { key: "showPosition", label: "Show class position" },
];

export default function ReportCardConfigPage() {
  const [config, setConfig] = useState<ReportCardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getReportCardConfig()
      .then((c) => setConfig(c))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Could not load report-card config."),
      )
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: keyof Pick<ReportCardConfig, "showSkills" | "showAttendance" | "showRemarks" | "showGradingKey" | "showPosition">) => {
    setConfig((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  };

  const setLayout = (layout: Layout) => {
    setConfig((prev) => (prev ? { ...prev, layout } : prev));
  };

  const setNextTermBegins = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, nextTermBegins: value || null } : prev));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.putReportCardConfig({
        layout: config.layout,
        showSkills: config.showSkills,
        showAttendance: config.showAttendance,
        showRemarks: config.showRemarks,
        showGradingKey: config.showGradingKey,
        showPosition: config.showPosition,
        nextTermBegins: config.nextTermBegins,
      });
      setConfig(updated);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Report card"
        description="Toggle sections and choose a layout for the printable report card."
      />
      <div className="flex flex-col gap-6">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-small text-error">{error}</p>
        ) : config ? (
          <>
            {/* Layout */}
            <Card>
              <CardHeader>
                <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Layout</span>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  {LAYOUTS.map(({ value, label, description }) => (
                    <label key={value} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="layout"
                        value={value}
                        checked={config.layout === value}
                        onChange={() => setLayout(value)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>
                        <span className="block text-small font-medium text-ink-1000 dark:text-ink-100">
                          {label}
                        </span>
                        <span className="block text-caption text-ink-500">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Section toggles */}
            <Card>
              <CardHeader>
                <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Sections</span>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  {TOGGLES.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-small text-ink-700 dark:text-ink-300">
                      <input
                        type="checkbox"
                        checked={config[key]}
                        onChange={() => toggle(key)}
                        className="h-4 w-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Next term begins */}
            <Card>
              <CardHeader>
                <span className="text-body font-semibold text-ink-1000 dark:text-ink-100">Next term begins</span>
              </CardHeader>
              <CardBody>
                <p className="mb-3 text-small text-ink-500">
                  If set, this date is printed on the report card. Leave blank to omit.
                </p>
                <input
                  type="date"
                  value={config.nextTermBegins ?? ""}
                  onChange={(e) => setNextTermBegins(e.target.value)}
                  className="h-9 rounded-input border border-ink-300 dark:border-white/15 bg-surface dark:bg-surface-dark px-2 text-small"
                />
              </CardBody>
            </Card>

            {/* Save */}
            <div className="flex items-center gap-3">
              <Button onClick={() => void save()} disabled={saving}>
                Save report-card config
              </Button>
              {msg && <span className="text-caption text-ink-500">{msg}</span>}
            </div>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
