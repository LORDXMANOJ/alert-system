import type { Role } from "@/server/permissions";

/** Client-safe navigation. Each item lists the roles that see it; pages enforce permissions again on the server. */
export type NavKey =
  | "overview"
  | "applications"
  | "workflow"
  | "scrutiny"
  | "evc"
  | "undertakings"
  | "compliance"
  | "documents"
  | "tasks"
  | "notifications"
  | "reports"
  | "audit"
  | "users"
  | "workflows"
  | "settings";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  roles: Role[] | "all";
  shortcut?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { key: "overview", label: "Overview", href: "/", roles: "all", shortcut: "g o" },
      { key: "applications", label: "Applications", href: "/applications", roles: "all", shortcut: "g a" },
      { key: "workflow", label: "Pipeline", href: "/workflow", roles: ["admin", "regional", "bureau", "reviewer", "evc", "authority", "auditor"] },
      { key: "scrutiny", label: "Scrutiny", href: "/scrutiny", roles: ["bureau", "reviewer", "regional", "auditor", "admin"] },
      { key: "evc", label: "EVC visits", href: "/evc", roles: ["evc", "regional", "bureau", "admin", "auditor"], shortcut: "g e" },
      { key: "undertakings", label: "Undertakings", href: "/undertakings", roles: ["institution", "bureau", "reviewer", "regional", "admin", "auditor"] },
      { key: "compliance", label: "Compliance", href: "/compliance", roles: ["institution", "reviewer", "regional", "admin", "auditor"] },
      { key: "documents", label: "Documents", href: "/documents", roles: ["institution", "reviewer", "regional", "admin", "auditor"] },
      { key: "tasks", label: "Alerts", href: "/alerts", roles: "all", shortcut: "g t" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { key: "notifications", label: "Notifications", href: "/notifications", roles: "all", shortcut: "g n" },
      { key: "reports", label: "Reports", href: "/reports", roles: ["regional", "admin", "auditor"], shortcut: "g r" },
      { key: "audit", label: "Audit", href: "/audit", roles: ["admin", "auditor"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "users", label: "People", href: "/admin/users", roles: ["admin"] },
      { key: "workflows", label: "Workflows", href: "/admin/workflows", roles: ["admin"] },
      { key: "settings", label: "Settings", href: "/admin/settings", roles: ["admin"] },
    ],
  },
];

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles === "all" || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
