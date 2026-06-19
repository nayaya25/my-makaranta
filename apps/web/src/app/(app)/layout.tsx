"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import { api, type AuthUser } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  BarChart3,
  Lock,
  Megaphone,
  Inbox,
  MessageSquare,
  Wallet,
  Settings,
  LogOut,
  Menu,
  X,
  GraduationCap,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; perm?: string };
type NavGroup = { label: string | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "People",
    items: [
      { href: "/students", label: "Students", icon: Users, perm: "students.view" },
      { href: "/staff", label: "Staff", icon: UserSquare2, perm: "staff.view" },
      { href: "/classes", label: "Classes", icon: BookOpen, perm: "classes.view" },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/attendance", label: "Attendance", icon: CalendarCheck, perm: "attendance.view" },
      { href: "/gradebook", label: "Gradebook", icon: ClipboardList, perm: "results.record" },
      { href: "/review", label: "Review", icon: BarChart3, perm: "results.review" },
      { href: "/release", label: "Release", icon: Lock, perm: "results.release" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/announcements", label: "Announcements", icon: Megaphone, perm: "announcements.create" },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  { label: "Finance", items: [{ href: "/fees", label: "Fees", icon: Wallet, perm: "fees.view" }] },
  { label: null, items: [{ href: "/settings", label: "Settings", icon: Settings, perm: "school.manage" }] },
];

const PARENT_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/parent", label: "Fees", icon: Wallet },
      { href: "/parent/announcements", label: "Announcements", icon: Megaphone },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-[10px] px-3 py-2 text-small transition-colors duration-micro ease-expo",
        active
          ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
          : "font-medium text-ink-700 hover:bg-ink-1000/[0.04] dark:text-ink-300 dark:hover:bg-white/5",
      )}
    >
      <Icon
        size={18}
        aria-hidden
        className={
          active
            ? "text-brand-500 dark:text-brand-300"
            : "text-ink-500 group-hover:text-ink-700 dark:text-ink-300"
        }
      />
      {label}
    </Link>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [perms, setPerms] = useState<Set<string> | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const u = session.user();
    if (!session.token() || !u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!session.token()) return;
    api
      .getMyPermissions()
      .then((r) => setPerms(new Set(r.keys)))
      .catch(() => setPerms(new Set()));
  }, []);

  if (!ready) return null;

  const isParent = user?.identityType === "PARENT";
  const groups = (isParent ? PARENT_GROUPS : NAV_GROUPS)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || (perms?.has(i.perm) ?? false)) }))
    .filter((g) => g.items.length > 0);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const roleLabel = user ? titleCase(user.identityType) : "";
  const contact = user?.phone ?? user?.email ?? "";

  function signOut() {
    session.clear();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-paper dark:bg-paper-dark">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-1000/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink-1000/[0.08] bg-surface print:hidden dark:border-white/10 dark:bg-surface-dark",
          "transition-transform duration-standard ease-expo",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500 text-white">
              <GraduationCap size={18} aria-hidden />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink-1000 dark:text-ink-100">
              myMakaranta
            </span>
          </Link>
          <button
            className="p-1 text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {groups.map((group, gi) => (
            <div key={group.label ?? `g${gi}`} className="flex flex-col gap-0.5">
              {group.label && (
                <p className="px-3 pb-1 pt-4 text-[0.68rem] font-semibold uppercase tracking-wider text-ink-500">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  active={isActive(item.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* User area */}
        <div className="border-t border-ink-1000/[0.08] p-3 dark:border-white/10">
          <div className="flex items-center gap-3 rounded-[10px] px-2 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-small font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">
              {(roleLabel[0] ?? "U").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-semibold text-ink-1000 dark:text-ink-100">{roleLabel}</p>
              {contact && <p className="truncate text-caption text-ink-500">{contact}</p>}
            </div>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-[8px] p-2 text-ink-500 transition-colors hover:bg-ink-1000/[0.05] hover:text-ink-1000 dark:hover:bg-white/5 dark:hover:text-ink-100"
            >
              <LogOut size={17} aria-hidden />
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
          <span className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">myMakaranta</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
