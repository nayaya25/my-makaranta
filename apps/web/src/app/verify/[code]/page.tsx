"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type VerifyResult } from "@/lib/api";

export default function VerifyPage() {
  const params = useParams<{ code: string }>();
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .verifyResult(params.code)
      .then(setRes)
      .catch(() => setRes({ valid: false }))
      .finally(() => setLoading(false));
  }, [params.code]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper dark:bg-paper-dark p-6">
      <div className="w-full max-w-md rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-6 text-center">
        <h1 className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-1">myMakaranta</h1>
        <p className="text-small text-ink-500 mb-5">Result verification</p>
        {loading ? (
          <p className="text-small text-ink-500">Checking…</p>
        ) : res && res.valid ? (
          <div className="text-left">
            <p className="mb-3 text-small font-medium text-success">● Genuine result</p>
            <dl className="grid grid-cols-3 gap-y-1 text-small">
              <dt className="text-ink-500">Student</dt><dd className="col-span-2 text-ink-1000 dark:text-ink-100">{res.student}</dd>
              <dt className="text-ink-500">Class</dt><dd className="col-span-2">{res.className}</dd>
              <dt className="text-ink-500">Term</dt><dd className="col-span-2">{res.term}</dd>
              <dt className="text-ink-500">School</dt><dd className="col-span-2">{res.school}</dd>
              <dt className="text-ink-500">Average</dt><dd className="col-span-2 tabular-nums">{res.average}</dd>
              <dt className="text-ink-500">Position</dt><dd className="col-span-2 tabular-nums">{res.position}</dd>
              <dt className="text-ink-500">Issued</dt><dd className="col-span-2">{new Date(res.issuedAt).toLocaleDateString()}</dd>
            </dl>
          </div>
        ) : (
          <p className="text-small text-error">This code does not match any issued result.</p>
        )}
      </div>
    </main>
  );
}
