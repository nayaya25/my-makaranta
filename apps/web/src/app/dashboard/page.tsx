"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = session.user();
    if (!u || !session.token()) {
      router.replace("/login");
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card elevation="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h1 className="font-display text-h2 text-ink-1000 dark:text-ink-100">You&apos;re in</h1>
            <Badge tone="success">Signed in</Badge>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-body text-ink-700 dark:text-ink-300">
            Signed in as <span className="font-medium tabular-nums">{user.phone}</span> ·{" "}
            {user.identityType}
          </p>
          <p className="text-small text-ink-500">
            This is the authenticated shell stub. The proprietor / principal / bursar dashboards land
            in later sprints — the foundation (auth, tenancy, design system) is what powers them.
          </p>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => {
              session.clear();
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </CardBody>
      </Card>
    </main>
  );
}
