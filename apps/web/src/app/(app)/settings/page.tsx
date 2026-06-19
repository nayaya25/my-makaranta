"use client";

import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageContainer, PageHeader } from "@mymakaranta/ui";
import { ClipboardList, Wallet, ShieldCheck, Building2, ArrowRight } from "lucide-react";

const ITEMS = [
  {
    href: "/settings/assessment",
    title: "Assessment & Grading",
    description: "Score components, grade boundaries, and teacher–subject assignments.",
    icon: ClipboardList,
  },
  {
    href: "/settings/fees",
    title: "Fees",
    description: "Per-class-level fee structure for each term.",
    icon: Wallet,
  },
  {
    href: "/settings/permissions",
    title: "Staff permissions",
    description: "Grant staff their roles and tool access.",
    icon: ShieldCheck,
  },
];

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Configure how your school runs on myMakaranta." />

      <div className="grid gap-4 sm:grid-cols-2">
        {ITEMS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card interactive elevation="xs" className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon size={20} aria-hidden />
                  </span>
                  <ArrowRight size={16} className="text-ink-300 transition-colors duration-micro group-hover:text-brand-500" />
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">{title}</p>
                <p className="mt-0.5 text-small text-ink-500">{description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}

        <Card elevation="xs" className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ink-1000/[0.05] text-ink-500 dark:bg-white/[0.06]">
                <Building2 size={20} aria-hidden />
              </span>
              <Badge tone="neutral">Soon</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-body font-semibold text-ink-1000 dark:text-ink-100">School settings</p>
            <p className="mt-0.5 text-small text-ink-500">
              School profile and advanced configuration are coming in a later release.
            </p>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
