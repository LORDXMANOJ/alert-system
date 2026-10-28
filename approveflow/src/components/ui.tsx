import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { Tip } from "./tip";

export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));

/* ---------- Buttons (square, tactile) ---------- */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-40",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-accent text-ink hover:bg-accent-hover",
    variant === "secondary" && "border border-line-2 text-fg hover:border-fg-3 hover:bg-ink-3",
    variant === "danger" && "bg-late text-ink hover:bg-[#9b1d42]",
    variant === "ghost" && "px-0 text-accent hover:underline",
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

const control =
  "w-full border border-line-2 bg-ink-2 text-sm text-fg placeholder:text-fg-3 transition-colors focus:border-accent focus:outline-none disabled:opacity-50";
export const inputCls = `h-10 px-3 ${control}`;
export const textareaCls = `min-h-24 px-3 py-2 ${control}`;
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
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-2">
        <label htmlFor={htmlFor}>{label}</label>
        {hint ? <InfoTip text={hint} /> : null}
      </span>
      {children}
    </div>
  );
}

/** A small info glyph that reveals supporting text on hover, so screens stay quiet. */
export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <Tip label={text}>
      <Info className="size-3.5 text-fg-3 hover:text-fg" aria-hidden />
    </Tip>
  );
}

/* ---------- Structure: sections, not cards ---------- */

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
    <section id={id} className={cn("border-t border-line", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-3">
          {title ? (
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
              {title}
              {description ? <InfoTip text={description} /> : null}
            </h2>
          ) : (
            <span />
          )}
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("pb-4", !title && !actions && "pt-4", bodyClassName)}>{children}</div>
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
    <div className="mb-8 flex flex-col gap-3">
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs text-fg-3">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {c.href ? (
                <Link href={c.href} className="hover:text-accent">
                  {c.label}
                </Link>
              ) : (
                <span className="text-fg-2" aria-current="page">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="flex max-w-4xl items-center gap-3 font-display text-[26px] font-light leading-tight tracking-[-0.02em] text-fg sm:text-[32px]">
          <span className="text-balance">{title}</span>
          {description ? <InfoTip text={description} /> : null}
        </h1>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
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
    <div className="flex items-start gap-3 py-8">
      {icon ? <span className="mt-0.5 text-fg-3">{icon}</span> : null}
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-fg-3">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Status: colour first, words on hover ---------- */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "navy";
export type Signal = "ok" | "wait" | "soon" | "late" | "done" | "none";

const SIGNAL_BG: Record<Signal, string> = {
  ok: "bg-ok",
  wait: "bg-sky",
  soon: "bg-amber",
  late: "bg-late",
  done: "bg-grape",
  none: "bg-line-2",
};
const SIGNAL_TEXT: Record<Signal, string> = {
  ok: "text-ok",
  wait: "text-sky",
  soon: "text-amber",
  late: "text-late",
  done: "text-accent",
  none: "text-fg-3",
};
const TONE_TO_SIGNAL: Record<Tone, Signal> = {
  neutral: "none",
  info: "wait",
  success: "ok",
  warning: "soon",
  danger: "late",
  navy: "done",
};

export function signalBg(s: Signal) {
  return SIGNAL_BG[s];
}
export function signalText(s: Signal) {
  return SIGNAL_TEXT[s];
}

/** A square status mark. The meaning is in the colour; the explanation is in the tooltip. */
export function Mark({ signal, label, size = 10 }: { signal: Signal; label: ReactNode; size?: number }) {
  return (
    <Tip label={label}>
      <span className={cn("inline-block shrink-0", SIGNAL_BG[signal])} style={{ width: size, height: size }} aria-hidden />
    </Tip>
  );
}

/** Small categorical tag: coloured text with a mark, never a filled pill. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const s = TONE_TO_SIGNAL[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", SIGNAL_TEXT[s], className)}>
      <span className={cn("size-1.5 shrink-0", SIGNAL_BG[s])} aria-hidden />
      {children}
    </span>
  );
}

export function daysFrom(date: Date, nowDate: Date): number {
  return Math.floor((date.getTime() - nowDate.getTime()) / (24 * 3600 * 1000));
}

function fmtShort(d: Date) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function deadlineSignal(dueAt: Date, nowDate: Date, decided?: boolean): { signal: Signal; level: number; text: string } {
  if (decided) return { signal: "done", level: 0, text: "Closed" };
  const d = daysFrom(dueAt, nowDate);
  if (d < 0) return { signal: "late", level: 5, text: `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}. Was due ${fmtShort(dueAt)}` };
  if (d === 0) return { signal: "soon", level: 4, text: `Due today, ${fmtShort(dueAt)}` };
  if (d <= 3) return { signal: "soon", level: 4, text: `Due in ${d} day${d === 1 ? "" : "s"}, ${fmtShort(dueAt)}` };
  if (d <= 7) return { signal: "soon", level: 3, text: `Due in ${d} days, ${fmtShort(dueAt)}` };
  if (d <= 15) return { signal: "ok", level: 2, text: `On track. Due ${fmtShort(dueAt)}` };
  return { signal: "ok", level: 1, text: `On track. Due ${fmtShort(dueAt)}` };
}

/** Deadline meter: five ticks that fill and change colour as a deadline approaches. Detail on hover. */
export function SlaBadge({ dueAt, decided, nowDate }: { dueAt: Date; decided?: boolean; nowDate: Date }) {
  const { signal, level, text } = deadlineSignal(dueAt, nowDate, decided);
  return (
    <Tip label={text}>
      <span className="inline-flex h-4 items-end gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("w-[3px]", i <= level ? SIGNAL_BG[signal] : "bg-line-2")} style={{ height: 6 + i * 2 }} />
        ))}
      </span>
    </Tip>
  );
}

