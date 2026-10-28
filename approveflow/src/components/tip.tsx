"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/**
 * Hover and focus tooltip, rendered in a portal so table scroll areas never clip it.
 * The text is also present for screen readers inside the trigger.
 */
export function Tip({ label, children, className, style }: { label: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const [armed, setArmed] = useState(false);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 64;
    setArmed(true);
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
  }

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className ?? ""}`}
      style={style}
      onPointerEnter={show}
      onPointerLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      <span className="sr-only">{label}</span>
      {armed
        ? createPortal(
            <AnimatePresence>
              {pos ? (
                <motion.span
                  aria-hidden
                  initial={{ opacity: 0, y: pos.below ? -4 : 4, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                  className="pointer-events-none fixed z-[70] max-w-[280px] bg-fg px-3 py-2 text-[13px] leading-snug text-ink shadow-[0_10px_28px_rgb(43_18_38/0.28)]"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    translateX: "-50%",
                    translateY: pos.below ? "0%" : "-100%",
                  }}
                >
                  {label}
                </motion.span>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </span>
  );
}
