// Demand forecast: total outflow, bus mode share, departure curve and stop split.
import {
  DAY_FACTOR,
  GRID_END,
  GRID_START,
  INTERVENTION_WEIGHTS,
  SCENARIO_MULT,
  SLOT_MIN,
  type FestivalInputs,
  type Interventions,
  type Scenario,
  type StopInput,
} from "./types";
import { clamp, clockAt, gammaP } from "./math";

// Departure curve, as a gamma distribution over minutes after the last event ends.
// Dry nights: broad, peak around 22 min. Rain: earlier and sharper (smaller theta, larger shape).
const DRY = { k: 2.0, theta: 22 };
const WET = { k: 2.6, theta: 9 };

export interface CurveParams {
  k: number;
  theta: number;
  shiftMin: number; // positive = later departures than forecast
}

export function curveFor(rainChance: number, shiftMin = 0): CurveParams {
  const w = clamp(rainChance, 0, 100) / 100;
  return {
    k: DRY.k + (WET.k - DRY.k) * w,
    theta: DRY.theta + (WET.theta - DRY.theta) * w,
    shiftMin,
  };
}

// Share of riders who have left the venue by minute t.
export function cumDeparted(c: CurveParams, t: number): number {
  const x = t - c.shiftMin;
  if (x <= 0) return 0;
  return gammaP(c.k, x / c.theta);
}

export function curvePeakMinute(c: CurveParams): number {
  let best = GRID_START;
  let bestF = -1;
  for (let m = GRID_START; m < GRID_END; m += SLOT_MIN) {
    const f = cumDeparted(c, m + SLOT_MIN) - cumDeparted(c, m);
    if (f > bestF) {
      bestF = f;
      best = m;
    }
  }
  return best;
}

export function outflowFor(i: FestivalInputs): number {
  return Math.round(i.pastFootfall * (1 + i.growthPct / 100) * DAY_FACTOR[i.dayType]);
}

export function modeShareFor(i: FestivalInputs, scenario: Scenario): number {
  return clamp((i.modeShareBasePct / 100) * SCENARIO_MULT[scenario], 0, 1);
}

// Stop split after interventions. Shares are normalized to sum to 1.
export function effectiveShares(stops: StopInput[], interventions: Interventions | null): number[] {
  if (stops.length === 0) return [];
  const keys = Object.keys(INTERVENTION_WEIGHTS) as (keyof Interventions)[];
  const strength = interventions
    ? keys.reduce((acc, k) => acc + (interventions[k] ? INTERVENTION_WEIGHTS[k] : 0), 0)
    : 0;
  const raw = stops.map((s) =>
    Math.max(0, s.baseSharePct + strength * (s.fullInterventionSharePct - s.baseSharePct)),
  );
  const total = raw.reduce((a, b) => a + b, 0);
  return total > 0 ? raw.map((r) => r / total) : raw.map(() => 1 / stops.length);
}

// "Crowd ignores guidance": move a fraction of riders from the other stops to the main stand (index 0).
export function applyDrift(shares: number[], driftFrac: number): number[] {
  if (shares.length < 2 || driftFrac <= 0) return shares;
  const others = shares.slice(1);
  const othersTotal = others.reduce((a, b) => a + b, 0);
  if (othersTotal <= 0) return shares;
  const moved = Math.min(driftFrac, othersTotal);
  return [shares[0] + moved, ...others.map((o) => o - (moved * o) / othersTotal)];
}

export interface SlotForecast {
  minute: number;
  clock: string;
  fraction: number;
  riders: number;
  byStop: number[];
}

export interface ScenarioForecast {
  scenario: Scenario;
  modeSharePct: number;
  outflow: number;
  riders: number;
  shares: number[];
  curve: CurveParams;
  slots: SlotForecast[];
  minutesTo90Pct: number;
}

export function forecastScenario(
  i: FestivalInputs,
  stops: StopInput[],
  scenario: Scenario,
  interventions: Interventions | null,
): ScenarioForecast {
  const outflow = outflowFor(i);
  const modeShare = modeShareFor(i, scenario);
  const riders = outflow * modeShare;
  const shares = effectiveShares(stops, interventions);
  const curve = curveFor(i.rainChance, 0);
  const slots: SlotForecast[] = [];
  for (let m = GRID_START; m < GRID_END; m += SLOT_MIN) {
    const fraction = cumDeparted(curve, m + SLOT_MIN) - cumDeparted(curve, m);
    const r = riders * fraction;
    slots.push({
      minute: m,
      clock: clockAt(i.lastEventEnd, m),
      fraction,
      riders: r,
      byStop: shares.map((s) => r * s),
    });
  }
  let cum = 0;
  let minutesTo90Pct = GRID_END;
  for (const s of slots) {
    cum += s.fraction;
    if (cum >= 0.9) {
      minutesTo90Pct = s.minute + SLOT_MIN;
      break;
    }
  }
  return { scenario, modeSharePct: modeShare * 100, outflow, riders, shares, curve, slots, minutesTo90Pct };
}
