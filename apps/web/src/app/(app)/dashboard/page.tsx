"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader, Badge, PageContainer, PageHeader } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";
import { Users, UserSquare2, BookOpen, ArrowRight, GraduationCap } from "lucide-react";
import ProprietorDashboardView from "./proprietor-dashboard";
import PrincipalDashboardView from "./principal-dashboard";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [principalDenied, setPrincipalDenied] = useState(false);

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

  if (user.identityType === "PROPRIETOR" && user.schoolId) {
    return <ProprietorDashboardView />;
  }

  if (user.schoolId && !principalDenied) {
    return <PrincipalDashboardView onForbidden={() => setPrincipalDenied(true)} />;
  }

  if (!user.schoolId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
          <GraduationCap size={30} aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
            Welcome to myMakaranta
          </h1>
          <p className="text-body leading-relaxed text-ink-700 dark:text-ink-300">
            Set up your school to get started — it only takes a few minutes.
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
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={user.phone ? `Signed in as ${user.phone}` : undefined}
        actions={<Badge tone="brand">{user.identityType}</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {quickLinks.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href} className="group">
            <Card interactive elevation="xs" className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon size={20} aria-hidden />
                  </span>
                  <ArrowRight
                    size={16}
                    className="text-ink-300 transition-colors duration-micro group-hover:text-brand-500"
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
    </PageContainer>
  );
}
