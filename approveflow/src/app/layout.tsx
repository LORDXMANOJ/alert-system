import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Schibsted_Grotesk, Unbounded } from "next/font/google";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import "./globals.css";

const display = Unbounded({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-unbounded" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-schibsted" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "ApproveFlow",
  description: "Approval workflow, compliance monitoring and alerts for technical-education approvals.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "#131016",
                border: "1px solid #3b3242",
                borderRadius: 0,
                color: "#eceeed",
                fontFamily: "var(--font-schibsted)",
              },
            }}
          />
        </MotionConfig>
      </body>
    </html>
  );
}
