"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, Badge } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";
import { Users, UserSquare2, BookOpen, ArrowRight } from "lucide-react";

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

  if (user.identityType === "PARENT") {
    router.replace("/parent");
    return null;
  }

  if (!user.schoolId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Welcome to myMakaranta
          </h1>
          <p className="text-body text-ink-700 dark:text-ink-300">
            Set up your school to get started. It only takes a few minutes.
          </p>
        </div>
        <Link href="/onboarding">
          <Button size="lg">Set up your school</Button>
        </Link>
      </div>
    );
  }

  const quickLinks = [
    { href: "/students", label: "Students", icon: Users, description: "Manage student records" },
    { href: "/staff", label: "Staff", icon: UserSquare2, description: "Manage staff members" },
    { href: "/classes", label: "Classes", icon: BookOpen, description: "Manage class structure" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Dashboard
          </h1>
          <p className="text-small text-ink-500 tabular-nums">
            Signed in as {user.phone}
          </p>
        </div>
        <Badge tone="brand">{user.identityType}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {quickLinks.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href} className="group">
            <Card elevation="sm" className="h-full hover:shadow-md transition-shadow duration-micro">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-brand-50 dark:bg-brand-500/20 rounded-input p-2 text-brand-500">
                    <Icon size={20} aria-hidden />
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-ink-300 group-hover:text-brand-500 transition-colors duration-micro"
                  />
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">{label}</p>
                <p className="text-small text-ink-500">{description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
