"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, ApiError, type ReportCard } from "@/lib/api";
import { ResultReveal } from "../ResultReveal";

export default function ReportCardPage() {
  const params = useParams<{ studentId: string }>();
  const search = useSearchParams();
  const termId = search.get("termId") ?? "";
  const [rc, setRc] = useState<ReportCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (!params.studentId || !termId) return;
    void api
      .getReportCard(params.studentId, termId)
      .then(setRc)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load the report card."));
  }, [params.studentId, termId]);

  const verifyUrl = useMemo(
    () => (rc ? `${window.location.origin}/verify/${rc.verificationCode}` : ""),
    [rc],
  );
  useEffect(() => {
    if (verifyUrl) void QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 }).then(setQr).catch(() => setQr(""));
  }, [verifyUrl]);

  if (err) return <p className="p-8 text-small text-error">{err}</p>;
  if (!rc) return <div className="flex justify-center p-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-2xl p-6 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <ResultReveal data={{ student: rc.student, average: rc.average, position: rc.position, classSize: rc.classSize, gradeKey: rc.gradeKey }}>
      <div className="rounded-card border border-ink-100 dark:border-white/10 p-6 print:border-0">
        <header className="text-center mb-4">
          <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">{rc.school.name}</h1>
          <p className="text-small text-ink-500">Terminal Report Card</p>
        </header>
        <div className="grid grid-cols-2 gap-2 text-small mb-4">
          <div><span className="text-ink-500">Student:</span> {rc.student.name}</div>
          <div><span className="text-ink-500">Admission No:</span> {rc.student.admissionNo}</div>
          <div><span className="text-ink-500">Class:</span> {rc.className}</div>
          <div><span className="text-ink-500">Term:</span> {rc.term.label}</div>
        </div>
        <table className="w-full text-small border-collapse mb-4">
          <thead><tr className="text-left text-ink-500 border-b border-ink-100 dark:border-white/10">
            <th className="py-1.5">Subject</th><th className="py-1.5 text-center">Total</th><th className="py-1.5 text-center">Grade</th>
          </tr></thead>
          <tbody>
            {rc.entries.map((e) => (
              <tr key={e.subjectId} className="border-b border-ink-100 dark:border-white/10">
                <td className="py-1.5">{e.subjectName}</td>
                <td className="py-1.5 text-center tabular-nums">{e.total}</td>
                <td className="py-1.5 text-center">{e.grade || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between text-small mb-4">
          <div><span className="text-ink-500">Average:</span> <span className="tabular-nums font-medium">{rc.average}</span></div>
          <div><span className="text-ink-500">Position:</span> <span className="tabular-nums font-medium">{rc.position} / {rc.classSize}</span></div>
        </div>
        <div className="text-caption text-ink-500 mb-4">
          Grade key: {rc.gradeKey.map((g) => `${g.grade} ≥ ${g.minScore} (${g.remark})`).join("  ·  ")}
        </div>
        <footer className="flex items-end justify-between border-t border-ink-100 dark:border-white/10 pt-4">
          <div className="text-caption text-ink-500">
            <p>Issued {new Date(rc.releasedAt).toLocaleDateString()}</p>
            <p>Verify at /verify/{rc.verificationCode}</p>
            <p className="font-mono">{rc.verificationCode}</p>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Verification QR" width={96} height={96} />
          )}
        </footer>
      </div>
      </ResultReveal>
    </div>
  );
}
