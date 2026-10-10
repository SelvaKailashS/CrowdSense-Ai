import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FestFlow · Festival crowd and transport planning",
  description: "Forecast festival bus demand a week ahead, plan buses by stop and slot, and run the night from a control room.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <nav className="mx-auto max-w-7xl px-6 pt-6">
            <div className="neu-raised-sm flex items-center justify-between gap-4 px-5 py-3">
              <Link href="/" className="flex items-center gap-3">
                <span className="neu-inset grid h-10 w-10 place-items-center font-display text-sm font-semibold text-terra" style={{ borderRadius: 999 }}>
                  FF
                </span>
                <span className="font-display text-lg text-ink">FestFlow</span>
                <span className="hidden text-sm text-ink-soft sm:inline">Festival crowd and transport planning</span>
              </Link>
              <span className="neu-chip text-ochre">Prototype · illustrative numbers</span>
            </div>
          </nav>
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </div>
      </body>
    </html>
  );
}
