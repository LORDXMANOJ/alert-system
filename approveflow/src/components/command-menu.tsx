"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import type { NavGroup } from "@/lib/nav";

/** ⌘K / Ctrl+K command menu: jump to any page you can access, or search applications by ID, title or institution. */
export function CommandMenu({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavGroup[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy/50 p-4 pt-[12vh]" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onOpenChange(false);
    }}>
      <Command
        label="Command menu"
        loop
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <Search className="size-4 text-slate-400" aria-hidden />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Go to a page, or search applications…"
            className="h-12 w-full bg-transparent text-sm text-navy outline-none placeholder:text-slate-400"
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-slate-500">No match. Press Enter to search applications.</Command.Empty>
          {query.trim() ? (
            <Command.Group heading="Search">
              <Command.Item
                value={`search ${query}`}
                onSelect={() => go(`/applications?q=${encodeURIComponent(query.trim())}`)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-navy data-[selected=true]:bg-cobalt-soft"
              >
                <Search className="size-4 text-cobalt" aria-hidden />
                Search applications for &ldquo;{query.trim()}&rdquo;
                <CornerDownLeft className="ml-auto size-3.5 text-slate-400" aria-hidden />
              </Command.Item>
            </Command.Group>
          ) : null}
          {nav.map((group) => (
            <Command.Group key={group.label} heading={group.label} className="mb-1 text-xs text-slate-500">
              {group.items.map((item) => (
                <Command.Item
                  key={item.key}
                  value={`${item.label} ${item.key}`}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-navy data-[selected=true]:bg-cobalt-soft"
                >
                  <span>{item.label}</span>
                  {item.shortcut ? <kbd className="rounded border border-slate-300 px-1.5 text-[11px] text-slate-500">{item.shortcut}</kbd> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
