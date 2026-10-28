/** ApproveFlow mark: an A whose crossbar is the approval tick. */
export function LogoMark({ size = 22, className, draw = false }: { size?: number; className?: string; draw?: boolean }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={32} strokeLinejoin="miter" strokeMiterlimit={10}>
        <path d="M46 224 128 38l82 186" pathLength={1} className={draw ? "af-draw-a" : undefined} />
        <path d="M86 152l30 30 52.4-52.4" pathLength={1} className={draw ? "af-draw-tick" : undefined} />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-accent ${className ?? ""}`}>
      <LogoMark size={20} />
      <span className="font-display text-[15px] font-normal tracking-[-0.01em] text-fg">ApproveFlow</span>
    </span>
  );
}
