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
  ChevronDown,
  Loader2,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ElementType; perm?: string };
type NavSection = { section: string; icon: React.ElementType; items: NavItem[] };
type NavEntry = NavItem | NavSection;

function isSection(e: NavEntry): e is NavSection {
  return "items" in e;
}

// ─── Nav config (staff / proprietor) ──────────────────────────────────────────
const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    section: "People",
    icon: Users,
    items: [
      { href: "/students", label: "Students", icon: Users, perm: "students.view" },
      { href: "/staff", label: "Staff", icon: UserSquare2, perm: "staff.view" },
      { href: "/classes", label: "Classes", icon: BookOpen, perm: "classes.view" },
    ],
  },
  {
    section: "Academics",
    icon: GraduationCap,
    items: [
      { href: "/attendance", label: "Attendance", icon: CalendarCheck, perm: "attendance.view" },
      { href: "/gradebook", label: "Gradebook", icon: ClipboardList, perm: "results.record" },
      { href: "/review", label: "Review", icon: BarChart3, perm: "results.review" },
      { href: "/release", label: "Release", icon: Lock, perm: "results.release" },
    ],
  },
  {
    section: "Communication",
    icon: Megaphone,
    items: [
      { href: "/announcements", label: "Announcements", icon: Megaphone, perm: "announcements.create" },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  { href: "/fees", label: "Fees", icon: Wallet, perm: "fees.view" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "school.manage" },
];

const PARENT_NAV: NavEntry[] = [
  { href: "/parent", label: "Fees", icon: Wallet },
  { href: "/parent/announcements", label: "Announcements", icon: Megaphone },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

// Hrefs that should only light up on an exact pathname match (so a child
// route like /parent/announcements doesn't also activate /parent "Fees").
const ROOT_EXACT = new Set(["/dashboard", "/parent"]);

// ─── Active-item resolution (longest matching prefix wins) ─────────────────────
function matchScore(pathname: string, item: NavItem): number {
  if (ROOT_EXACT.has(item.href)) return pathname === item.href ? item.href.length : 0;
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return item.href.length;
  return 0;
}

function pickActiveItem(items: NavItem[], pathname: string): NavItem | null {
  let best: NavItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = matchScore(pathname, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

// ─── NavLink ───────────────────────────────────────────────────────────────────
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

// ─── CollapsibleSection ────────────────────────────────────────────────────────
function CollapsibleSection({
  section,
  activeItem,
  onNavigate,
}: {
  section: NavSection;
  activeItem: NavItem | null;
  onNavigate?: () => void;
}) {
  const hasActive = activeItem !== null && section.items.includes(activeItem);
  const [open, setOpen] = useState(hasActive);
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  const SectionIcon = section.icon;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wider transition-all duration-150",
          hasActive ? "text-sidebar-text-active" : "text-sidebar-section hover:text-sidebar-text-active",
        )}
      >
        <SectionIcon
          size={14}
          strokeWidth={2}
          className={hasActive ? "text-sidebar-accent" : ""}
          aria-hidden
        />
        <span className="flex-1 text-left">{section.section}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={cn("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="ml-1 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} active={item === activeItem} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
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
  const [signingOut, setSigningOut] = useState(false);

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

  // Filter sections/items by permission; drop empty sections.
  const entries: NavEntry[] = (isParent ? PARENT_NAV : NAV)
    .map((e) =>
      isSection(e)
        ? { ...e, items: e.items.filter((i) => !i.perm || (perms?.has(i.perm) ?? false)) }
        : e,
    )
    .filter((e) => (isSection(e) ? e.items.length > 0 : !e.perm || (perms?.has(e.perm) ?? false)));

  const flatItems: NavItem[] = entries.flatMap((e) => (isSection(e) ? e.items : [e]));
  const activeItem = pickActiveItem(flatItems, pathname);

  const roleLabel = user ? titleCase(user.identityType) : "";
  const contact = user?.phone ?? user?.email ?? "";
  const initial = (roleLabel[0] ?? "U").toUpperCase();

  function signOut() {
    setSigningOut(true);
    session.clear();
    router.replace("/login");
  }

  // Quick-access utility icons (footer), filtered like the nav.
  const utility: NavItem[] = (
    isParent
      ? [{ href: "/messages", label: "Messages", icon: MessageSquare }]
      : [
          { href: "/messages", label: "Messages", icon: MessageSquare },
          { href: "/inbox", label: "Inbox", icon: Inbox },
          { href: "/settings", label: "Settings", icon: Settings, perm: "school.manage" },
        ]
  ).filter((i) => !i.perm || (perms?.has(i.perm) ?? false));

  return (
    <div className="flex min-h-screen bg-paper dark:bg-paper-dark">
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
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
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
          <div className="flex w-full items-center gap-2.5 rounded-xl bg-sidebar-item-hover px-3 py-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-sidebar-accent" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[12px] font-semibold leading-none text-sidebar-text-active">{roleLabel}</p>
              {contact && <p className="mt-0.5 truncate text-[10px] leading-none text-sidebar-text">{contact}</p>}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="scrollbar-hide relative flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {entries.map((entry, idx) =>
            isSection(entry) ? (
              <CollapsibleSection
                key={entry.section + idx}
                section={entry}
                activeItem={activeItem}
                onNavigate={() => setMobileOpen(false)}
              />
            ) : (
              <NavLink
                key={entry.href}
                item={entry}
                active={entry === activeItem}
                onNavigate={() => setMobileOpen(false)}
              />
            ),
          )}
        </nav>

        {/* Bottom utility bar */}
        <div className="shrink-0 border-t border-sidebar-border">
          {utility.length > 0 && (
            <div className="flex items-center justify-around border-b border-sidebar-border px-3 py-2">
              {utility.map((u) => {
                const Icon = u.icon;
                return (
                  <Link
                    key={u.href}
                    href={u.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-lg p-2 text-sidebar-text transition-colors duration-150 hover:bg-sidebar-item-hover hover:text-sidebar-text-active"
                    aria-label={u.label}
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                    <span className="text-[9px] font-medium uppercase tracking-wide">{u.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* User row */}
          <div className="flex items-center gap-2.5 px-3 py-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg, #06666633, #06666666)", color: "#51E0CD" }}
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-none text-sidebar-text-active">{roleLabel}</p>
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
          <span className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">myMakaranta</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
