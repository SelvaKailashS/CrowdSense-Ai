// Input parsing for API bodies. Pure functions, safe to use on server and client.
import type { DayType, FestivalInputs, Scenario, StopInput } from "./types";

function num(v: unknown, min: number, max: number, fb: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, n));
}

function text(v: unknown, fb: string, max = 120): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fb;
}

function time(v: unknown, fb: string): string {
  return typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim() : fb;
}

function date(v: unknown, fb: string): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fb;
}

function dayType(v: unknown, fb: DayType): DayType {
  return v === "weekday" || v === "weekend" || v === "holiday" ? v : fb;
}

function bool(v: unknown, fb: boolean): boolean {
  return typeof v === "boolean" ? v : fb;
}

export function parseScenario(v: unknown, fb: Scenario = "base"): Scenario {
  return v === "low" || v === "base" || v === "high" ? v : fb;
}

export function parseInputs(body: unknown, fb: FestivalInputs): FestivalInputs {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const iv = (b.interventions && typeof b.interventions === "object" ? b.interventions : {}) as Record<
    string,
    unknown
  >;
  return {
    name: text(b.name, fb.name),
    town: text(b.town, fb.town),
    eventDate: date(b.eventDate, fb.eventDate),
    lastEventEnd: time(b.lastEventEnd, fb.lastEventEnd),
    dayType: dayType(b.dayType, fb.dayType),
    pastFootfall: Math.round(num(b.pastFootfall, 0, 1000000, fb.pastFootfall)),
    growthPct: num(b.growthPct, -50, 200, fb.growthPct),
    rainChance: Math.round(num(b.rainChance, 0, 100, fb.rainChance)),
    modeShareBasePct: num(b.modeShareBasePct, 0, 100, fb.modeShareBasePct),
    lastBusMin: Math.round(num(b.lastBusMin, 60, 360, fb.lastBusMin)),
    busCapacity: Math.round(num(b.busCapacity, 10, 150, fb.busCapacity)),
    roundTripMin: Math.round(num(b.roundTripMin, 15, 240, fb.roundTripMin)),
    fleetBuses: Math.round(num(b.fleetBuses, 1, 1000, fb.fleetBuses)),
    reservePct: num(b.reservePct, 0, 50, fb.reservePct),
    drivers: Math.round(num(b.drivers, 1, 1000, fb.drivers)),
    maxDriverMin: Math.round(num(b.maxDriverMin, 60, 900, fb.maxDriverMin)),
    crowdThreshold: Math.round(num(b.crowdThreshold, 100, 100000, fb.crowdThreshold)),
    interventions: {
      signage: bool(iv.signage, fb.interventions.signage),
      announcements: bool(iv.announcements, fb.interventions.announcements),
      shuttle: bool(iv.shuttle, fb.interventions.shuttle),
    },
  };
}

// id > 0 means an existing stop; anything else is treated as new.
export function parseStops(body: unknown): StopInput[] {
  if (!Array.isArray(body)) throw new Error("stops must be an array");
  const out: StopInput[] = body.slice(0, 8).map((raw, idx) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = Number(r.id);
    return {
      id: Number.isInteger(id) && id > 0 ? id : 0,
      name: text(r.name, `Stop ${idx + 1}`, 80),
      distanceKm: num(r.distanceKm, 0, 50, 1),
      baseSharePct: num(r.baseSharePct, 0, 100, 0),
      fullInterventionSharePct: num(r.fullInterventionSharePct, 0, 100, 0),
      legacyBuses: Math.round(num(r.legacyBuses, 0, 500, 0)),
    };
  });
  if (out.length === 0) throw new Error("At least one stop is required");
  return out;
}
