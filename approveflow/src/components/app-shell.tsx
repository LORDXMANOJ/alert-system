"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Activity,
  Bell,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings2,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "./ui";
import type { NavGroup, NavKey } from "@/lib/nav";
import { CommandMenu } from "./command-menu";

const ICONS: Record<NavKey, typeof Gauge> = {
  overview: LayoutDashboard,
  applications: ClipboardList,
  workflow: Workflow,
  scrutiny: ClipboardCheck,
  evc: CalendarClock,
  undertakings: FileCheck2,
  compliance: ListChecks,
  documents: FileText,
  tasks: Activity,
  notifications: Bell,
  reports: BarChart3,
  audit: ScrollText,
  users: Users,
  workflows: Building2,
  settings: Settings2,
};

type Counts = { scrutiny: number; evc: number; tasks: number; notifications: number };

const COUNT_KEY: Partial<Record<NavKey, keyof Counts>> = {
  scrutiny: "scrutiny",
  evc: "evc",
  tasks: "tasks",
  notifications: "notifications",
};

export function AppShell({
  nav,
  counts,
  actor,
  initialCollapsed,
  children,
  logout,
}: {
  nav: NavGroup[];
  counts: Counts;
  actor: { name: string; designation: string; roleLabel: string; role: string };
  initialCollapsed: boolean;
  children: ReactNode;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (!mod && !typing && e.key === "/") {
        e.preventDefault();
        router.push("/applications");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // A cookie, not localStorage, so the server renders the chosen layout without a flash.
    document.cookie = `af-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col text-slate-300">
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cobalt text-white">
          <Gauge className="size-5" aria-hidden />
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">ApproveFlow AICTE</p>
            <p className="truncate text-xs text-slate-400">Approval &amp; compliance</p>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <LayoutGroup id="sidebar">
          {nav.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p>
              ) : (
                <div className="mx-3 mb-2 border-t border-navy-line" aria-hidden />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const countKey = COUNT_KEY[item.key];
                  const count = countKey ? counts[countKey] : 0;
                  return (
                    <li key={item.key} className="relative">
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                          collapsed && "justify-center px-2",
                          active ? "text-white" : "hover:bg-navy-2 hover:text-white",
                        )}
                      >
                        {active ? (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-md bg-navy-2 ring-1 ring-navy-line"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            aria-hidden
                          />
                        ) : null}
                        {active ? (
                          <motion.span
                            layoutId="nav-bar"
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-cobalt"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            aria-hidden
                          />
                        ) : null}
                        <Icon className="relative size-[18px] shrink-0" aria-hidden />
                        {!collapsed ? <span className="relative truncate">{item.label}</span> : null}
                        {!collapsed && count > 0 ? (
                          <span className="tnum relative ml-auto rounded-full bg-cobalt px-1.5 text-[11px] font-semibold leading-5 text-white">
                            {count}
                          </span>
                        ) : null}
                        {collapsed && count > 0 ? (
                          <span className="absolute right-1 top-1 size-2 rounded-full bg-amber" aria-label={`${count} waiting`} />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </LayoutGroup>
      </div>

      <div className="border-t border-navy-line p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-navy-2 hover:text-white lg:flex",
            collapsed && "justify-center px-2",
          )}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
          {!collapsed ? "Collapse" : null}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden bg-navy transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-navy/60" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-0 left-0 w-72 bg-navy shadow-xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 rounded p-1 text-slate-300 hover:text-white"
                aria-label="Close menu"
              >
                <X className="size-5" aria-hidden />
              </button>
              {sidebar}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-navy hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-left text-sm text-slate-500 hover:bg-white"
          >
            <Search className="size-4" aria-hidden />
            <span className="truncate">Search or jump to…</span>
            <kbd className="tnum ml-auto hidden rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-500 sm:inline">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-navy hover:bg-slate-100"
              aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}
            >
              <Bell className="size-5" aria-hidden />
              {counts.notifications > 0 ? (
                <span className="tnum absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-semibold leading-4 text-white">
                  {counts.notifications}
                </span>
              ) : null}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-navy">{actor.name}</p>
              <p className="text-xs text-slate-500">{actor.roleLabel}</p>
            </div>
            <span className="hidden rounded-full bg-cobalt-soft px-2.5 py-1 text-xs font-medium text-cobalt ring-1 ring-inset ring-blue-200 md:inline">
              {actor.roleLabel}
            </span>
            <form
              action={async () => {
                await logout();
              }}
            >
              <button type="submit" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-navy" aria-label="Sign out (demo)">
                <LogOut className="size-5" aria-hidden />
              </button>
            </form>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:px-6 lg:px-8">
          SIH 2026 prototype · Not an official AICTE system · All data is fictional. Automated alerts support, and never replace, decisions reserved for competent authorities.
        </footer>
      </div>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} />
    </div>
  );
}
