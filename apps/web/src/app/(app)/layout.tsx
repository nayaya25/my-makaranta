"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@mymakaranta/ui";
import { session } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users },
  { href: "/staff", label: "Staff", icon: UserSquare2 },
  { href: "/classes", label: "Classes", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
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
      className={cn(
        "flex items-center gap-3 rounded-input px-3 py-2.5 text-small font-medium",
        "transition-colors duration-micro ease-expo",
        active
          ? "bg-brand-500 text-white"
          : "text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-white/8",
      )}
    >
      <Icon size={18} aria-hidden />
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!session.token() || !session.user()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  function signOut() {
    session.clear();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-paper dark:bg-paper-dark">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-1000/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-ink-200 dark:border-white/10",
          "bg-surface dark:bg-surface-dark",
          "transition-transform duration-standard ease-expo",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-ink-200 dark:border-white/10">
          <span className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100">
            myMakaranta
          </span>
          <button
            className="lg:hidden text-ink-500 hover:text-ink-1000 dark:hover:text-ink-100 p-1"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              onClick={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-ink-200 dark:border-white/10">
          <button
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-small font-medium",
              "text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-white/8",
              "transition-colors duration-micro ease-expo",
            )}
          >
            <LogOut size={18} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 dark:border-white/10 bg-surface dark:bg-surface-dark px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-ink-700 dark:text-ink-300 hover:text-ink-1000 dark:hover:text-ink-100 p-1"
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
