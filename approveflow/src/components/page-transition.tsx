"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Content rises and fades in on every route change (about 180 ms). Reduced motion removes the movement. */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
