"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader, PageContainer, PageHeader } from "@mymakaranta/ui";
import { ClipboardList, Wallet, ShieldCheck, Building2, UserCircle, ArrowRight, Star, FileText, Clock, Percent, CalendarClock } from "lucide-react";

const ITEMS = [
  {
    href: "/profile",
    title: "My profile",
    description: "Your personal details, contact, and photo.",
    icon: UserCircle,
  },
  {
    href: "/settings/school",
    title: "School profile",
    description: "School name, region, currency, and logo.",
    icon: Building2,
  },
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
    href: "/settings/discounts",
    title: "Discount schemes",
    description: "Reusable discounts and scholarships assignable to students.",
    icon: Percent,
  },
  {
    href: "/settings/installments",
    title: "Installment schedule",
    description: "Split a class level's per-term invoice into ordered installments.",
    icon: CalendarClock,
  },
  {
    href: "/settings/permissions",
    title: "Staff permissions",
    description: "Grant staff their roles and tool access.",
    icon: ShieldCheck,
  },
  {
    href: "/settings/skills",
    title: "Skills config",
    description: "Manage affective & psychomotor skill domains, items, and rating scale.",
    icon: Star,
  },
  {
    href: "/settings/report-card",
    title: "Report card",
    description: "Toggle sections and choose a layout for the printable report card.",
    icon: FileText,
  },
  {
    href: "/settings/timetable",
    title: "Bell schedule",
    description: "Define daily periods — start/end times and break slots for the timetable.",
    icon: Clock,
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
      </div>
    </PageContainer>
  );
}
