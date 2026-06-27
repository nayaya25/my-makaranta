"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import { api, type MeContext } from "@/lib/api";
import { brandStyle } from "@/lib/tenant";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  BookOpen,
  User,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Loader2,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType };

const STUDENT_NAV: NavItem[] = [
  { href: "/student/progress", label: "My Progress", icon: BarChart3 },
  { href: "/student/timetable", label: "Timetable", icon: Calendar },
  { href: "/student/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/student/materials", label: "Materials", icon: BookOpen },
  { href: "/student/profile", label: "My Profile", icon: User },
];

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-all duration-150",
        active
          ? "bg-sidebar-item-active text-sidebar-text-active"
          : "text-sidebar-text hover:bg-sidebar-item-hover hover:text-sidebar-text-active",
      )}
    >
      {active && <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-sidebar-accent" />}
      <Icon
        size={15}
        strokeWidth={active ? 2 : 1.75}
        className={active ? "text-sidebar-accent" : "text-sidebar-text group-hover:text-sidebar-text-active"}
        aria-hidden
      />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [meCtx, setMeCtx] = useState<MeContext | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!session.token() || !session.user()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    api
      .getMe()
      .then((me) => {
        if (!("legacy" in me)) setMeCtx(me);
      })
      .catch(() => {
        // non-fatal — profile card degrades gracefully
      });
  }, [router]);

  if (!ready) return null;

  const activeItem = STUDENT_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  ) ?? null;

  const firstName = meCtx?.person.firstName ?? "";
  const lastName = meCtx?.person.lastName ?? "";
  const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "Student";
  const initial = displayName[0]?.toUpperCase() ?? "S";

  function signOut() {
    setSigningOut(true);
    session.clear();
    router.replace("/login");
  }

  const themeKey = "teal";

  return (
    <div className="flex min-h-screen bg-paper dark:bg-paper-dark" style={brandStyle(themeKey)}>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-1000/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar-bg print:hidden",
          "transition-transform duration-standard ease-expo",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/student" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500 text-white">
              <GraduationCap size={18} aria-hidden />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-sidebar-text-active">
              myMakaranta
            </span>
          </Link>
          <button
            className="rounded-lg p-1 text-sidebar-section hover:text-sidebar-text-active lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Identity lockup */}
        <div className="shrink-0 px-3 pb-2 pt-3">
          <Link
            href="/student/profile"
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl bg-sidebar-item-hover px-3 py-2.5 transition-colors hover:bg-sidebar-item-active"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-sidebar-accent" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[12px] font-semibold leading-none text-sidebar-text-active">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-[10px] leading-none text-sidebar-text">Student</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="scrollbar-hide relative flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {STUDENT_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={item === activeItem}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        {/* Bottom user row */}
        <div className="shrink-0 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-3 py-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg, #06666633, #06666666)", color: "#51E0CD" }}
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-none text-sidebar-text-active">
                {displayName}
              </p>
              <p className="mt-0.5 text-[10px] leading-none text-sidebar-text">Active</p>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-section transition-colors duration-150 hover:bg-red-950/30 hover:text-red-400 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 size={14} className="animate-spin text-red-400" aria-hidden />
              ) : (
                <LogOut size={14} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-1000/[0.08] bg-surface px-4 dark:border-white/10 dark:bg-surface-dark lg:hidden print:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-1 text-ink-700 hover:text-ink-1000 dark:text-ink-300 dark:hover:text-ink-100"
          >
            <Menu size={20} />
          </button>
          <span className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">
            myMakaranta
          </span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
