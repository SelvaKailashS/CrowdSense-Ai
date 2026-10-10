"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { SCENARIOS, type FestivalInputs, type Interventions, type Scenario, type StopInput } from "@/lib/festflow/types";
import type { CellStatus, DispatchRow, PlanReport, ScenarioSummary } from "@/lib/festflow/plan";
import { fmtInt } from "@/lib/festflow/math";
import { ForecastChart } from "./charts";
import { Card, Pill, Stat, STATUS_TONE, STOP_COLORS, Well, btn, btnGhost, btnTone, inputCls } from "./ui";

interface PlanPayload {
  id: number;
  status: string;
  inputs: FestivalInputs;
  stops: StopInput[];
  scenario: Scenario;
  forecasts: Record<Scenario, ScenarioSummary>;
  report: PlanReport;
  approved: { id: number; scenario: string; approvedBy: string; createdAt: string }[];
}

type FieldDef = {
  key: Exclude<keyof FestivalInputs, "interventions">;
  label: string;
  type: "text" | "number" | "date" | "time" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  help?: string;
};

const FIELDS: FieldDef[] = [
  { key: "name", label: "Festival", type: "text" },
  { key: "town", label: "Town", type: "text" },
  { key: "eventDate", label: "Closing night", type: "date" },
  { key: "lastEventEnd", label: "Last event ends", type: "time", help: "Minute 0 of the plan" },
  { key: "dayType", label: "Day type", type: "select", options: ["weekday", "weekend", "holiday"] },
  { key: "pastFootfall", label: "Last year: people leaving", type: "number", min: 0, max: 1000000, step: 500, help: "Ticket, parking and footfall proxy" },
  { key: "growthPct", label: "Expected growth %", type: "number", min: -50, max: 200, step: 1 },
  { key: "rainChance", label: "Rain chance %", type: "number", min: 0, max: 100, step: 5, help: "Rain makes the peak earlier and sharper" },
  { key: "modeShareBasePct", label: "Bus mode share %", type: "number", min: 0, max: 100, step: 1, help: "Base case. Low and high are ±30%" },
  { key: "lastBusMin", label: "Last bus (min after end)", type: "number", min: 60, max: 360, step: 5 },
  { key: "busCapacity", label: "Bus capacity (riders)", type: "number", min: 10, max: 150, step: 1, help: "Seated plus standing, to confirm" },
  { key: "roundTripMin", label: "Round trip (min)", type: "number", min: 15, max: 240, step: 5 },
  { key: "fleetBuses", label: "Fleet (buses)", type: "number", min: 1, max: 1000, step: 1 },
  { key: "reservePct", label: "Reserve held back %", type: "number", min: 0, max: 50, step: 1, help: "PRD: 10–15% of fleet" },
  { key: "drivers", label: "Drivers on duty", type: "number", min: 1, max: 1000, step: 1 },
  { key: "maxDriverMin", label: "Max driving min per driver", type: "number", min: 60, max: 900, step: 15 },
  { key: "crowdThreshold", label: "Crowd alert threshold", type: "number", min: 100, max: 100000, step: 50, help: "Waiting per stop, to set with police" },
];

const INTERVENTION_LABELS: Record<keyof Interventions, string> = {
  signage: "Signage to each stop",
  announcements: "Public announcements",
  shuttle: "Shuttle between stops",
};

function worstStatus(cells: { status: CellStatus }[]): CellStatus {
  if (cells.some((c) => c.status === "Alert")) return "Alert";
  if (cells.some((c) => c.status === "Behind")) return "Behind";
  if (cells.some((c) => c.status === "On plan")) return "On plan";
  return "Idle";
}

