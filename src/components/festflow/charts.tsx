import { fmtInt } from "@/lib/festflow/math";
import { STOP_COLORS } from "./ui";

// Chart palette: pencil-like ink for axes, warm grey for grid.
const GRID = "#d2cabf";
const AXIS_TEXT = "#6b6358";
const INK = "#3a3631";
const BRICK = "#a0392c";

interface ForecastSlot {
  minute: number;
  clock: string;
  riders: number;
  byStop: number[];
}

// Stacked 15-minute departure forecast by stop, with low and high scenario envelopes.
export function ForecastChart({
  slots,
  low,
  high,
  stopNames,
  lastBusMin,
}: {
  slots: ForecastSlot[];
  low: number[];
  high: number[];
  stopNames: string[];
  lastBusMin: number;
}) {
  const W = 760;
  const H = 280;
  const P = { l: 52, r: 14, t: 14, b: 40 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const n = slots.length;
  const maxY = Math.max(1, ...slots.map((s) => s.riders), ...high) * 1.12;
  const bw = iw / Math.max(1, n);
  const x = (i: number) => P.l + i * bw + bw / 2;
  const y = (v: number) => P.t + ih - (v / maxY) * ih;
  const lastBusIdx = (lastBusMin - slots[0].minute) / 15;
  const zeroIdx = (0 - slots[0].minute) / 15;
  const line = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Departure forecast chart">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={P.l} x2={W - P.r} y1={y(maxY * f)} y2={y(maxY * f)} stroke={GRID} />
          <text x={P.l - 6} y={y(maxY * f) + 4} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
            {fmtInt(maxY * f)}
          </text>
        </g>
      ))}
      {slots.map((s, i) => {
        let acc = 0;
        return s.byStop.map((v, k) => {
          const top = y(acc + v);
          const bottom = y(acc);
          acc += v;
          return (
            <rect
              key={`${i}-${k}`}
              x={x(i) - bw * 0.38}
              y={top}
              width={bw * 0.76}
              height={Math.max(0, bottom - top)}
              rx={2}
              fill={STOP_COLORS[k % STOP_COLORS.length]}
              opacity={0.9}
            >
              <title>{`${s.clock} · ${stopNames[k] ?? "Stop"}: ${fmtInt(v)}`}</title>
            </rect>
          );
        });
      })}
      <polyline points={line(low)} fill="none" stroke={AXIS_TEXT} strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={line(high)} fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="1 3" />
      <line x1={P.l + zeroIdx * bw} x2={P.l + zeroIdx * bw} y1={P.t} y2={P.t + ih} stroke={INK} strokeDasharray="3 3" />
      <text x={P.l + zeroIdx * bw + 4} y={P.t + 10} fontSize="10" fill={INK}>
        Last event ends
      </text>
      {lastBusIdx >= 0 && lastBusIdx < n && (
        <>
          <line
            x1={P.l + lastBusIdx * bw}
            x2={P.l + lastBusIdx * bw}
            y1={P.t}
            y2={P.t + ih}
            stroke={BRICK}
            strokeDasharray="3 3"
          />
          <text x={P.l + lastBusIdx * bw - 4} y={P.t + 10} textAnchor="end" fontSize="10" fill={BRICK}>
            Last bus
          </text>
        </>
      )}
      {slots.map((s, i) =>
        i % 2 === 0 ? (
          <text key={`lbl-${i}`} x={x(i)} y={H - 18} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
            {s.clock}
          </text>
        ) : null,
      )}
    </svg>
  );
}

interface QueueTick {
  t: number;
  clock: string;
  queues: number[];
}

// Queue length per stop over the night, with the crowd threshold and the playhead.
export function QueueChart({
  ticks,
  stopNames,
  threshold,
  cursor,
}: {
  ticks: QueueTick[];
  stopNames: string[];
  threshold: number;
  cursor: number;
}) {
  const W = 760;
  const H = 260;
  const P = { l: 56, r: 14, t: 14, b: 34 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const n = ticks.length;
  const peak = Math.max(0, ...ticks.flatMap((t) => t.queues));
  const maxY = Math.max(threshold * 1.15, peak * 1.05, 10);
  const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * iw;
  const y = (v: number) => P.t + ih - (v / maxY) * ih;
  const stopCount = stopNames.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Queue length by stop">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={P.l} x2={W - P.r} y1={y(maxY * f)} y2={y(maxY * f)} stroke={GRID} />
          <text x={P.l - 6} y={y(maxY * f) + 4} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
            {fmtInt(maxY * f)}
          </text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={y(threshold)} y2={y(threshold)} stroke={BRICK} strokeDasharray="5 4" />
      <text x={W - P.r - 4} y={y(threshold) - 4} textAnchor="end" fontSize="10" fill={BRICK}>
        Crowd threshold {fmtInt(threshold)}
      </text>
      {Array.from({ length: stopCount }, (_, s) => (
        <polyline
          key={s}
          fill="none"
          stroke={STOP_COLORS[s % STOP_COLORS.length]}
          strokeWidth="2.2"
          strokeLinejoin="round"
          points={ticks.map((t, i) => `${x(i)},${y(t.queues[s] ?? 0)}`).join(" ")}
        />
      ))}
      {n > 0 && (
        <line
          x1={x(Math.min(cursor, n - 1))}
          x2={x(Math.min(cursor, n - 1))}
          y1={P.t}
          y2={P.t + ih}
          stroke={INK}
          strokeWidth="1"
        />
      )}
      {ticks.map((t, i) =>
        i % 12 === 0 ? (
          <text key={`tl-${i}`} x={x(i)} y={H - 12} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
            {t.clock}
          </text>
        ) : null,
      )}
    </svg>
  );
}
