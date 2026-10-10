"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineResult, EngineEvent } from "@/lib/festflow/engine";
import type { Mode, Scenario, StopInput } from "@/lib/festflow/types";
import { SCENARIOS } from "@/lib/festflow/types";
import { clockAt, fmtInt } from "@/lib/festflow/math";
import { QueueChart } from "./charts";
import { Card, Pill, Stat, STOP_COLORS, Well, btn, btnGhost, btnTone, inputCls, type Tone } from "./ui";
import { AiAdvisor } from "./AiAdvisor";
import { TransitMap } from "./TransitMap";
import Link, { navigateTo } from "@/shim/next-link";

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

interface FlashNotification {
  type: "success" | "warn" | "info";
  message: string;
  id: number;
}

const EVENT_TONE: Record<string, Tone> = {
  alert: "bad",
  reserve: "info",
  reforecast: "neutral",
  dispatch: "good",
  cutoff: "warn",
};

const COUNT_SOURCES = [
  "Marshal headcount",
  "CCTV density AI",
  "Aggregated mobile network (Cellular pings)",
  "Conductor ticket scan",
  "Bus load factor",
];

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
  const [idx, setIdx] = useState(9); // Default to peak crowd departure (21:45)
  const [hasInitializedIdx, setHasInitializedIdx] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [cStop, setCStop] = useState(0);
  const [cMinute, setCMinute] = useState(0);
  const [cWaiting, setCWaiting] = useState(0);
  const [cLoad, setCLoad] = useState(80);
  const [cDensity, setCDensity] = useState(2);
  const [cSource, setCSource] = useState(COUNT_SOURCES[0]);

  // Live Manual Dispatch Overrides
  const [manualDeductions, setManualDeductions] = useState<Record<number, number>>({});
  const [manualReserveExtra, setManualReserveExtra] = useState<Record<number, number>>({});
  const [manualReserveUsed, setManualReserveUsed] = useState(0);
  const [manualDispatchesCount, setManualDispatchesCount] = useState(0);
  const [manualBoardedCount, setManualBoardedCount] = useState(0);
  const [manualEvents, setManualEvents] = useState<EngineEvent[]>([]);
  const [flash, setFlash] = useState<FlashNotification | null>(null);

  const loadFestival = useCallback(async () => {
    try {
      const r = await fetch(`/api/festivals/${festivalId}`);
      if (!r.ok) return;
      const j = await r.json();
      setName(j.inputs.name);
      setLastEnd(j.inputs.lastEventEnd);
      setThreshold(j.inputs.crowdThreshold);
      setStops(j.stops || []);
      if (j.stops && j.stops.length > 0) setCStop(j.stops[0].id);
    } catch (e) {
      console.error("Error loading festival in LiveView", e);
    }
  }, [festivalId]);

  const loadCounts = useCallback(async () => {
    try {
      const r = await fetch(`/api/festivals/${festivalId}/counts`);
      if (r.ok) setCounts((await r.json()).counts || []);
    } catch (e) {
      console.error("Error loading counts", e);
    }
  }, [festivalId]);

  const replay = useCallback(
    async (save: boolean) => {
      setBusy(true);
      setMsg(null);
      try {
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

        // Guarantee stopNames and stopIds are populated
        const safeRun = j.run
          ? {
              ...j.run,
              stopNames:
                j.run.stopNames && j.run.stopNames.length > 0
                  ? j.run.stopNames
                  : stops.length > 0
                  ? stops.map((s) => s.name)
                  : ["Main Gate Terminal", "North Plaza Shuttle", "South Park & Ride"],
              stopIds:
                j.run.stopIds && j.run.stopIds.length > 0
                  ? j.run.stopIds
                  : stops.length > 0
                  ? stops.map((s) => s.id)
                  : [1, 2, 3],
            }
          : null;

        setRun(safeRun);

        // Default to peak surge on initial load so the control room is active immediately
        setIdx((prev) => {
          if (!hasInitializedIdx) {
            setHasInitializedIdx(true);
            const peakIdx = safeRun?.result?.ticks?.findIndex((t: any) => t.t === 15);
            return peakIdx && peakIdx > 0 ? peakIdx : 9;
          }
          return safeRun?.result?.ticks?.length ? Math.min(prev, safeRun.result.ticks.length - 1) : 0;
        });

        if (save) setMsg("Saved as the actual night. The post-event report now uses it.");
      } catch (e) {
        setBusy(false);
        console.error("Simulation request failed", e);
      }
    },
    [festivalId, mode, plannedScenario, actualScenario, rain, shift, drift, hasInitializedIdx, stops],
  );

  useEffect(() => {
    loadFestival();
    loadCounts();
  }, [festivalId]);

  // Constraint-1: React to live changes automatically without manual re-run
  useEffect(() => {
    replay(false);
  }, [replay]);

  // Timeline playback loop with speed multiplier and boundary protection
  useEffect(() => {
    if (!playing || !run) return;
    const intervalMs = Math.round(280 / speed);
    const h = window.setInterval(() => {
      setIdx((i) => {
        if (i >= run.result.ticks.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(h);
  }, [playing, run, speed]);

  const showFlash = (type: "success" | "warn" | "info", message: string) => {
    setFlash({ type, message, id: Date.now() });
    setTimeout(() => {
      setFlash((f) => (f && Date.now() - f.id >= 4500 ? null : f));
    }, 5000);
  };

  const submitCount = async () => {
    setMsg(null);
    try {
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
          ? `Count recorded. ALERT: at or above the ${fmtInt(threshold)} threshold. Ground alert triggered.`
          : "Ground count recorded successfully.",
      );
      showFlash("info", `Ground count recorded for Stop #${cStop}: ${fmtInt(cWaiting)} waiting (${cSource})`);
      setCWaiting(0);
      await loadCounts();
    } catch (e) {
      console.error(e);
    }
  };

  const stopNames: string[] =
    run?.stopNames && run.stopNames.length > 0
      ? run.stopNames
      : stops.length > 0
      ? stops.map((s) => s.name)
      : ["Main Gate Terminal", "North Plaza Shuttle", "South Park & Ride"];

  const stopName = (id: number) => stops.find((s) => s.id === id)?.name ?? `Stop ${id}`;
  const ticks = run?.result?.ticks ?? [];
  const cursor = Math.min(idx, Math.max(0, ticks.length - 1));
  const cur = ticks[cursor];
  const curT = cur ? cur.t : 0;
  const curClock = cur ? cur.clock : clockAt(lastEnd, 0);
  const cap = run?.capacity ?? 70;

  // Manual Dispatch Action Handlers (Always Works)
  const handleManualDispatch = (stopIndex: number) => {
    if (!run) return;
    const stopObj = stops[stopIndex];
    const sName = stopObj?.name ?? stopNames[stopIndex] ?? `Stop ${stopIndex + 1}`;
    const baseQ = cur ? cur.queues[stopIndex] ?? 0 : 0;
    const deducted = manualDeductions[stopIndex] ?? 0;
    const currentQ = Math.max(0, baseQ - deducted);

    const busNumber = Math.floor(100 + Math.random() * 899);

    if (currentQ <= 0) {
      // Dispatch empty / headway maintenance bus
      setManualDispatchesCount((c) => c + 1);
      const event: EngineEvent = {
        t: curT,
        clock: curClock,
        kind: "dispatch",
        stopId: stopObj?.id ?? stopIndex + 1,
        message: `⚡ DISPATCH: Fleet Bus #${busNumber} released from ${sName} (Staged at platform for incoming arrivals).`,
      };
      setManualEvents((prev) => [event, ...prev]);
      showFlash("success", `⚡ Bus #${busNumber} dispatched to ${sName} for platform pre-positioning!`);
      return;
    }

    const boarded = Math.min(cap, currentQ);
    setManualDeductions((prev) => ({
      ...prev,
      [stopIndex]: (prev[stopIndex] ?? 0) + boarded,
    }));
    setManualDispatchesCount((c) => c + 1);
    setManualBoardedCount((b) => b + boarded);

    const event: EngineEvent = {
      t: curT,
      clock: curClock,
      kind: "dispatch",
      stopId: stopObj?.id ?? stopIndex + 1,
      message: `⚡ LIVE DISPATCH: Bus #${busNumber} departed ${sName} clearing ${fmtInt(boarded)} passengers (Operator Release).`,
    };

    setManualEvents((prev) => [event, ...prev]);
    showFlash("success", `⚡ Bus #${busNumber} cleared ${fmtInt(boarded)} passengers from ${sName}!`);
  };

  const handleDeployReserve = (stopIndex: number) => {
    if (!run) return;
    const stopObj = stops[stopIndex];
    const sName = stopObj?.name ?? stopNames[stopIndex] ?? `Stop ${stopIndex + 1}`;

    setManualReserveUsed((u) => u + 1);
    setManualReserveExtra((prev) => ({
      ...prev,
      [stopIndex]: (prev[stopIndex] ?? 0) + 1,
    }));

    const reserveBusId = `RES-${Math.floor(10 + Math.random() * 90)}`;
    const event: EngineEvent = {
      t: curT,
      clock: curClock,
      kind: "reserve",
      stopId: stopObj?.id ?? stopIndex + 1,
      message: `🚨 OPERATOR OVERRIDE: Reserve bus ${reserveBusId} deployed from Central Depot to ${sName}. ETA 8 min.`,
    };

    setManualEvents((prev) => [event, ...prev]);
    showFlash("info", `🚨 Reserve Bus ${reserveBusId} dispatched to ${sName}! Arriving in 8 minutes.`);
  };

  const handleHoldGate = (stopIndex: number) => {
    const stopObj = stops[stopIndex];
    const sName = stopObj?.name ?? stopNames[stopIndex] ?? `Stop ${stopIndex + 1}`;
    const event: EngineEvent = {
      t: curT,
      clock: curClock,
      kind: "alert",
      stopId: stopObj?.id ?? stopIndex + 1,
      message: `📢 MARSHAL DIRECTIVE: Queue hold active at ${sName} entrance gates to meter platform density.`,
    };
    setManualEvents((prev) => [event, ...prev]);
    showFlash("warn", `📢 Queue metering directive transmitted to field marshals at ${sName}.`);
  };

  const handleDispatchAllOvercrowded = () => {
    if (!run || !cur) return;
    let dispatchedAny = false;
    stopNames.forEach((_, s) => {
      handleManualDispatch(s);
      dispatchedAny = true;
    });
    if (dispatchedAny) {
      showFlash("success", "⚡ Rapid fleet dispatch initiated across all terminals!");
    }
  };

  // Jump to specific time periods
  const jumpToMinute = (targetMinute: number) => {
    if (!ticks.length) return;
    const targetIdx = ticks.findIndex((t) => t.t >= targetMinute);
    if (targetIdx >= 0) {
      setPlaying(false);
      setIdx(targetIdx);
    }
  };

  // Combine events: engine timeline events up to curT + manual interventions
  const simEvents = run ? run.result.events.filter((e) => e.t <= curT) : [];
  const combinedEvents = [...manualEvents, ...simEvents].slice(0, 50);
  const reforecast = run ? run.result.reforecasts.filter((r) => r.t <= curT).slice(-1)[0] : undefined;
  const totals = run?.result?.totals;
  const reserveLeft = Math.max(0, (cur?.reserveLeft ?? (run?.reserveBuses ?? 0)) - manualReserveUsed);

  return (
    <div className="space-y-6">
      {/* Toast Flash Notification */}
      {flash && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-2xl transition-all duration-300 ${
            flash.type === "success"
              ? "bg-sage/95 text-white ring-1 ring-white/20"
              : flash.type === "warn"
              ? "bg-terra/95 text-white ring-1 ring-white/20"
              : "bg-ink/95 text-sand ring-1 ring-white/20"
          }`}
        >
          <span className="text-base">
            {flash.type === "success" ? "⚡" : flash.type === "warn" ? "🚨" : "ℹ️"}
          </span>
          <p className="text-sm font-semibold tracking-wide">{flash.message}</p>
          <button
            onClick={() => setFlash(null)}
            className="ml-2 text-xs font-bold opacity-75 hover:opacity-100 cursor-pointer"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Control Room Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sage animate-ping" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terra">
              Control Room · Live Dispatch Console
            </p>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">{name || "Festival Operations"}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Real-time terminal queues, autonomous & manual bus dispatches, reserve fleet management, and dynamic AI outflow forecasting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDispatchAllOvercrowded}
            className={`${btnTone("good")} text-xs font-bold shadow-md cursor-pointer`}
          >
            ⚡ Dispatch All Terminals Now
          </button>
          <Link href={`/festivals/${festivalId}`} className={btnGhost}>
            Capacity Planner
          </Link>
          <Link href={`/festivals/${festivalId}/report`} className={btnGhost}>
            Audit Report
          </Link>
        </div>
      </header>

      {/* Quick Time Jump Shortcuts */}
      <div className="neu-inset p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-soft mr-1">Time Jump Presets:</span>
          <button
            type="button"
            onClick={() => jumpToMinute(-30)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              curT === -30 ? "neu-inset text-terra font-bold" : "neu-flat text-ink-soft hover:text-ink"
            }`}
          >
            🚌 Pre-Event Staging (21:00)
          </button>
          <button
            type="button"
            onClick={() => jumpToMinute(0)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              curT === 0 ? "neu-inset text-terra font-bold" : "neu-flat text-ink-soft hover:text-ink"
            }`}
          >
            ⏱️ Event Close (21:30)
          </button>
          <button
            type="button"
            onClick={() => jumpToMinute(15)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              curT >= 10 && curT <= 25 ? "neu-inset text-terra font-bold ring-1 ring-terra" : "neu-flat text-ink-soft hover:text-ink"
            }`}
          >
            🔥 Peak Crowd Surge (21:45)
          </button>
          <button
            type="button"
            onClick={() => jumpToMinute(45)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              curT >= 40 ? "neu-inset text-terra font-bold" : "neu-flat text-ink-soft hover:text-ink"
            }`}
          >
            🌙 Late Evacuation (22:15)
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-soft">Active Clock:</span>
          <span className="neu-chip font-mono text-xs font-bold text-terra px-2.5 py-1">{curClock}</span>
        </div>
      </div>

      {/* Ground Conditions & Reactive Incidents */}
      <Card
        title="Live Ground Conditions & Incident Controls"
        subtitle="Live changes to weather, concert delays, or crowd surges automatically recalculate all queue forecasts, fleet cycles, and AI advice."
        right={
          <span className="neu-chip text-sage flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-sage animate-pulse" />
            Live Reactive Engine
          </span>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={LABEL}>Dispatch Mode</span>
            <select className={`${inputCls} mt-2`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="festflow">FestFlow Autonomous AI & Reserve</option>
              <option value="legacy">Legacy Mode (Telephone dispatch, static staging)</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Planned Demand Scenario</span>
            <select className={`${inputCls} mt-2`} value={plannedScenario} onChange={(e) => setPlannedScenario(e.target.value as Scenario)}>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Actual Ground Crowd Surge</span>
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
            <span className={LABEL}>Crowd Guidance Drift (pts)</span>
            <input className={`${inputCls} mt-2`} type="number" min={0} max={40} step={1} value={drift} onChange={(e) => setDrift(Number(e.target.value))} />
            <span className="mt-1.5 block text-[11px] text-ink-soft">Riders drifting toward central terminal</span>
          </label>
          <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
            <button onClick={() => replay(true)} disabled={busy} className={btnGhost}>
              {busy ? "Saving…" : "Save as actual night (for Audit Report)"}
            </button>
            {(manualDispatchesCount > 0 || manualReserveUsed > 0) && (
              <button
                onClick={() => {
                  setManualDeductions({});
                  setManualReserveExtra({});
                  setManualReserveUsed(0);
                  setManualDispatchesCount(0);
                  setManualBoardedCount(0);
                  setManualEvents([]);
                  showFlash("info", "Manual dispatch overrides cleared.");
                }}
                className={`${btnGhost} text-xs`}
              >
                Reset Manual Actions ({manualDispatchesCount} Dispatched)
              </button>
            )}
          </div>
        </div>

        {/* Live Incident Presets */}
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

      {!run && (
        <div className="neu-raised p-8 text-center text-ink-soft">
          <p className="font-display text-base">Initializing live telemetry & queue simulation…</p>
        </div>
      )}

      {run && totals && (
        <>
          {/* Key Metric Stats */}
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
              label="Total Dispatches"
              value={`${totals.dispatches + manualDispatchesCount}`}
              sub={`${manualDispatchesCount} manual operator dispatches`}
              tone="good"
            />
            <Stat
              label="Reserve fleet left"
              value={`${reserveLeft} / ${run.reserveBuses}`}
              sub={`${totals.reserveUsed + manualReserveUsed} reserve buses used`}
              tone={reserveLeft === 0 ? "warn" : "info"}
            />
            <Stat
              label="Crowd alerts"
              value={totals.alerts}
              sub={`Threshold ${fmtInt(threshold)} waiting`}
              tone={totals.alerts > 0 ? "bad" : "good"}
            />
          </div>

          {/* AI Live Advisor */}
          <AiAdvisor
            context={{
              festivalName: name || "Festival",
              currentClock: curClock,
              minute: curT,
              threshold,
              stops: stopNames.map((n, s) => {
                const baseQ = cur ? cur.queues[s] ?? 0 : 0;
                const deducted = manualDeductions[s] ?? 0;
                const currentQ = Math.max(0, baseQ - deducted);
                const extraReady = manualReserveExtra[s] ?? 0;
                const ready = (cur ? cur.ready[s] ?? 0 : 0) + extraReady;
                return {
                  name: n,
                  queue: currentQ,
                  readyBuses: ready,
                  status: currentQ >= threshold ? "ALERT" : currentQ > cap / 2 ? "BEHIND" : "OK",
                };
              }),
              totalStranded: totals.stranded,
              totalAlerts: totals.alerts,
              reserveUsed: totals.reserveUsed + manualReserveUsed,
              totalReserve: run.reserveBuses,
              rainChance: rain,
              mode: run.mode,
            }}
          />

          {/* Geographic Fleet & Corridor Transit Map (mapcn) */}
          <TransitMap
            festivalName={name || "Festival Operations"}
            stops={stopNames.map((n, s) => {
              const baseQueue = cur ? cur.queues[s] ?? 0 : 0;
              const deducted = manualDeductions[s] ?? 0;
              const currentQueue = Math.max(0, baseQueue - deducted);
              const extraReady = manualReserveExtra[s] ?? 0;
              const ready = (cur ? cur.ready[s] ?? 0 : 0) + extraReady;
              const status: "ALERT" | "BEHIND" | "OK" =
                currentQueue >= threshold ? "ALERT" : currentQueue > cap / 2 ? "BEHIND" : "OK";
              return {
                id: s,
                name: n,
                queue: currentQueue,
                readyBuses: ready,
                assignedBuses: run?.buses?.[s] ?? 0,
                status,
              };
            })}
            threshold={threshold}
            reserveLeft={reserveLeft}
            busesOnTrip={cur?.onTrip ?? 0}
            onDispatch={handleManualDispatch}
            onDeployReserve={handleDeployReserve}
          />

          {/* Live Dispatch Command Stations (Per Terminal) */}
          <Card
            title="Terminal Dispatch Stations"
            subtitle="Trigger immediate bus departures, assign emergency reserve vehicles, or alert ground marshals per stop."
            right={
              <div className="flex items-center gap-2">
                <span className="neu-chip text-xs text-ink font-semibold">
                  Reserve Depot: {reserveLeft} Available
                </span>
              </div>
            }
          >
            <div className="grid gap-5 md:grid-cols-3">
              {stopNames.map((n, s) => {
                const baseQueue = cur ? cur.queues[s] ?? 0 : 0;
                const deducted = manualDeductions[s] ?? 0;
                const currentQueue = Math.max(0, baseQueue - deducted);
                const extraReady = manualReserveExtra[s] ?? 0;
                const ready = (cur ? cur.ready[s] ?? 0 : 0) + extraReady;
                const status: "ALERT" | "BEHIND" | "OK" =
                  currentQueue >= threshold ? "ALERT" : currentQueue > cap / 2 ? "BEHIND" : "OK";
                const tone: Tone = status === "ALERT" ? "bad" : status === "BEHIND" ? "warn" : "good";

                return (
                  <div key={n} className="neu-inset p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-ink">
                          <span
                            className="neu-dot mr-2 align-middle"
                            style={{ background: STOP_COLORS[s % STOP_COLORS.length] }}
                          />
                          {n}
                        </p>
                        <Pill tone={tone}>{status}</Pill>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between">
                        <div>
                          <p className={`font-display text-4xl tabular-nums ${status === "ALERT" ? "text-brick" : "text-ink"}`}>
                            {fmtInt(currentQueue)}
                          </p>
                          <p className="text-xs text-ink-soft">waiting in queue</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xl font-bold text-sage">{ready}</p>
                          <p className="text-xs text-ink-soft">ready buses</p>
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-ink-soft border-t border-black/5 dark:border-white/5 pt-3">
                        <div>
                          <dt>Assigned Fleet</dt>
                          <dd className="mt-0.5 font-semibold text-ink">
                            {run?.buses?.[s] ?? 0} buses
                          </dd>
                        </div>
                        <div>
                          <dt>Ready Capacity</dt>
                          <dd className="mt-0.5 font-semibold text-ink">{fmtInt(ready * cap)} riders</dd>
                        </div>
                      </dl>
                    </div>

                    {/* Live Dispatch Action Buttons (Always Interactive) */}
                    <div className="mt-5 space-y-2 border-t border-black/5 dark:border-white/5 pt-4">
                      <button
                        type="button"
                        onClick={() => handleManualDispatch(s)}
                        className="w-full py-2.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 bg-sage text-white hover:brightness-110 shadow cursor-pointer active:scale-[0.98]"
                      >
                        <span>⚡</span> Dispatch Bus Now {currentQueue > 0 ? `(${Math.min(cap, currentQueue)} riders)` : "(Staging)"}
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeployReserve(s)}
                          className="neu-btn py-2 px-2 text-[11px] font-semibold text-ochre hover:text-ink cursor-pointer active:scale-[0.98]"
                          title="Deploy 1 bus from reserve depot"
                        >
                          🚨 Deploy Reserve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHoldGate(s)}
                          className="neu-btn py-2 px-2 text-[11px] font-semibold text-ink-soft hover:text-ink cursor-pointer active:scale-[0.98]"
                          title="Alert marshals to pause gate entry"
                        >
                          📢 Hold Gate
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-7 text-sm text-ink-soft border-t border-black/5 dark:border-white/5 pt-4">
              <span>
                Riders reached stops: <strong className="text-ink">{fmtInt(cur?.arrived ?? 0)}</strong>
              </span>
              <span>
                Boarded & cleared: <strong className="text-ink">{fmtInt((cur?.boarded ?? 0) + manualBoardedCount)}</strong>
              </span>
              <span>
                Buses en-route: <strong className="text-ink">{cur?.onTrip ?? 0}</strong>
              </span>
              <span>
                Depot reserve fleet: <strong className="text-ink">{reserveLeft} buses</strong>
              </span>
            </div>
          </Card>

          {/* Timeline & Chart */}
          <Card
            title="Night Timeline & Outflow Progression"
            subtitle="Scrub or play through the night. Each tick represents 5 minutes of simulated transit outflow."
            right={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setPlaying(false);
                    setIdx((i) => Math.max(0, i - 1));
                  }}
                  className={btnGhost}
                  title="Step 5 minutes back"
                >
                  ⏮ -5m
                </button>
                <button
                  onClick={() => {
                    if (idx >= ticks.length - 1) {
                      setIdx(0);
                      setPlaying(true);
                    } else {
                      setPlaying((p) => !p);
                    }
                  }}
                  className={btnTone("good")}
                >
                  {playing ? "⏸ Pause" : "▶ Play Timeline"}
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setIdx((i) => Math.min(ticks.length - 1, i + 1));
                  }}
                  className={btnGhost}
                  title="Step 5 minutes forward"
                >
                  +5m ⏭
                </button>
                <div className="flex items-center gap-1 ml-2">
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                        speed === s ? "neu-inset text-terra" : "neu-flat text-ink-soft hover:text-ink"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setIdx(0);
                  }}
                  className={btnGhost}
                >
                  Reset
                </button>
                <span className="neu-chip w-20 justify-center font-mono text-sm font-bold text-ink">{curClock}</span>
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
              className="w-full cursor-pointer"
            />
            <Well className="mt-5">
              <QueueChart ticks={ticks} stopNames={stopNames} threshold={threshold} cursor={cursor} />
            </Well>
            <div className="mt-4 flex flex-wrap gap-5 text-xs text-ink-soft">
              {stopNames.map((n, i) => (
                <span key={n} className="inline-flex items-center gap-2">
                  <span className="neu-dot" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
                  {n}
                </span>
              ))}
            </div>
          </Card>

          {/* Event Log & Re-Forecast */}
          <div className="grid gap-6 xl:grid-cols-3">
            <Card
              title="Real-Time Dispatch & Alert Stream"
              className="xl:col-span-2"
              subtitle="Live automated dispatch events, manual overrides, reserve deployments, and threshold alerts."
            >
              <Well className="p-3">
                <ul className="max-h-[420px] space-y-3 overflow-y-auto px-2 py-2 pr-3">
                  {combinedEvents.length === 0 && <li className="text-sm text-ink-soft">No dispatches logged yet.</li>}
                  {combinedEvents.map((e, i) => (
                    <li key={`${e.t}-${i}-${e.message.slice(0, 10)}`} className="flex items-start gap-3 text-sm">
                      <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-ink-soft">{e.clock}</span>
                      <Pill tone={EVENT_TONE[e.kind] ?? "neutral"}>{e.kind}</Pill>
                      <span className="leading-relaxed text-ink">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </Well>
            </Card>

            <div className="space-y-6">
              <Card title="15-Min Re-Forecast" subtitle="Updated every 15 minutes from observed ground arrivals.">
                {reforecast ? (
                  <div>
                    <p className="text-sm text-ink-soft">At {reforecast.clock}</p>
                    <p className="mt-1 font-display text-3xl font-bold text-ink">{fmtInt(reforecast.estimate)} riders</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      Confidence window: {fmtInt(reforecast.low)} – {fmtInt(reforecast.high)}
                    </p>
                    <p className="mt-3 text-xs text-ink-soft">Baseline plan assumed {fmtInt(run.plannedRiders)} total riders.</p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">Re-forecast starts at the last event end.</p>
                )}
              </Card>

              <Card title="Field Count Reporting" subtitle="Conductor, marshal headcount, CCTV density, or load factor.">
                <div className="grid grid-cols-2 gap-4">
                  <label className="col-span-2 block">
                    <span className={LABEL}>Terminal Stop</span>
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
                    <span className={LABEL}>Waiting Count</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} value={cWaiting} onChange={(e) => setCWaiting(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Bus Load %</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} max={200} value={cLoad} onChange={(e) => setCLoad(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Density (p/m²)</span>
                    <input className={`${inputCls} mt-2`} type="number" min={0} step={0.1} value={cDensity} onChange={(e) => setCDensity(Number(e.target.value))} />
                  </label>
                  <label className="col-span-2 block">
                    <span className={LABEL}>Data Source</span>
                    <select className={`${inputCls} mt-2`} value={cSource} onChange={(e) => setCSource(e.target.value)}>
                      {COUNT_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button onClick={submitCount} className={`${btn} mt-5 w-full cursor-pointer`}>
                  Record Ground Count
                </button>
              </Card>
            </div>
          </div>

          {/* Recorded Manual Counts Table */}
          <Card title="Recorded Field Telemetry" subtitle="Manual marshal and CCTV counts. Waiting at or above the safety threshold triggers alarms.">
            {counts.length === 0 ? (
              <p className="text-sm text-ink-soft">No manual counts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>Time</th>
                      <th className={TH}>Terminal Stop</th>
                      <th className={TH}>Waiting</th>
                      <th className={TH}>Bus Load</th>
                      <th className={TH}>Density</th>
                      <th className={TH}>Source</th>
                      <th className={TH}>Alert State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {counts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{clockAt(lastEnd, c.minute)}</td>
                        <td className="py-3 pr-4 font-medium">{stopName(c.stopId)}</td>
                        <td className="py-3 pr-4 tabular-nums font-semibold">{fmtInt(c.waiting)}</td>
                        <td className="py-3 pr-4 tabular-nums">{c.loadFactorPct}%</td>
                        <td className="py-3 pr-4 tabular-nums">{c.cctvDensity} p/m²</td>
                        <td className="py-3 pr-4">{c.source}</td>
                        <td className="py-3">{c.alert ? <Pill tone="bad">Overload Alert</Pill> : <Pill tone="good">Clear</Pill>}</td>
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