const TH = "py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function PlannerView({ festivalId }: { festivalId: number }) {
  const [inputs, setInputs] = useState<FestivalInputs | null>(null);
  const [stops, setStops] = useState<StopInput[]>([]);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [data, setData] = useState<PlanPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadFestival = useCallback(async () => {
    const r = await fetch(`/api/festivals/${festivalId}`);
    if (!r.ok) {
      setMsg("Could not load this festival.");
      return;
    }
    const j = await r.json();
    setInputs(j.inputs);
    setStops(j.stops);
    setDirty(false);
  }, [festivalId]);

  const loadPlan = useCallback(
    async (sc: Scenario) => {
      const r = await fetch(`/api/festivals/${festivalId}/plan?scenario=${sc}`);
      if (r.ok) setData(await r.json());
    },
    [festivalId],
  );

  useEffect(() => {
    loadFestival();
  }, [loadFestival]);

  useEffect(() => {
    loadPlan(scenario);
  }, [loadPlan, scenario]);

  const setField = (key: FieldDef["key"], value: string | number) => {
    setInputs((prev) => (prev ? ({ ...prev, [key]: value } as FestivalInputs) : prev));
    setDirty(true);
  };
  const setIntervention = (key: keyof Interventions, value: boolean) => {
    setInputs((prev) => (prev ? { ...prev, interventions: { ...prev.interventions, [key]: value } } : prev));
    setDirty(true);
  };
  const setStop = (idx: number, key: keyof StopInput, value: string | number) => {
    setStops((prev) => prev.map((s, i) => (i === idx ? ({ ...s, [key]: value } as StopInput) : s)));
    setDirty(true);
  };
  const addStop = () => {
    setStops((prev) => [
      ...prev,
      { id: 0, name: `New stop ${prev.length + 1}`, distanceKm: 1, baseSharePct: 0, fullInterventionSharePct: 0, legacyBuses: 0 },
    ]);
    setDirty(true);
  };
  const removeStop = (idx: number) => {
    setStops((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = async () => {
    if (!inputs) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/festivals/${festivalId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, stops }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMsg(j.error ?? "Save failed");
      return;
    }
    setInputs(j.inputs);
    setStops(j.stops);
    setDirty(false);
    setMsg("Saved. Plan recalculated.");
    await loadPlan(scenario);
  };

  const approve = async () => {
    if (dirty) {
      setMsg("Save your changes before approving the plan.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/festivals/${festivalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`Plan approved for the ${scenario} scenario. Dispatch will follow this snapshot.`);
      await loadPlan(scenario);
    } else {
      setMsg("Approval failed.");
    }
  };

  if (!inputs || !data) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <p className="font-display text-lg italic text-ink-soft">{msg ?? "Loading plan…"}</p>
      </div>
    );
  }

  const rep = data.report;
  const fc = rep.forecast;
  const fleet = rep.fleet;
  const totals = rep.outcome.totals;
  const lo = data.forecasts.low;
  const hi = data.forecasts.high;
  const stopNames = rep.stops.map((s) => s.name);
  const peakSlot = fc.slots.reduce((b, s) => (s.riders > b.riders ? s : b), fc.slots[0]);
  const baseSum = data.stops.reduce((a, s) => a + s.baseSharePct, 0) || 1;
  const pctOfStop = (sIdx: number) => (data.stops[sIdx] ? (data.stops[sIdx].baseSharePct / baseSum) * 100 : 0);
  const flagTone = rep.flags.some((f) => f.startsWith("The plan fits")) ? "good" : "warn";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terra">Planner · T-7 days</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{data.inputs.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {data.inputs.town} · closing night {data.inputs.eventDate} · last event ends {data.inputs.lastEventEnd}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/festivals/${festivalId}/live`} className={btnGhost}>
            Control room
          </Link>
          <Link href={`/festivals/${festivalId}/report`} className={btnGhost}>
            Post-event report
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-soft">Scenario</span>
        {SCENARIOS.map((sc) => (
          <button key={sc} onClick={() => setScenario(sc)} className={`${btnTone(scenario === sc)} rounded-full px-4 py-2 capitalize`}>
            {sc} · {fmtInt(data.forecasts[sc].riders)} riders
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-soft">The plan below is sized for the selected scenario.</span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="People leaving" value={fmtInt(fc.outflow)} sub={`Last year plus growth, ${data.inputs.dayType}`} />
        <Stat
          label="Bus mode share"
          value={`${fc.modeSharePct.toFixed(0)}%`}
          sub={`Low ${lo.modeSharePct.toFixed(0)}% · High ${hi.modeSharePct.toFixed(0)}%`}
        />
        <Stat label="Bus riders" value={fmtInt(fc.riders)} sub={`Range ${fmtInt(lo.riders)} to ${fmtInt(hi.riders)}`} />
        <Stat label="Peak 15-min slot" value={peakSlot.clock} sub={`${fmtInt(peakSlot.riders)} riders leave`} />
        <Stat label="90% gone by" value={`+${fc.minutesTo90Pct} min`} sub="after the last event ends" />
      </div>

      <Card
        title="Departure forecast (T-7)"
        subtitle={`${scenario[0].toUpperCase()}${scenario.slice(1)} scenario, 15-minute slots. Dashed lines show the low and high envelopes.`}
      >
        <Well>
          <ForecastChart
            slots={fc.slots}
            low={lo.slotTotals}
            high={hi.slotTotals}
            stopNames={stopNames}
            lastBusMin={data.inputs.lastBusMin}
          />
        </Well>
        <div className="mt-4 flex flex-wrap gap-5 text-xs text-ink-soft">
          {stopNames.map((n, i) => (
            <span key={n} className="inline-flex items-center gap-2">
              <span className="neu-dot" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
              {n}
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 border-t border-dashed border-stone" /> Low
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 border-t border-dotted border-ink" /> High
          </span>
        </div>
      </Card>

      <Card
        title="Stop split and pre-positioning"
        subtitle="Where people will wait, and how many buses each stop needs. Buses are parked at the stop before minute 0."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Stop</th>
                <th className={TH}>Share: base → now</th>
                <th className={TH}>Riders</th>
                <th className={TH}>Buses needed (peak)</th>
                <th className={TH}>Buses assigned</th>
                <th className={TH}>Park at stop by</th>
                <th className={TH}>Leave depot by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rep.stops.map((s, i) => (
                <tr key={s.stopId} className="text-ink">
                  <td className="py-3 pr-4 font-medium">
                    <span className="neu-dot mr-2.5 align-middle" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
                    {s.name}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {pctOfStop(i).toFixed(0)}% → {(s.share * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{fmtInt(s.riders)}</td>
                  <td className="py-3 pr-4 tabular-nums">{s.neededBuses}</td>
                  <td className="py-3 pr-4 font-display text-base tabular-nums text-terra">{s.assignedBuses}</td>
                  <td className="py-3 pr-4 tabular-nums">{s.prePositionClock}</td>
                  <td className="py-3 pr-4 tabular-nums">{s.departDepotClock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Active interventions move riders from the main stand to the satellite stops. Reserve buses stay at the depot and go
          to any stop whose queue outruns its buses.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Fleet check" className="xl:col-span-2" subtitle={`Scenario: ${scenario}`}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Fleet" value={fleet.fleetBuses} sub={`Reserve held: ${fleet.reserveBuses} (min ${fleet.minReserve})`} />
            <Stat
              label="Buses needed at peak"
              value={fleet.neededBuses}
              sub={`Assignable: ${fleet.allocatable}`}
              tone={fleet.shortfallBuses > 0 ? "bad" : "good"}
            />
            <Stat
              label="Trips needed / can run"
              value={`${fmtInt(fleet.tripsNeeded)} / ${fmtInt(fleet.tripsCanRun)}`}
              sub={`${fleet.tripsPerBus} trips per bus before cutoff`}
              tone={fleet.tripsShortfall > 0 ? "bad" : "good"}
            />
            <Stat
              label="Driver minutes"
              value={`${fmtInt(fleet.driverMinNeeded)} / ${fmtInt(fleet.driverMinAvail)}`}
              sub={fleet.driverLimited ? "Driver hours can bind" : "Needed / available"}
              tone={fleet.driverMinNeeded > fleet.driverMinAvail ? "bad" : "neutral"}
            />
          </div>
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Flags</p>
            <ul className="mt-3 space-y-3">
              {rep.flags.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-ink">
                  <Pill tone={flagTone}>{flagTone === "good" ? "OK" : "Check"}</Pill>
                  <span className="leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Scenario risk" subtitle="Buses needed at peak by scenario">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Scenario</th>
                <th className={TH}>Needed</th>
                <th className={TH}>Shortfall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {SCENARIOS.map((sc) => {
                const row = rep.neededByScenario[sc];
                return (
                  <tr key={sc}>
                    <td className="py-3 capitalize">{sc}</td>
                    <td className="py-3 tabular-nums">{row.needed}</td>
                    <td className="py-3">
                      {row.shortfall > 0 ? <Pill tone="bad">−{row.shortfall}</Pill> : <Pill tone="good">None</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Assignable buses exclude the reserve. Shortfalls mean the plan needs more buses or more shift to satellite stops.
          </p>
        </Card>
      </div>

      <Card
        title="Dispatch plan by 15-minute slot"
        subtitle="Need = buses required for the riders at that stop in that slot. Sent = buses that leave in the slot. Queue = people still waiting at slot end."
      >
        <Well className="p-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="py-2 pr-3" rowSpan={2}>
                    Time
                  </th>
                  <th className="py-2 pr-3" rowSpan={2}>
                    Riders
                  </th>
                  {rep.stops.map((s, i) => (
                    <th key={s.stopId} colSpan={3} className="border-l border-black/10 px-2 py-1 text-ink">
                      <span className="neu-dot mr-2 align-middle" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
                      {s.name}
                    </th>
                  ))}
                  <th className="border-l border-black/10 py-2 pl-3" rowSpan={2}>
                    Status
                  </th>
                </tr>
                <tr className="text-ink-soft">
                  {rep.stops.map((s) => (
                    <Fragment key={s.stopId}>
                      <th className="border-l border-black/10 px-2 py-1 font-normal">Need</th>
                      <th className="px-2 py-1 font-normal">Sent</th>
                      <th className="px-2 py-1 font-normal">Queue</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rep.dispatch.map((row: DispatchRow) => {
                  const status = worstStatus(row.cells);
                  return (
                    <tr key={row.minute} className={`border-t ${row.minute === 0 ? "border-t-2 border-t-stone" : "border-black/5"}`}>
                      <td className="py-2 pr-3 font-semibold text-ink">
                        {row.clock}
                        {row.minute === -30 && <span className="ml-1.5 text-[10px] font-semibold text-slateblue">pre-position</span>}
                        {row.minute === 0 && <span className="ml-1.5 text-[10px] text-stone">end</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{fmtInt(row.riders)}</td>
                      {row.cells.map((c) => (
                        <Fragment key={c.stopId}>
                          <td className="border-l border-black/5 px-2 py-2 tabular-nums">{c.needBuses}</td>
                          <td className="px-2 py-2 font-display text-sm tabular-nums text-terra">{c.departures}</td>
                          <td
                            className={`px-2 py-2 tabular-nums ${
                              c.status === "Alert" ? "font-semibold text-brick" : c.status === "Behind" ? "text-ochre" : "text-ink-soft"
                            }`}
                          >
                            {fmtInt(c.queueEnd)}
                          </td>
                        </Fragment>
                      ))}
                      <td className="border-l border-black/5 py-2 pl-3">
                        <Pill tone={STATUS_TONE[status]}>{status}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Well>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Simulated outcome" className="xl:col-span-2" subtitle="This plan run through the night simulation, at forecast demand.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Peak queue, one stop"
              value={fmtInt(totals.peakQueue)}
              sub={`${totals.peakStop} at ${totals.peakClock}`}
              tone={totals.peakQueue >= data.inputs.crowdThreshold ? "bad" : "neutral"}
            />
            <Stat label="Average wait" value={`${totals.avgWaitMin} min`} sub="Riders who boarded" />
            <Stat
              label="Stranded at cutoff"
              value={`${totals.strandedPct}%`}
              sub={`${fmtInt(totals.stranded)} riders, target below 2%`}
              tone={totals.strandedPct > 2 ? "bad" : "good"}
            />
            <Stat label="Sent by rule" value={`${totals.rulePct}%`} sub={`${totals.dispatches} buses, target above 90%`} tone="good" />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>Stop</th>
                  <th className={TH}>Peak queue</th>
                  <th className={TH}>Peak at</th>
                  <th className={TH}>Average wait</th>
                  <th className={TH}>Dispatches</th>
                  <th className={TH}>Reserve sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rep.outcome.stops.map((s) => (
                  <tr key={s.stopId}>
                    <td className="py-3 pr-4 font-medium">{s.name}</td>
                    <td className={`py-3 pr-4 tabular-nums ${s.peakQueue >= data.inputs.crowdThreshold ? "font-semibold text-brick" : ""}`}>
                      {fmtInt(s.peakQueue)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{s.peakClock}</td>
                    <td className="py-3 pr-4 tabular-nums">{s.avgWaitMin} min</td>
                    <td className="py-3 pr-4 tabular-nums">{s.dispatches}</td>
                    <td className="py-3 pr-4 tabular-nums">{s.reserveDispatches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Approve plan" subtitle="Freezes this scenario as the dispatch snapshot for the night.">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink">
              Scenario: <span className="font-semibold capitalize text-terra">{scenario}</span> · {fleet.assignedBuses} buses assigned,{" "}
              {fleet.reserveBuses} held in reserve.
            </p>
            <button onClick={approve} disabled={busy} className={`${btn} w-full`}>
              Approve {scenario} plan
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Approved plans</p>
              {data.approved.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">None yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-ink">
                  {data.approved.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="capitalize">
                        {p.scenario} plan #{p.id}
                      </span>
                      <span className="text-xs text-ink-soft">{new Date(p.createdAt).toLocaleString("en-GB")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Inputs and stops" subtitle="Change the programme, demand, fleet and stop assumptions. Save to recalculate every view above.">
        <details className="group" open>
          <summary className="cursor-pointer font-display text-base text-terra">Edit assumptions</summary>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">{f.label}</span>
                {f.type === "select" ? (
                  <select className={`${inputCls} mt-2`} value={String(inputs[f.key])} onChange={(e) => setField(f.key, e.target.value)}>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`${inputCls} mt-2`}
                    type={f.type}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={String(inputs[f.key])}
                    onChange={(e) => setField(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                  />
                )}
                {f.help && <span className="mt-1.5 block text-[11px] text-ink-soft">{f.help}</span>}
              </label>
            ))}
          </div>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Interventions (shift the crowd off the main stand)</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {(Object.keys(INTERVENTION_LABELS) as (keyof Interventions)[]).map((k) => (
                <label key={k} className={`${btnTone(inputs.interventions[k])} cursor-pointer gap-2.5 px-4 py-2 text-ink`}>
                  <input
                    type="checkbox"
                    className="accent-terra"
                    checked={inputs.interventions[k]}
                    onChange={(e) => setIntervention(k, e.target.checked)}
                  />
                  {INTERVENTION_LABELS[k]}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Stops</p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="py-1 pr-3 text-left text-xs font-semibold text-ink-soft">Name</th>
                    <th className="py-1 pr-3 text-left text-xs font-semibold text-ink-soft">Distance km</th>
                    <th className="py-1 pr-3 text-left text-xs font-semibold text-ink-soft">Base share %</th>
                    <th className="py-1 pr-3 text-left text-xs font-semibold text-ink-soft">Full-intervention share %</th>
                    <th className="py-1 pr-3 text-left text-xs font-semibold text-ink-soft">Last year bus weight</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {stops.map((s, idx) => (
                    <tr key={`${s.id}-${idx}`}>
                      <td className="py-1.5 pr-3">
                        <input className={inputCls} value={s.name} onChange={(e) => setStop(idx, "name", e.target.value)} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className={inputCls} type="number" step={0.1} value={s.distanceKm} onChange={(e) => setStop(idx, "distanceKm", Number(e.target.value))} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className={inputCls} type="number" step={1} value={s.baseSharePct} onChange={(e) => setStop(idx, "baseSharePct", Number(e.target.value))} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className={inputCls} type="number" step={1} value={s.fullInterventionSharePct} onChange={(e) => setStop(idx, "fullInterventionSharePct", Number(e.target.value))} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className={inputCls} type="number" step={1} value={s.legacyBuses} onChange={(e) => setStop(idx, "legacyBuses", Number(e.target.value))} />
                      </td>
                      <td className="py-1.5">
                        <button onClick={() => removeStop(idx)} className="neu-btn px-3 py-1.5 text-xs text-brick" disabled={stops.length <= 1}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addStop} className={`${btnGhost} mt-4`} disabled={stops.length >= 8}>
              Add stop
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button onClick={save} disabled={busy || !dirty} className={btn}>
              {dirty ? "Save and recalculate" : "Saved"}
            </button>
            {msg && <span className="text-sm text-ink-soft">{msg}</span>}
          </div>
        </details>
      </Card>
    </div>
  );
}
