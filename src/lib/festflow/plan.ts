// Dispatch planning: size buses per stop, check the fleet, build the slot-by-slot dispatch table,
// and run the night through the engine. Also the legacy (last year) comparison.
import {
  MAX_WAIT_MIN,
  PHONE_LAG_MIN,
  SCENARIOS,
  SLOT_MIN,
  type FestivalInputs,
  type Mode,
  type Scenario,
  type StopInput,
} from "./types";
import {
  applyDrift,
  curveFor,
  curvePeakMinute,
  effectiveShares,
  forecastScenario,
  modeShareFor,
  outflowFor,
  type ScenarioForecast,
} from "./forecast";
import { simulateEngine, type EngineResult, type EngineTotals, type StopOutcome } from "./engine";
import { clamp, clockAt } from "./math";

export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const r0 = (n: number) => Math.round(n);

// Depot -> stop transit for reserve buses (rough, distance-based).
export function transitFor(km: number): number {
  return Math.max(5, Math.round(6 + 3 * km));
}

export function minReserveBuses(i: FestivalInputs): number {
  return Math.ceil((i.fleetBuses * i.reservePct) / 100);
}

// Largest-remainder allocation of an integer total by weights.
export function allocate(total: number, weights: number[]): number[] {
  const wsum = sum(weights);
  if (total <= 0 || wsum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const base = raw.map((r) => Math.floor(r));
  let rem = total - sum(base);
  const order = raw
    .map((r, idx) => ({ idx, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rem > 0; k++) {
    base[order[k].idx] += 1;
    rem -= 1;
  }
  return base;
}

// Buses per stop = peak circulation. A bus does one trip per round trip, so the buses needed
// are the largest number of full-bus loads that must depart within one round-trip window.
export function sizeStops(arrivals: number[][], capacity: number, roundTripMin: number): number[] {
  const windowSlots = Math.max(1, Math.ceil(roundTripMin / SLOT_MIN));
  return arrivals.map((row) => {
    let peak = 0;
    for (let i = 0; i < row.length; i++) {
      let w = 0;
      for (let j = Math.max(0, i - windowSlots + 1); j <= i; j++) w += row[j];
      if (w > peak) peak = w;
    }
    return peak > 0 ? Math.max(1, Math.ceil(peak / Math.max(1, capacity))) : 0;
  });
}

export interface SizedPlan {
  scenario: Scenario;
  forecast: ScenarioForecast;
  neededBuses: number[];
  assignedBuses: number[];
  reserveBuses: number;
  minReserve: number;
  allocatable: number;
  shortfallBuses: number;
}

export function sizePlan(i: FestivalInputs, stops: StopInput[], scenario: Scenario): SizedPlan {
  const forecast = forecastScenario(i, stops, scenario, i.interventions);
  const arrivals = stops.map((_, s) => forecast.slots.map((sl) => sl.byStop[s]));
  const neededBuses = sizeStops(arrivals, i.busCapacity, i.roundTripMin);
  const minReserve = minReserveBuses(i);
  const allocatable = Math.max(0, i.fleetBuses - minReserve);
  const neededSum = sum(neededBuses);
  const shortfallBuses = Math.max(0, neededSum - allocatable);
  const assignedBuses = neededSum > allocatable ? allocate(allocatable, neededBuses) : neededBuses.slice();
  return {
    scenario,
    forecast,
    neededBuses,
    assignedBuses,
    reserveBuses: i.fleetBuses - sum(assignedBuses),
    minReserve,
    allocatable,
    shortfallBuses,
  };
}

// Last year's placement: the whole fleet split by the old habit (weights), no reserve.
export function legacyAllocation(i: FestivalInputs, stops: StopInput[]): number[] {
  const w = stops.map((s) => Math.max(0, s.legacyBuses));
  return allocate(i.fleetBuses, sum(w) > 0 ? w : stops.map(() => 1));
}

export interface NightSpec {
  mode: Mode;
  plannedScenario: Scenario;
  actualScenario: Scenario;
  actualRainChance: number;
  actualShiftMin: number;
  guidanceDriftPts: number;
}

export interface NightOutcome {
  spec: NightSpec;
  buses: number[];
  reserveBuses: number;
  plannedRiders: number;
  actualRiders: number;
  actualShares: number[];
  actualPeakMinute: number;
  capacity: number;
  result: EngineResult;
}

export function runNight(i: FestivalInputs, stops: StopInput[], spec: NightSpec): NightOutcome {
  const ff = spec.mode === "festflow";
  const plannedRiders = outflowFor(i) * modeShareFor(i, spec.plannedScenario);
  let buses: number[];
  let reserveBuses = 0;
  if (ff) {
    const sized = sizePlan(i, stops, spec.plannedScenario);
    buses = sized.assignedBuses;
    reserveBuses = sized.reserveBuses;
  } else {
    buses = legacyAllocation(i, stops);
  }
  const actualRiders = outflowFor(i) * modeShareFor(i, spec.actualScenario);
  const shares = applyDrift(
    effectiveShares(stops, ff ? i.interventions : null),
    clamp(spec.guidanceDriftPts, 0, 100) / 100,
  );
  const actualCurve = curveFor(clamp(spec.actualRainChance, 0, 100), spec.actualShiftMin);
  const plannedCurve = curveFor(i.rainChance, 0);
  const result = simulateEngine({
    riders: actualRiders,
    shares,
    actual: actualCurve,
    planned: plannedCurve,
    plannedRiders,
    stops: stops.map((s, k) => ({
      id: s.id,
      name: s.name,
      buses: buses[k] ?? 0,
      transitMin: transitFor(s.distanceKm),
    })),
    reserveBuses,
    capacity: i.busCapacity,
    rtMin: i.roundTripMin,
    lastBusMin: i.lastBusMin,
    threshold: i.crowdThreshold,
    rules: ff,
    lagMin: ff ? 0 : PHONE_LAG_MIN,
    maxWaitMin: MAX_WAIT_MIN,
    lastEventEnd: i.lastEventEnd,
  });
  return {
    spec,
    buses,
    reserveBuses,
    plannedRiders,
    actualRiders,
    actualShares: shares,
    actualPeakMinute: curvePeakMinute(actualCurve),
    capacity: i.busCapacity,
    result,
  };
}

export interface ScenarioSummary {
  scenario: Scenario;
  modeSharePct: number;
  riders: number;
  peakClock: string;
  peakRiders: number;
  minutesTo90Pct: number;
  slotTotals: number[];
}

export function scenarioSummary(i: FestivalInputs, stops: StopInput[], scenario: Scenario): ScenarioSummary {
  const f = forecastScenario(i, stops, scenario, i.interventions);
  const peak = f.slots.reduce((b, s) => (s.riders > b.riders ? s : b), f.slots[0]);
  return {
    scenario,
    modeSharePct: f.modeSharePct,
    riders: r0(f.riders),
    peakClock: peak.clock,
    peakRiders: r0(peak.riders),
    minutesTo90Pct: f.minutesTo90Pct,
    slotTotals: f.slots.map((s) => r0(s.riders)),
  };
}

export type CellStatus = "Idle" | "On plan" | "Behind" | "Alert";

export interface StopPlanRow {
  stopId: number;
  name: string;
  share: number;
  riders: number;
  tripsNeeded: number;
  neededBuses: number;
  assignedBuses: number;
  transitMin: number;
  prePositionClock: string;
  departDepotClock: string;
  dispatches: number;
  reserveDispatches: number;
  peakQueue: number;
  peakClock: string;
  avgWaitMin: number;
}

export interface DispatchCell {
  stopId: number;
  arrivals: number;
  needBuses: number;
  departures: number;
  queueEnd: number;
  status: CellStatus;
}

export interface DispatchRow {
  minute: number;
  clock: string;
  riders: number;
  cells: DispatchCell[];
}

export interface FleetCheck {
  fleetBuses: number;
  minReserve: number;
  allocatable: number;
  assignedBuses: number;
  reserveBuses: number;
  neededBuses: number;
  shortfallBuses: number;
  tripsNeeded: number;
  tripsCanRun: number;
  tripsShortfall: number;
  tripsPerBus: number;
  busTripCeiling: number;
  driverTripLimit: number;
  driverLimited: boolean;
  driverMinNeeded: number;
  driverMinAvail: number;
}

export interface PlanReport {
  scenario: Scenario;
  forecast: ScenarioForecast;
  neededByScenario: Record<Scenario, { needed: number; allocatable: number; shortfall: number }>;
  fleet: FleetCheck;
  stops: StopPlanRow[];
  dispatch: DispatchRow[];
  outcome: { totals: EngineTotals; stops: StopOutcome[]; reserveBuses: number };
  flags: string[];
}

export function buildPlanReport(i: FestivalInputs, stops: StopInput[], scenario: Scenario): PlanReport {
  const sized = sizePlan(i, stops, scenario);
  const fc = sized.forecast;
  const night = runNight(i, stops, {
    mode: "festflow",
    plannedScenario: scenario,
    actualScenario: scenario,
    actualRainChance: i.rainChance,
    actualShiftMin: 0,
    guidanceDriftPts: 0,
  });
  const res = night.result;
  const cap = Math.max(1, i.busCapacity);

  const tripsPerBus = Math.max(1, Math.ceil(i.lastBusMin / i.roundTripMin));
  const driverTripLimit = Math.floor((i.drivers * i.maxDriverMin) / i.roundTripMin);
  const busTripCeiling = sum(night.buses) * tripsPerBus;
  const tripsCanRun = Math.min(busTripCeiling, driverTripLimit);
  const stopRiders = stops.map((_, s) => fc.riders * fc.shares[s]);
  const tripsNeeded = sum(stopRiders.map((r) => Math.ceil(r / cap)));
  const driverMinNeeded = tripsNeeded * i.roundTripMin;
  const driverMinAvail = i.drivers * i.maxDriverMin;

  const fleet: FleetCheck = {
    fleetBuses: i.fleetBuses,
    minReserve: sized.minReserve,
    allocatable: sized.allocatable,
    assignedBuses: sum(sized.assignedBuses),
    reserveBuses: sized.reserveBuses,
    neededBuses: sum(sized.neededBuses),
    shortfallBuses: sized.shortfallBuses,
    tripsNeeded,
    tripsCanRun,
    tripsShortfall: Math.max(0, tripsNeeded - tripsCanRun),
    tripsPerBus,
    busTripCeiling,
    driverTripLimit,
    driverLimited: driverTripLimit < busTripCeiling,
    driverMinNeeded,
    driverMinAvail,
  };

  const stopRows: StopPlanRow[] = stops.map((st, s) => {
    const transit = transitFor(st.distanceKm);
    const r = res.stops[s];
    return {
      stopId: st.id,
      name: st.name,
      share: fc.shares[s],
      riders: r0(stopRiders[s]),
      tripsNeeded: Math.ceil(stopRiders[s] / cap),
      neededBuses: sized.neededBuses[s],
      assignedBuses: sized.assignedBuses[s],
      transitMin: transit,
      prePositionClock: clockAt(i.lastEventEnd, -30),
      departDepotClock: clockAt(i.lastEventEnd, -30 - transit),
      dispatches: r.dispatches,
      reserveDispatches: r.reserveDispatches,
      peakQueue: r.peakQueue,
      peakClock: r.peakClock,
      avgWaitMin: r.avgWaitMin,
    };
  });

  const dispatch: DispatchRow[] = res.slots.map((slot, k) => {
    const prev = k > 0 ? res.slots[k - 1].stops : null;
    const cells: DispatchCell[] = slot.stops.map((c, s) => {
      const qStart = prev ? prev[s].queueEnd : 0;
      const load = c.arrivals + qStart;
      const needBuses = load > 0.5 ? Math.ceil(load / cap) : 0;
      let status: CellStatus = "Idle";
      if (c.queueEnd >= i.crowdThreshold) status = "Alert";
      else if (c.queueEnd > cap / 2) status = "Behind";
      else if (needBuses > 0 || c.departures > 0) status = "On plan";
      return {
        stopId: c.stopId,
        arrivals: r0(c.arrivals),
        needBuses,
        departures: c.departures,
        queueEnd: r0(c.queueEnd),
        status,
      };
    });
    return {
      minute: slot.minute,
      clock: slot.clock,
      riders: r0(sum(slot.stops.map((x) => x.arrivals))),
      cells,
    };
  });

  const neededByScenario = {} as Record<Scenario, { needed: number; allocatable: number; shortfall: number }>;
  for (const sc of SCENARIOS) {
    const sp = sc === scenario ? sized : sizePlan(i, stops, sc);
    neededByScenario[sc] = {
      needed: sum(sp.neededBuses),
      allocatable: sp.allocatable,
      shortfall: sp.shortfallBuses,
    };
  }

  const flags: string[] = [];
  if (sized.shortfallBuses > 0) {
    flags.push(
      `Fleet short: peak circulation needs ${sum(sized.neededBuses)} buses but ${sized.allocatable} can be assigned while holding the ${sized.minReserve}-bus reserve. Add buses or shift share to stops with spare capacity.`,
    );
  }
  if (fleet.tripsShortfall > 0) {
    flags.push(`Trip shortfall: ${fmtN(tripsNeeded)} full-bus trips needed, fleet can run ${fmtN(tripsCanRun)}.`);
  }
  if (fleet.driverLimited && tripsNeeded > driverTripLimit) {
    flags.push(`Driver hours are the binding limit: ${fmtN(driverTripLimit)} trips possible from ${i.drivers} drivers.`);
  }
  if (res.totals.peakQueue >= i.crowdThreshold) {
    flags.push(
      `${res.totals.peakStop} passes the crowd threshold in the simulated plan (peak ${fmtN(res.totals.peakQueue)} waiting vs ${fmtN(i.crowdThreshold)}).`,
    );
  }
  if (res.totals.strandedPct > 2) {
    flags.push(`Stranded riders at last-bus cutoff: ${res.totals.strandedPct}% (target below 2%).`);
  }
  if (flags.length === 0) {
    flags.push("The plan fits the fleet, driver hours and crowd threshold for this scenario.");
  }

  return {
    scenario,
    forecast: fc,
    neededByScenario,
    fleet,
    stops: stopRows,
    dispatch,
    outcome: { totals: res.totals, stops: res.stops, reserveBuses: night.reserveBuses },
    flags,
  };
}

function fmtN(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export { SLOT_MIN };
