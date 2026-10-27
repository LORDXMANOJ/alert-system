import type { ReactNode } from "react";

/** Every page change: a tea-green line sweeps the top edge and the content flows in from the left. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="af-sweep pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-tea" />
      <div className="af-page">{children}</div>
    </>
  );
}
