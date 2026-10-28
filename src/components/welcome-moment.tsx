"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LogoMark } from "./logo";

/** The moment between sign-in and the dashboard: the mark draws, the greeting settles, the screen flows away. */
export function WelcomeMoment({ greeting, role }: { greeting: string; role: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    router.prefetch("/");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leave = window.setTimeout(() => setLeaving(true), reduce ? 200 : 1450);
    const go = window.setTimeout(() => router.replace("/"), reduce ? 300 : 1800);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(go);
    };
  }, [router]);

  return (
    <motion.main
      className="flex min-h-[100dvh] items-center bg-ink px-8 sm:px-[12vw]"
      animate={leaving ? { clipPath: "inset(0 0 0 100%)" } : { clipPath: "inset(0 0 0 0%)" }}
      transition={{ duration: 0.35, ease: [0.7, 0, 0.84, 0] }}
      aria-live="polite"
    >
      <div>
        <span className="text-accent">
          <LogoMark size={72} draw />
        </span>
        <motion.p
          className="mt-10 font-display text-[30px] font-light tracking-[-0.02em] text-fg sm:text-[40px]"
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.55, type: "spring", bounce: 0, duration: 0.6 }}
        >
          {greeting}
        </motion.p>
        <motion.p
          className="mt-2 text-sm text-fg-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.4 }}
        >
          {role}
        </motion.p>
        <div className="af-grow mt-8 h-px w-[min(420px,70vw)] bg-accent" style={{ animationDelay: "700ms" }} aria-hidden />
      </div>
    </motion.main>
  );
}
