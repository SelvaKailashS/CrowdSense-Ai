import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

// Muted, earthy stop colours (terracotta, ochre, sage, plum, slate blue, stone).
export const STOP_COLORS = ["#c46a3c", "#c9962f", "#6f9079", "#7d6b98", "#5d7ea0", "#9a8c7c"];

export const STATUS_TONE: Record<string, Tone> = {
  "On plan": "good",
  Behind: "warn",
  Alert: "bad",
  Idle: "neutral",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink-soft",
  good: "text-sage",
  warn: "text-ochre",
  bad: "text-brick",
  info: "text-slateblue",
};

const VALUE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-sage",
  warn: "text-ochre",
  bad: "text-brick",
  info: "text-slateblue",
};

// Primary action: raised, terracotta text.
export const btn = "neu-btn text-terra";
// Secondary action: raised, ink text.
export const btnGhost = "neu-btn text-ink";
// Toggle: pressed into the surface when active.
export function btnTone(active: boolean): string {
  return active ? "neu-btn neu-btn-on text-terra" : "neu-btn text-ink";
}
export const inputCls = "neu-field";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`neu-raised p-6 ${className}`}>
      {(title || right) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-xl text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// A pressed-in container for charts and grouped content.
export function Well({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`neu-inset p-4 ${className}`}>{children}</div>;
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`neu-chip ${TONE_TEXT[tone]}`}>{children}</span>;
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="neu-inset p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className={`mt-1.5 font-display text-2xl tabular-nums ${VALUE_TEXT[tone]}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{sub}</p>}
    </div>
  );
}
