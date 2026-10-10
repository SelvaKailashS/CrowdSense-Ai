"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EngineResult } from "@/lib/festflow/engine";
import type { Mode, Scenario, StopInput } from "@/lib/festflow/types";
import { SCENARIOS } from "@/lib/festflow/types";
import { clockAt, fmtInt } from "@/lib/festflow/math";
import { QueueChart } from "./charts";
import { Card, Pill, Stat, STOP_COLORS, Well, btn, btnGhost, btnTone, inputCls, type Tone } from "./ui";
import { AiAdvisor } from "./AiAdvisor";

interface RunPayload {
  mode: Mode;
  capacity: number;
  buses: number[];
  reserveBuses: number;
  plannedRiders: number;
  actualRiders: number;
  actualPeakMinute: number;
  actualShares: number[];
  stopNames: string[];
  stopIds: number[];
  result: EngineResult;
}

interface CountRow {
  id: number;
  stopId: number;
  minute: number;
  waiting: number;
  loadFactorPct: number;
  cctvDensity: number;
  source: string;
  alert: number;
  createdAt: string;
}

const EVENT_TONE: Record<string, Tone> = {
  alert: "bad",
  reserve: "info",
  reforecast: "neutral",
  dispatch: "good",
  cutoff: "warn",
};

const COUNT_SOURCES = ["Marshal count", "Conductor count", "CCTV density", "Bus load factor"];

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft";
const TH = "py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function LiveView({ festivalId }: { festivalId: number }) {
  const [name, setName] = useState("");
  const [lastEnd, setLastEnd] = useState("21:30");
  const [threshold, setThreshold] = useState(1500);
  const [stops, setStops] = useState<StopInput[]>([]);
  const [mode, setMode] = useState<Mode>("festflow");
  const [plannedScenario, setPlannedScenario] = useState<Scenario>("base");
  const [actualScenario, setActualScenario] = useState<Scenario>("base");
  const [rain, setRain] = useState(40);
  const [shift, setShift] = useState(0);
  const [drift, setDrift] = useState(0);
  const [run, setRun] = useState<RunPayload | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [cStop, setCStop] = useState(0);
  const [cMinute, setCMinute] = useState(0);
  const [cWaiting, setCWaiting] = useState(0);
  const [cLoad, setCLoad] = useState(80);
  const [cDensity, setCDensity] = useState(2);
  const [cSource, setCSource] = useState(COUNT_SOURCES[0]);

  const loadFestival = useCallback(async () => {
    const r = await fetch(`/api/festivals/${festivalId}`);
    if (!r.ok) return;
    const j = await r.json();
    setName(j.inputs.name);
    setLastEnd(j.inputs.lastEventEnd);
    setThreshold(j.inputs.crowdThreshold);
    setStops(j.stops);
    if (j.stops.length > 0) setCStop(j.stops[0].id);
  }, [festivalId]);

  const loadCounts = useCallback(async () => {
    const r = await fetch(`/api/festivals/${festivalId}/counts`);
    if (r.ok) setCounts((await r.json()).counts);
  }, [festivalId]);

  const replay = useCallback(
    async (save: boolean) => {
      setBusy(true);
      setMsg(null);
      const r = await fetch(`/api/festivals/${festivalId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          plannedScenario,
          actualScenario,
          actualRainChance: rain,
          actualShiftMin: shift,
          guidanceDriftPts: drift,
          save,
        }),
      });
      const j = await r.json();
      setBusy(false);
      if (!r.ok) {
        setMsg(j.error ?? "Replay failed");
        return;
      }
      setRun(j.run);
      // Constraint-1: Preserve current timeline scrub position without resetting
      setIdx((prev) => (j.run?.result?.ticks?.length ? Math.min(prev, j.run.result.ticks.length - 1) : 0));
      if (save) setMsg("Saved as the actual night. The post-event report now uses it.");
    },
    [festivalId, mode, plannedScenario, actualScenario, rain, shift, drift],
  );

  useEffect(() => {
    loadFestival();
    loadCounts();
  }, [festivalId]);

  // Constraint-1: React to live changes automatically without manual re-run
  useEffect(() => {
    replay(false);
  }, [replay]);

  useEffect(() => {
    if (!playing || !run) return;
    const h = window.setInterval(() => setIdx((i) => Math.min(i + 1, run.result.ticks.length - 1)), 280);
    return () => window.clearInterval(h);
  }, [playing, run]);

  useEffect(() => {
    if (run && idx >= run.result.ticks.length - 1) setPlaying(false);
  }, [idx, run]);

  const submitCount = async () => {
    setMsg(null);
    const r = await fetch(`/api/festivals/${festivalId}/counts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stopId: cStop,
        minute: cMinute,
        waiting: cWaiting,
        loadFactorPct: cLoad,
        cctvDensity: cDensity,
        source: cSource,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error ?? "Could not record the count");
      return;
    }
    setMsg(
      j.alert
        ? `Count recorded. ALERT: at or above the ${fmtInt(threshold)} threshold. Notify police and marshals.`
        : "Count recorded.",
    );
    setCWaiting(0);
    await loadCounts();
  };

  const stopName = (id: number) => stops.find((s) => s.id === id)?.name ?? `Stop ${id}`;
  const ticks = run?.result.ticks ?? [];
  const cursor = Math.min(idx, Math.max(0, ticks.length - 1));
  const cur = ticks[cursor];
  const curT = cur ? cur.t : -30;
  const curClock = cur ? cur.clock : clockAt(lastEnd, -30);
  const events = run ? run.result.events.filter((e) => e.t <= curT) : [];
  const recentEvents = events.slice(-40).reverse();
  const reforecast = run ? run.result.reforecasts.filter((r) => r.t <= curT).slice(-1)[0] : undefined;
  const totals = run?.result.totals;
  const cap = run?.capacity ?? 70;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brick">Control room · event night</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{name || "Festival"}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Live queues by stop, dispatch and reserve decisions, crowd alerts, and 15-minute re-forecast from counts.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/festivals/${festivalId}`} className={btnGhost}>
            Planner
          </Link>
          <Link href={`/festivals/${festivalId}/report`} className={btnGhost}>
            Report
          </Link>
        </div>
      </header>

      <Card
        title="Live Ground Conditions & Incident Controls"
        subtitle="Real-time changes to rain, event lateness, or crowd surges automatically recalculate all queue predictions, timelines, and AI recommendations."
        right={
          <span className="neu-chip text-sage flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-sage animate-pulse" />
            Live Reactive Engine
          </span>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={LABEL}>Dispatch method</span>
            <select className={`${inputCls} mt-2`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="festflow">FestFlow rules and reserve</option>
              <option value="legacy">Last year: phone dispatch, fixed placement</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Planned scenario</span>
            <select className={`${inputCls} mt-2`} value={plannedScenario} onChange={(e) => setPlannedScenario(e.target.value as Scenario)}>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Actual crowd</span>
            <select className={`${inputCls} mt-2`} value={actualScenario} onChange={(e) => setActualScenario(e.target.value as Scenario)}>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Live Rain Probability %</span>
            <input
              className={`${inputCls} mt-2 font-semibold text-terra`}
              type="number"
              min={0}
              max={100}
              value={rain}
              onChange={(e) => setRain(Number(e.target.value))}
            />
            <span className="mt-1.5 block text-[11px] text-ink-soft">Rain compresses exit curve into a sharper peak</span>
          </label>
          <label className="block">
            <span className={LABEL}>Final Event Lateness (min)</span>
            <input
              className={`${inputCls} mt-2 font-semibold text-terra`}
              type="number"
              min={-30}
              max={120}
              step={5}
              value={shift}
              onChange={(e) => setShift(Number(e.target.value))}
            />
            <span className="mt-1.5 block text-[11px] text-ink-soft">e.g. +30 = headliner runs 30 min late</span>
          </label>
          <label className="block">
            <span className={LABEL}>Crowd ignores guidance (pts to main stand)</span>
            <input className={`${inputCls} mt-2`} type="number" min={0} max={40} step={1} value={drift} onChange={(e) => setDrift(Number(e.target.value))} />
            <span className="mt-1.5 block text-[11px] text-ink-soft">Crowd drift off peripheral terminals</span>
          </label>
          <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
            <button onClick={() => replay(true)} disabled={busy} className={btnGhost}>
              {busy ? "Saving…" : "Save as actual night (for Audit Report)"}
            </button>
          </div>
        </div>

        {/* Live Incident Trigger Presets (Constraint-1) */}
        <div className="mt-5 flex flex-wrap items-center gap-2 pt-4 border-t border-black/5 dark:border-white/5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft mr-1">
            Simulate Live Incidents:
          </span>
          <button
            type="button"
            onClick={() => setRain(85)}
            className={`neu-chip cursor-pointer transition-all ${
              rain >= 70 ? "text-terra font-bold ring-2 ring-terra" : "text-ink-soft hover:text-ink"
            }`}
          >
            🌧️ Rain Starting (85%)
          </button>
          <button
            type="button"
            onClick={() => setShift(30)}
            className={`neu-chip cursor-pointer transition-all ${
              shift === 30 ? "text-terra font-bold ring-2 ring-terra" : "text-ink-soft hover:text-ink"
            }`}
          >
            ⏱️ Final Event +30m Late
          </button>
          <button
            type="button"
            onClick={() => setActualScenario("high")}
            className={`neu-chip cursor-pointer transition-all ${
              actualScenario === "high" ? "text-terra font-bold ring-2 ring-terra" : "text-ink-soft hover:text-ink"
            }`}
          >
            🚨 Crowd Surge (+30%)
          </button>
          <button
            type="button"
            onClick={() => {
              setRain(20);
              setShift(0);
              setActualScenario("base");
              setDrift(0);
            }}
            className="neu-chip cursor-pointer text-sage hover:text-ink ml-auto"
          >
            ☀️ Reset Normal Conditions
          </button>
        </div>

        {msg && <p className="mt-4 text-sm text-sage font-medium">{msg}</p>}
      </Card>

      {run && totals && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-6">
            <Stat
              label="Peak queue, one stop"
              value={fmtInt(totals.peakQueue)}
              sub={`${totals.peakStop} at ${totals.peakClock}`}
              tone={totals.peakQueue >= threshold ? "bad" : totals.peakQueue >= threshold * 0.6 ? "warn" : "good"}
            />
            <Stat label="Average wait" value={`${totals.avgWaitMin} min`} sub="Riders who boarded" />
            <Stat
              label="Stranded at cutoff"
              value={`${totals.strandedPct}%`}
              sub={`${fmtInt(totals.stranded)} of ${fmtInt(totals.riders)} riders`}
              tone={totals.strandedPct > 2 ? "bad" : "good"}
            />
            <Stat
              label="Sent by rule"
              value={`${totals.rulePct}%`}
              sub={`${totals.dispatches} buses dispatched`}
              tone={totals.rulePct > 90 ? "good" : "warn"}
            />
            <Stat
              label="Reserve used"
              value={`${totals.reserveUsed} / ${run.reserveBuses}`}
              sub={run.mode === "festflow" ? "Reserve buses sent" : "No reserve in last year's plan"}
            />
            <Stat
              label="Crowd alerts"
              value={totals.alerts}
              sub={`Threshold ${fmtInt(threshold)} waiting`}
              tone={totals.alerts > 0 ? "bad" : "good"}
            />
          </div>

          <AiAdvisor
            context={{
              festivalName: name || "Festival",
              currentClock: curClock,
              minute: curMinute,
              threshold,
              stops: run.stopNames.map((n, s) => ({
                name: n,
                queue: cur ? cur.queues[s] ?? 0 : 0,
                readyBuses: cur ? cur.ready[s] ?? 0 : 0,
                status: cur
                  ? (cur.queues[s] ?? 0) >= threshold
                    ? "ALERT"
                    : (cur.queues[s] ?? 0) > cap / 2
                    ? "BEHIND"
                    : "OK"
                  : "OK",
              })),
              totalStranded: totals.stranded,
              totalAlerts: totals.alerts,
              reserveUsed: totals.reserveUsed,
              totalReserve: run.reserveBuses,
              rainChance: rain,
              mode: run.mode,
            }}
          />

          <Card
            title="Night timeline"
            subtitle="Scrub or play through the night. Each tick is 5 minutes of simulated time."
            right={
              <div className="flex items-center gap-3">
                <button onClick={() => setPlaying((p) => !p)} className={btnGhost}>
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setIdx(0);
                  }}
                  className={btnGhost}
                >
                  Reset
                </button>
                <span className="neu-chip w-20 justify-center font-mono text-sm text-ink">{curClock}</span>
              </div>
            }
          >
            <input
              type="range"
              min={0}
              max={Math.max(0, ticks.length - 1)}
              value={cursor}
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              className="w-full"
            />
            <Well className="mt-5">
              <QueueChart ticks={ticks} stopNames={run.stopNames} threshold={threshold} cursor={cursor} />
            </Well>
            <div className="mt-4 flex flex-wrap gap-5 text-xs text-ink-soft">
              {run.stopNames.map((n, i) => (
                <span key={n} className="inline-flex items-center gap-2">
                  <span className="neu-dot" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
                  {n}
                </span>
              ))}
            </div>

            <div className="mt-7 grid gap-5 md:grid-cols-3">
              {run.stopNames.map((n, s) => {
                const queue = cur ? cur.queues[s] ?? 0 : 0;
                const ready = cur ? cur.ready[s] ?? 0 : 0;
                const status: "ALERT" | "BEHIND" | "OK" = queue >= threshold ? "ALERT" : queue > cap / 2 ? "BEHIND" : "OK";
                const tone: Tone = status === "ALERT" ? "bad" : status === "BEHIND" ? "warn" : "good";
                return (
                  <div key={n} className="neu-inset p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        <span className="neu-dot mr-2 align-middle" style={{ background: STOP_COLORS[s % STOP_COLORS.length] }} />
                        {n}
                      </p>
                      <Pill tone={tone}>{status}</Pill>
                    </div>
                    <p className={`mt-3 font-display text-4xl tabular-nums ${status === "ALERT" ? "text-brick" : "text-ink"}`}>
                      {fmtInt(queue)}
                    </p>
                    <p className="text-xs text-ink-soft">waiting</p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-ink-soft">
                      <div>
                        <dt>Ready buses</dt>
                        <dd className="mt-0.5 font-semibold text-ink">
                          {ready} of {run.buses[s]}
                        </dd>
                      </div>
                      <div>
                        <dt>Ready capacity</dt>
                        <dd className="mt-0.5 font-semibold text-ink">{fmtInt(ready * cap)}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap gap-7 text-sm text-ink-soft">
              <span>
                Riders reached stops: <strong className="text-ink">{fmtInt(cur?.arrived ?? 0)}</strong>
              </span>
              <span>
                Boarded: <strong className="text-ink">{fmtInt(cur?.boarded ?? 0)}</strong>
              </span>
              <span>
                Buses on trip: <strong className="text-ink">{cur?.onTrip ?? 0}</strong>
              </span>
              <span>
                Reserve at depot: <strong className="text-ink">{cur?.reserveLeft ?? 0}</strong>
              </span>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Event log" className="xl:col-span-2" subtitle="Dispatch, reserve and alert decisions up to the current time.">
              <Well className="p-3">
                <ul className="max-h-[420px] space-y-3 overflow-y-auto px-2 py-2 pr-3">
                  {recentEvents.length === 0 && <li className="text-sm text-ink-soft">No events yet.</li>}
                  {recentEvents.map((e, i) => (
                    <li key={`${e.t}-${i}`} className="flex items-start gap-3 text-sm">
                      <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-ink-soft">{e.clock}</span>
                      <Pill tone={EVENT_TONE[e.kind] ?? "neutral"}>{e.kind}</Pill>
                      <span className="leading-relaxed text-ink">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </Well>
            </Card>

            <div className="space-y-6">
              <Card title="Re-forecast" subtitle="Updated every 15 minutes from observed arrivals.">
                {reforecast ? (
                  <div>
                    <p className="text-sm text-ink-soft">At {reforecast.clock}</p>
                    <p className="mt-1 font-display text-3xl text-ink">{fmtInt(reforecast.estimate)} riders</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      Range {fmtInt(reforecast.low)} to {fmtInt(reforecast.high)}
                    </p>
                    <p className="mt-3 text-xs text-ink-soft">Plan assumed {fmtInt(run.plannedRiders)} riders.</p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">Re-forecast starts at the last event end.</p>
                )}
              </Card>

              <Card title="Record a count" subtitle="Conductor, marshal, CCTV density or bus load factor.">
                <div className="grid grid-cols-2 gap-4">
                  <label className="col-span-2 block">
                    <span className={LABEL}>Stop</span>
                    <select className={`${inputCls} mt-2`} value={cStop} onChange={(e) => setCStop(Number(e.target.value))}>
                      {stops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Minute (rel. end)</span>
                    <input className={`${inputCls} mt-2`} type="number" value={cMinute} onChange={(e) => setCMinute(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Waiting</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} value={cWaiting} onChange={(e) => setCWaiting(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Bus load %</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} max={200} value={cLoad} onChange={(e) => setCLoad(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Density (p/m²)</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} step={0.1} value={cDensity} onChange={(e) => setCDensity(Number(e.target.value))} />
                  </label>
                  <label className="col-span-2 block">
                    <span className={LABEL}>Source</span>
                    <select className={`${inputCls} mt-2`} value={cSource} onChange={(e) => setCSource(e.target.value)}>
                      {COUNT_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button onClick={submitCount} className={`${btn} mt-5 w-full`}>
                  Record count
                </button>
              </Card>
            </div>
          </div>

          <Card title="Recorded counts" subtitle="Latest manual counts. Waiting at or above the threshold raises an official alert.">
            {counts.length === 0 ? (
              <p className="text-sm text-ink-soft">No manual counts yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>Time</th>
                      <th className={TH}>Stop</th>
                      <th className={TH}>Waiting</th>
                      <th className={TH}>Bus load</th>
                      <th className={TH}>Density</th>
                      <th className={TH}>Source</th>
                      <th className={TH}>Alert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {counts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{clockAt(lastEnd, c.minute)}</td>
                        <td className="py-3 pr-4">{stopName(c.stopId)}</td>
                        <td className="py-3 pr-4 tabular-nums">{fmtInt(c.waiting)}</td>
                        <td className="py-3 pr-4 tabular-nums">{c.loadFactorPct}%</td>
                        <td className="py-3 pr-4 tabular-nums">{c.cctvDensity}</td>
                        <td className="py-3 pr-4">{c.source}</td>
                        <td className="py-3">{c.alert ? <Pill tone="bad">Alert</Pill> : <Pill tone="good">Clear</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
