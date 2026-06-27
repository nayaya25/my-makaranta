"use client";

import { useEffect, useState } from "react";
import { GraduationCap, User } from "lucide-react";
import { Card, CardBody, Skeleton } from "@mymakaranta/ui";
import { api, type MeContext } from "@/lib/api";
import { session } from "@/lib/auth";

export default function StudentProfilePage() {
  const [meCtx, setMeCtx] = useState<MeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then((me) => {
        if ("legacy" in me) {
          setError("Profile data is not yet available for your account.");
        } else {
          setMeCtx(me);
        }
      })
      .catch(() => setError("Could not load your profile. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const sessionUser = session.user();
  const studentId = sessionUser?.id ?? "—";

  const firstName = meCtx?.person.firstName ?? "";
  const lastName = meCtx?.person.lastName ?? "";
  const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : null;
  const initial = fullName?.[0]?.toUpperCase() ?? "S";

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <CardBody className="flex flex-col gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 pt-4">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold"
              style={{ background: "linear-gradient(135deg, #06666633, #06666666)", color: "#51E0CD" }}
            >
              {loading ? <User size={28} className="text-ink-400" aria-hidden /> : initial}
            </span>
            {loading ? (
              <Skeleton className="h-6 w-36 rounded-md" />
            ) : error ? (
              <p className="text-[13px] text-red-500">{error}</p>
            ) : (
              <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
                {fullName ?? "—"}
              </h1>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <GraduationCap size={13} aria-hidden />
              Student
            </span>
          </div>

          {/* Details grid */}
          <div className="divide-y divide-ink-1000/[0.06] dark:divide-white/10">
            <ProfileRow label="Full name">
              {loading ? <Skeleton className="h-4 w-32 rounded" /> : <span>{fullName ?? "—"}</span>}
            </ProfileRow>
            <ProfileRow label="Student ID">
              <span className="font-mono text-[13px]">{studentId}</span>
            </ProfileRow>
            <ProfileRow label="School">
              {loading ? (
                <Skeleton className="h-4 w-40 rounded" />
              ) : (
                <span>{meCtx?.memberships[0]?.schoolName ?? "—"}</span>
              )}
            </ProfileRow>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-[12px] font-medium uppercase tracking-wider text-ink-400">{label}</p>
      <p className="text-right text-[13px] font-medium text-ink-1000 dark:text-ink-100">{children}</p>
    </div>
  );
}
