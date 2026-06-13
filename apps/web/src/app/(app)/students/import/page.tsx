"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload, Download, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button, Badge, Spinner, ErrorState, cn } from "@mymakaranta/ui";
import { api, ApiError, type ImportRow, type ImportJobStatus } from "@/lib/api";
import { parseImportFile } from "@/lib/parse-import";

const TEMPLATE_HEADERS = [
  "Admission No",
  "First Name",
  "Middle Name",
  "Last Name",
  "Gender",
  "Date of Birth",
  "State of Origin",
  "Parent Phone",
  "Parent First Name",
  "Parent Last Name",
  "Relationship",
];

const PREVIEW_COLS: { key: keyof ImportRow; label: string }[] = [
  { key: "admissionNo", label: "Adm. No." },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "DOB" },
];

function downloadTemplate() {
  const csv = TEMPLATE_HEADERS.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Phase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "parse-error"; message: string }
  | { kind: "preview"; rows: ImportRow[] }
  | { kind: "importing"; jobId: string; progress?: number }
  | { kind: "done"; status: ImportJobStatus }
  | { kind: "failed"; reason: string };

export default function ImportStudentsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase({ kind: "parsing" });
    try {
      const rows = await parseImportFile(file);
      setPhase({ kind: "preview", rows });
    } catch (err) {
      setPhase({
        kind: "parse-error",
        message: err instanceof Error ? err.message : "Failed to parse file.",
      });
    }
  }

  async function startImport() {
    if (phase.kind !== "preview") return;
    const { rows } = phase;

    let jobId: string;
    try {
      const res = await api.importStudents(rows);
      jobId = res.jobId;
    } catch (err) {
      setPhase({
        kind: "failed",
        reason: err instanceof ApiError ? err.message : "Failed to start import.",
      });
      return;
    }

    setPhase({ kind: "importing", jobId });

    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getImportStatus(jobId);
        setPhase((prev) =>
          prev.kind === "importing"
            ? { ...prev, progress: typeof status.progress === "number" ? status.progress : undefined }
            : prev,
        );

        if (status.state === "completed" || status.state === "failed") {
          clearInterval(pollRef.current!);
          if (status.state === "completed") {
            setPhase({ kind: "done", status });
          } else {
            setPhase({ kind: "failed", reason: status.failedReason ?? "Import job failed." });
          }
        }
      } catch {
        clearInterval(pollRef.current!);
        setPhase({ kind: "failed", reason: "Lost connection while polling import status." });
      }
    }, 800);
  }

  return (
    <div className="px-4 py-8 mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/students"
          className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100 transition-colors duration-micro"
          aria-label="Back to students"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Bulk import students
          </h1>
          <p className="text-small text-ink-500">Upload a CSV or XLSX file to import multiple students at once.</p>
        </div>
      </div>

      {/* Template download */}
      <div className="mb-6 rounded-card border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-small font-medium text-ink-1000 dark:text-ink-100">Need a template?</p>
          <p className="text-caption text-ink-500">Download a CSV with the correct column headers.</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download size={15} />
          Download CSV template
        </Button>
      </div>

      {/* File pick — shown until import starts */}
      {(phase.kind === "idle" || phase.kind === "parsing" || phase.kind === "parse-error") && (
        <div
          className={cn(
            "rounded-card border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center",
            "border-ink-300 dark:border-white/20",
            "hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors duration-micro",
          )}
        >
          <div className="bg-brand-50 dark:bg-brand-500/15 rounded-pill p-3 text-brand-500">
            <Upload size={22} />
          </div>
          <div>
            <p className="text-small font-medium text-ink-1000 dark:text-ink-100">
              {phase.kind === "parsing" ? "Parsing file…" : "Choose a file to upload"}
            </p>
            <p className="text-caption text-ink-500 mt-0.5">Accepts .csv and .xlsx</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={handleFile}
            id="import-file"
            disabled={phase.kind === "parsing"}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={phase.kind === "parsing"}
          >
            {phase.kind === "parsing" ? <Spinner size="sm" /> : null}
            {phase.kind === "parsing" ? "Parsing…" : "Select file"}
          </Button>

          {phase.kind === "parse-error" && (
            <p className="text-caption text-error mt-1" role="alert">
              {phase.message}
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {phase.kind === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-small font-medium text-ink-1000 dark:text-ink-100">
              <span className="tabular-nums">{phase.rows.length}</span> rows parsed
              {phase.rows.length > 8 && (
                <span className="text-ink-500 font-normal"> — showing first 8</span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>
              Change file
            </Button>
          </div>

          <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-ink-200 dark:border-white/10 bg-ink-100/50 dark:bg-white/4">
                  {PREVIEW_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phase.rows.slice(0, 8).map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "hover:bg-ink-100/40 dark:hover:bg-white/4 transition-colors duration-micro",
                      i < Math.min(phase.rows.length, 8) - 1
                        ? "border-b border-ink-200 dark:border-white/10"
                        : "",
                    )}
                  >
                    {PREVIEW_COLS.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-ink-1000 dark:text-ink-100",
                          col.key === "admissionNo" || col.key === "dateOfBirth"
                            ? "tabular-nums"
                            : "",
                        )}
                      >
                        {row[col.key] ?? <span className="text-ink-400">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={startImport} disabled={phase.rows.length === 0}>
              Import {phase.rows.length} student{phase.rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {/* Importing / polling */}
      {phase.kind === "importing" && (
        <div className="rounded-card border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark p-10 flex flex-col items-center gap-4 text-center">
          <Spinner size="lg" />
          <div>
            <p className="text-small font-medium text-ink-1000 dark:text-ink-100">Importing…</p>
            {phase.progress !== undefined && (
              <p className="text-caption text-ink-500 tabular-nums mt-0.5">
                {phase.progress}% complete
              </p>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {phase.kind === "done" && phase.status.result && (
        <div className="flex flex-col gap-6">
          <div className="rounded-card border border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 flex flex-col items-center gap-3 text-center">
            <div className="text-success bg-success/10 rounded-pill p-3">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">
                Import complete
              </p>
              <p className="text-small text-ink-500 mt-1">
                <span className="tabular-nums font-medium text-ink-1000 dark:text-ink-100">
                  {phase.status.result.imported}
                </span>{" "}
                of{" "}
                <span className="tabular-nums">{phase.status.result.total}</span> students imported
              </p>
            </div>
            <div className="flex gap-2">
              <Badge tone="success">
                {phase.status.result.imported} imported
              </Badge>
              {phase.status.result.failed > 0 && (
                <Badge tone="error">
                  {phase.status.result.failed} failed
                </Badge>
              )}
            </div>
          </div>

          {phase.status.result.failed > 0 && phase.status.result.errors.length > 0 && (
            <div>
              <p className="text-small font-semibold text-ink-1000 dark:text-ink-100 mb-3">
                Rows with errors
              </p>
              <div className="rounded-card border border-ink-200 dark:border-white/10 overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-ink-200 dark:border-white/10 bg-ink-100/50 dark:bg-white/4">
                      <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300 tabular-nums">Row #</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">Adm. No.</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink-700 dark:text-ink-300">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase.status.result.errors.map((err, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "hover:bg-ink-100/40 dark:hover:bg-white/4 transition-colors duration-micro",
                          i < phase.status.result!.errors.length - 1
                            ? "border-b border-ink-200 dark:border-white/10"
                            : "",
                        )}
                      >
                        <td className="px-4 py-3 tabular-nums text-ink-700 dark:text-ink-300">
                          {err.row}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink-700 dark:text-ink-300">
                          {err.admissionNo ?? <span className="text-ink-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-error">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
            <Link
              href="/students"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button font-medium h-11 px-4 text-body bg-brand-500 text-white shadow-sm hover:bg-brand-700 transition-[transform,background-color,box-shadow,color] duration-micro ease-expo active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus"
            >
              Back to students
            </Link>
          </div>
        </div>
      )}

      {/* Failed */}
      {phase.kind === "failed" && (
        <div className="flex flex-col gap-4">
          <ErrorState
            title="Import failed"
            description={phase.reason}
            onRetry={reset}
          />
          <div className="flex justify-center">
            <Link href="/students" className="text-small text-brand-500 hover:underline">
              Back to students
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
