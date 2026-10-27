"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";

/** Counts up once when it first appears. Under reduced motion the change is instant. */
export function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = animate(ref.current, value, {
      duration: reduce ? 0 : 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    ref.current = value;
    return () => controls.stop();
  }, [value]);

  return <span className="tnum">{display}</span>;
}
