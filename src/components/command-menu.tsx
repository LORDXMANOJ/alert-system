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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/40 p-4 pt-[12vh]" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onOpenChange(false);
    }}>
      <Command
        label="Command menu"
        loop
        className="w-full max-w-xl overflow-hidden border border-line-2 bg-ink-2"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-fg-3" aria-hidden />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Go to a page, or search applications…"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-fg-3">No match. Press Enter to search applications.</Command.Empty>
          {query.trim() ? (
            <Command.Group heading="Search">
              <Command.Item
                value={`search ${query}`}
                onSelect={() => go(`/applications?q=${encodeURIComponent(query.trim())}`)}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-fg data-[selected=true]:bg-ink-3"
              >
                <Search className="size-4 text-accent" aria-hidden />
                Search applications for &ldquo;{query.trim()}&rdquo;
                <CornerDownLeft className="ml-auto size-3.5 text-fg-3" aria-hidden />
              </Command.Item>
            </Command.Group>
          ) : null}
          {nav.map((group) => (
            <Command.Group key={group.label} heading={group.label} className="mb-1 text-xs text-fg-3">
              {group.items.map((item) => (
                <Command.Item
                  key={item.key}
                  value={`${item.label} ${item.key}`}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-fg data-[selected=true]:bg-ink-3"
                >
                  <span>{item.label}</span>
                  {item.shortcut ? <kbd className="border border-line-2 px-1.5 text-[11px] text-fg-3">{item.shortcut}</kbd> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
