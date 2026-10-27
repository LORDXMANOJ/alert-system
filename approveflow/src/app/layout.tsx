import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApproveFlow AICTE · Approval & Compliance Command Centre",
  description: "SIH 2026 prototype for problem statement SIH26262. Fictional data. Not an official AICTE system.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster position="top-right" richColors closeButton />
        </MotionConfig>
      </body>
    </html>
  );
}
