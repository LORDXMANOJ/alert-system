import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, CheckCircle2, Clock, AlertTriangle, Circle, CornerUpLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";

export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));

/* ---------- Buttons ---------- */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 select-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-cobalt text-white shadow-sm hover:bg-cobalt-hover active:bg-cobalt",
    variant === "secondary" && "border border-slate-300 bg-white text-navy shadow-sm hover:bg-slate-50",
    variant === "danger" && "bg-crimson text-white shadow-sm hover:bg-red-700",
    variant === "ghost" && "text-cobalt hover:bg-cobalt-soft",
    extra,
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* ---------- Form controls ---------- */

export const inputCls =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-navy placeholder:text-slate-400 shadow-sm focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/20 disabled:bg-slate-100";
export const textareaCls =
  "min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy placeholder:text-slate-400 shadow-sm focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/20";
export const selectCls = inputCls;

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-navy">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* ---------- Surfaces ---------- */

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-navy">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px] text-slate-500">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3.5 text-slate-400" aria-hidden /> : null}
              {c.href ? (
                <Link href={c.href} className="rounded hover:text-cobalt hover:underline underline-offset-2">
                  {c.label}
                </Link>
              ) : (
                <span className="text-slate-700" aria-current="page">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-[26px]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div> : null}
      <p className="text-sm font-medium text-navy">{title}</p>
      {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------- Status ---------- */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "navy";

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-cobalt-soft text-cobalt ring-blue-200",
  success: "bg-success-soft text-success ring-green-200",
  warning: "bg-amber-soft text-amber-text ring-amber-200",
  danger: "bg-crimson-soft text-crimson ring-red-200",
  navy: "bg-navy text-white ring-navy",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function daysFrom(date: Date, nowDate: Date): number {
  return Math.floor((date.getTime() - nowDate.getTime()) / (24 * 3600 * 1000));
}

/** Shows how close a deadline is. Red when overdue, amber within a week, neutral otherwise. */
export function SlaBadge({ dueAt, decided, nowDate }: { dueAt: Date; decided?: boolean; nowDate: Date }) {
  if (decided) return <Badge tone="neutral">Closed</Badge>;
  const d = daysFrom(dueAt, nowDate);
  if (d < 0) return <Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />Overdue by {Math.abs(d)} d</Badge>;
  if (d === 0) return <Badge tone="warning"><Clock className="size-3" aria-hidden />Due today</Badge>;
  if (d <= 7) return <Badge tone="warning"><Clock className="size-3" aria-hidden />Due in {d} d</Badge>;
  return <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />On track · {d} d</Badge>;
}

/** Horizontal stepper for the configured stages of a workflow. */
export function StageStepper({
  stages,
  currentPosition,
  decided,
  returned,
}: {
  stages: { position: number; name: string; is_evc?: boolean; is_decision?: boolean }[];
  currentPosition: number;
  decided: boolean;
  returned: boolean;
}) {
  return (
    <ol className="flex w-full items-start gap-0 overflow-x-auto pb-1" aria-label="Workflow stages">
      {stages.map((s, idx) => {
        const done = decided ? true : s.position < currentPosition;
        const current = !decided && s.position === currentPosition;
        const last = idx === stages.length - 1;
        return (
          <li key={s.position} className="flex min-w-[120px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", idx === 0 ? "bg-transparent" : done || current ? "bg-cobalt" : "bg-slate-200")} aria-hidden />
              <span
                className={cn(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-white",
                  done && "border-success bg-success text-white",
                  current && !returned && "af-current-stage border-cobalt text-cobalt",
                  current && returned && "border-amber bg-amber-soft text-amber-text",
                  !done && !current && "border-slate-300 text-slate-400",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <CheckCircle2 className="size-4" aria-hidden /> : current && returned ? <CornerUpLeft className="size-4" aria-hidden /> : current ? <Clock className="size-4" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
                <span className="sr-only">{done ? "completed" : current ? (returned ? "returned for clarification" : "current stage") : "pending"}</span>
              </span>
              <span className={cn("h-0.5 flex-1", last ? "bg-transparent" : done ? "bg-success" : "bg-slate-200")} aria-hidden />
            </div>
            <p className={cn("mt-2 px-1 text-xs leading-tight", current ? "font-semibold text-navy" : "text-slate-600")}>
              {s.name}
            </p>
            <p className="text-[11px] text-slate-400">{s.is_evc ? "EVC stage" : s.is_decision ? "Final decision" : ""}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** Thin bar that shows how much validity is left, against a 365-day scale. */
export function ValidityBar({ days }: { days: number | null }) {
  if (days === null) return <div className="h-1.5 w-full rounded-full bg-slate-200" aria-hidden />;
  const pct = Math.max(0, Math.min(100, (days / 365) * 100));
  const tone = days < 0 ? "bg-crimson" : days <= 30 ? "bg-amber" : "bg-success";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label={days < 0 ? "Expired" : `${days} days remaining`}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${days < 0 ? 100 : pct}%` }} />
    </div>
  );
}

export function Kpi({
  label,
  value,
  href,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  tone?: "neutral" | "danger" | "warning" | "info";
  hint?: string;
}) {
  const accent = { neutral: "border-l-slate-300", danger: "border-l-crimson", warning: "border-l-amber", info: "border-l-cobalt" }[tone];
  const body = (
    <div className={cn("h-full rounded-xl border border-slate-200 border-l-4 bg-white px-5 py-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow duration-150", accent, href && "hover:shadow-md")}>
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="tnum mt-1 text-3xl font-semibold tracking-tight text-navy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-offset-4">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ---------- Tables ---------- */

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}

export const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap";
export const td = "px-3 py-3 align-middle text-sm text-slate-700";
