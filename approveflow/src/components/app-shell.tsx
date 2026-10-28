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
  FileStack,
  FileCheck2,
  FileText,
  LayoutGrid,
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
import { LogoMark } from "./logo";
import { Tip } from "./tip";

const ICONS: Record<NavKey, typeof Activity> = {
  overview: LayoutGrid,
  applications: FileStack,
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
const COUNT_KEY: Partial<Record<NavKey, keyof Counts>> = { scrutiny: "scrutiny", evc: "evc", tasks: "tasks", notifications: "notifications" };

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
  const initials = actor.name.replace(/^(Dr|Prof)\.\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if (!mod && !typing && e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `af-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <Link href="/" className={cn("flex h-16 items-center gap-3 px-5 text-accent", collapsed && "justify-center px-0")} onClick={() => setMobileOpen(false)}>
        <LogoMark size={22} />
        {!collapsed ? <span className="font-display text-[15px] tracking-[-0.01em] text-fg">ApproveFlow</span> : null}
      </Link>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pt-2 pb-4">
        <LayoutGroup id="sidebar">
          {nav.map((group) => (
            <div key={group.label}>
              {!collapsed ? <p className="px-3 pb-2 text-[11px] text-fg-3">{group.label}</p> : <div className="mx-3 mb-3 h-px bg-line" aria-hidden />}
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const key = COUNT_KEY[item.key];
                  const count = key ? counts[key] : 0;
                  const link = (
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-9 items-center gap-3 px-3 text-[13.5px] transition-colors duration-150",
                        collapsed && "justify-center px-0",
                        active ? "text-fg" : "text-fg-3 hover:text-fg",
                      )}
                    >
                      {active ? (
                        <motion.span layoutId="nav-active" className="absolute inset-0 bg-ink-3" transition={{ type: "spring", bounce: 0, duration: 0.35 }} aria-hidden>
                          <span className="absolute inset-y-0 left-0 w-px bg-accent" />
                        </motion.span>
                      ) : null}
                      <Icon className={cn("relative size-[17px] shrink-0", active && "text-accent")} strokeWidth={1.6} aria-hidden />
                      {!collapsed ? <span className="relative truncate">{item.label}</span> : null}
                      {count > 0 && !collapsed ? (
                        <span className={cn("tnum relative ml-auto font-mono text-[11px]", item.key === "tasks" ? "text-late" : "text-accent")}>{count}</span>
                      ) : null}
                      {count > 0 && collapsed ? <span className="absolute right-2 top-2 size-1.5 bg-late" aria-hidden /> : null}
                    </Link>
                  );
                  return <li key={item.key}>{collapsed ? <Tip label={count ? `${item.label} (${count})` : item.label} className="w-full">{link}</Tip> : link}</li>;
                })}
              </ul>
            </div>
          ))}
        </LayoutGroup>
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn("hidden h-12 items-center gap-3 border-t border-line px-5 text-[13px] text-fg-3 hover:text-fg lg:flex", collapsed && "justify-center px-0")}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="size-4" strokeWidth={1.6} /> : <PanelLeftClose className="size-4" strokeWidth={1.6} />}
        {!collapsed ? "Collapse" : null}
      </button>
    </nav>
  );

  return (
    <div className="min-h-[100dvh] bg-ink">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-ink-2 transition-[width] duration-300 ease-[var(--ease-flow)] lg:block", collapsed ? "w-[68px]" : "w-60")}>
        {sidebar}
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-fg/40" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-ink-2"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            >
              <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-4 top-5 text-fg-3 hover:text-fg" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
              {sidebar}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={cn("flex min-h-[100dvh] flex-col transition-[padding] duration-300 ease-[var(--ease-flow)]", collapsed ? "lg:pl-[68px]" : "lg:pl-60")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-ink/75 px-4 backdrop-blur-xl sm:px-8">
          <button type="button" className="text-fg lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 max-w-sm flex-1 items-center gap-2.5 border border-line px-3 text-left text-[13px] text-fg-3 transition-colors hover:border-line-2 hover:text-fg-2"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
            <span className="truncate">Search</span>
            <kbd className="ml-auto hidden font-mono text-[11px] sm:inline">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-5">
            <Link href="/notifications" className="relative text-fg-2 hover:text-fg" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}>
              <Bell className="size-[18px]" strokeWidth={1.6} aria-hidden />
              {counts.notifications > 0 ? <span className="absolute -right-1 -top-1 size-2 bg-late" aria-hidden /> : null}
            </Link>
            <Tip label={`${actor.name}, ${actor.designation}`}>
              <span className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center bg-accent font-display text-[11px] text-ink" aria-hidden>{initials}</span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-[13px] text-fg">{actor.name}</span>
                  <span className="block text-[11px] text-fg-3">{actor.roleLabel}</span>
                </span>
              </span>
            </Tip>
            <form action={async () => { await logout(); }}>
              <Tip label="Sign out">
                <button type="submit" className="text-fg-3 hover:text-fg" aria-label="Sign out">
                  <LogOut className="size-[18px]" strokeWidth={1.6} aria-hidden />
                </button>
              </Tip>
            </form>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12">
          {children}
        </main>
      </div>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} />
    </div>
  );
}