/** Workflow stages as a line of square nodes. */
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
    <ol className="grid w-full overflow-x-auto" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(110px, 1fr))` }} aria-label="Workflow stages">
      {stages.map((s, idx) => {
        const done = decided || s.position < currentPosition;
        const current = !decided && s.position === currentPosition;
        const state = done ? "Completed" : current ? (returned ? "Returned for clarification" : "In progress") : "Not started";
        return (
          <li key={s.position} className="flex flex-col gap-3" aria-current={current ? "step" : undefined}>
            <div className="flex items-center">
              <Tip label={`${s.name}: ${state}`}>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center border",
                    done && "border-accent bg-accent",
                    current && !returned && "border-accent",
                    current && returned && "border-amber",
                    !done && !current && "border-line-2",
                  )}
                >
                  {current ? <span className={cn("size-1.5", returned ? "bg-amber" : "bg-accent")} /> : null}
                </span>
              </Tip>
              {idx < stages.length - 1 ? <span className={cn("h-px flex-1", done ? "bg-accent" : "bg-line-2")} aria-hidden /> : null}
            </div>
            <p className={cn("pr-3 text-[13px] leading-tight", current ? "font-semibold text-fg" : done ? "text-fg-2" : "text-fg-3")}>{s.name}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** Thin validity bar against a 365-day scale. */
export function ValidityBar({ days }: { days: number | null }) {
  if (days === null) return <div className="h-[3px] w-full bg-line-2" aria-hidden />;
  const pct = Math.max(0, Math.min(100, (days / 365) * 100));
  const tone = days < 0 ? "bg-late" : days <= 30 ? "bg-amber" : "bg-ok";
  return (
    <div className="h-[3px] w-full bg-line-2" role="img" aria-label={days < 0 ? "Expired" : `${days} days remaining`}>
      <div className={cn("h-full", tone)} style={{ width: `${days < 0 ? 100 : pct}%` }} />
    </div>
  );
}

/** A figure: number and label set as type, no container. */
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
  const color = { neutral: "text-fg", danger: "text-late", warning: "text-amber", info: "text-accent" }[tone];
  const body = (
    <div className="group py-1">
      <p className={cn("tnum font-display text-[34px] font-light leading-none tracking-[-0.03em]", color)}>{value}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-fg-3 group-hover:text-fg-2">
        {label}
        {hint ? <InfoTip text={hint} /> : null}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
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

export const th = "py-2.5 pr-4 text-left text-xs font-medium text-fg-3 whitespace-nowrap";
export const td = "py-3 pr-4 align-middle text-sm text-fg-2";
