// Shared domain types and planning constants for FestFlow.
// Everything in src/lib/festflow is pure TypeScript so it can run on server and client.

export type DayType = "weekday" | "weekend" | "holiday";
export type Scenario = "low" | "base" | "high";
export type Mode = "festflow" | "legacy";

export interface Interventions {
  signage: boolean;
  announcements: boolean;
  shuttle: boolean;
}

export interface FestivalInputs {
  name: string;
  town: string;
  eventDate: string;
  lastEventEnd: string; // "HH:MM"
  dayType: DayType;
  pastFootfall: number; // people who tried to leave last year's closing night
  growthPct: number;
  rainChance: number; // 0-100
  modeShareBasePct: number; // share of leavers who take a bus (base case)
  lastBusMin: number; // last bus cutoff, minutes after last event end
  busCapacity: number; // riders per bus, including standing
  roundTripMin: number; // stop -> venue area -> stop
  fleetBuses: number;
  reservePct: number; // unassigned reserve as % of fleet
  drivers: number;
  maxDriverMin: number; // max driving minutes per driver for the night
  crowdThreshold: number; // waiting riders that trigger a police alert
  interventions: Interventions;
}

export interface StopInput {
  id: number;
  name: string;
  distanceKm: number; // from venue exits / depot
  baseSharePct: number; // share of bus riders at baseline (no interventions)
  fullInterventionSharePct: number; // share once every intervention is on
  legacyBuses: number; // last year's placement weight (buses), used for the comparison
}

export const SCENARIOS: Scenario[] = ["low", "base", "high"];
export const SCENARIO_MULT: Record<Scenario, number> = { low: 0.7, base: 1, high: 1.3 };
export const DAY_FACTOR: Record<DayType, number> = { weekday: 1, weekend: 1.08, holiday: 1.18 };

// Each intervention delivers this share of the full shift from baseline to fully-intervened split.
export const INTERVENTION_WEIGHTS: Record<keyof Interventions, number> = {
  signage: 0.35,
  announcements: 0.25,
  shuttle: 0.4,
};

export const SLOT_MIN = 15; // planning slot (minutes)
export const TICK_MIN = 5; // simulation tick (minutes)
export const GRID_START = -30; // pre-positioning starts 30 min before last event ends
export const GRID_END = 240; // demand horizon (minutes after last event ends)
export const PHONE_LAG_MIN = 15; // legacy: buses wait this long for a phone dispatch
export const MAX_WAIT_MIN = 10; // rule: leave after 10 min with a queue

export const NO_INTERVENTIONS: Interventions = { signage: false, announcements: false, shuttle: false };
export const ALL_INTERVENTIONS: Interventions = { signage: true, announcements: true, shuttle: true };

export const DEMO_FESTIVAL: FestivalInputs = {
  name: "Mallur Temple Festival, closing night",
  town: "Mallur",
  eventDate: "2026-11-08",
  lastEventEnd: "21:30",
  dayType: "weekday",
  pastFootfall: 36000,
  growthPct: 10,
  rainChance: 40,
  modeShareBasePct: 22,
  lastBusMin: 180,
  busCapacity: 70,
  roundTripMin: 45,
  fleetBuses: 100,
  reservePct: 12,
  drivers: 60,
  maxDriverMin: 240,
  crowdThreshold: 1500,
  interventions: ALL_INTERVENTIONS,
};

export const DEMO_STOPS: StopInput[] = [
  { id: 0, name: "Main Bus Stand", distanceKm: 0.4, baseSharePct: 85, fullInterventionSharePct: 55, legacyBuses: 12 },
  { id: 0, name: "Temple Road Stop (2 km)", distanceKm: 2, baseSharePct: 12, fullInterventionSharePct: 30, legacyBuses: 4 },
  { id: 0, name: "Market Junction", distanceKm: 3.5, baseSharePct: 3, fullInterventionSharePct: 15, legacyBuses: 2 },
];
