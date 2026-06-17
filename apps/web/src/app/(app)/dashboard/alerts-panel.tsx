"use client";

import { useEffect, useState } from "react";
import { api, type DashboardAlert } from "@/lib/api";

export default function AlertsPanel({ termId }: { termId?: string }) {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);

  useEffect(() => {
    let active = true;
    api
      .getDashboardAlerts(termId)
      .then((r) => { if (active) setAlerts(r.alerts); })
      .catch(() => { if (active) setAlerts([]); });
    return () => { active = false; };
  }, [termId]);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-caption font-medium uppercase tracking-wide text-ink-500">Needs attention</p>
      {alerts.map((a, i) => (
        <div
          key={`${a.classId}-${a.type}-${i}`}
          className={`rounded-card border p-3 text-small ${
            a.severity === "high"
              ? "border-error/40 bg-error/10 text-error"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          {a.message}
        </div>
      ))}
    </div>
  );
}
