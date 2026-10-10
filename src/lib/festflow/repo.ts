// Server-only database helpers for FestFlow. Do not import from client components.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { festivals, stops as stopsTable } from "@/db/schema";
import type { DayType, FestivalInputs, StopInput } from "./types";

export type FestivalRow = typeof festivals.$inferSelect;
export type StopRow = typeof stopsTable.$inferSelect;

export async function loadBundle(id: number): Promise<{ festival: FestivalRow; stops: StopRow[] } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [festival] = await db.select().from(festivals).where(eq(festivals.id, id)).limit(1);
  if (!festival) return null;
  const stopRows = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.festivalId, id))
    .orderBy(asc(stopsTable.position));
  return { festival, stops: stopRows };
}

export function toInputs(f: FestivalRow): FestivalInputs {
  return {
    name: f.name,
    town: f.town,
    eventDate: f.eventDate,
    lastEventEnd: f.lastEventEnd,
    dayType: f.dayType as DayType,
    pastFootfall: f.pastFootfall,
    growthPct: f.growthPct,
    rainChance: f.rainChance,
    modeShareBasePct: f.modeShareBasePct,
    lastBusMin: f.lastBusMin,
    busCapacity: f.busCapacity,
    roundTripMin: f.roundTripMin,
    fleetBuses: f.fleetBuses,
    reservePct: f.reservePct,
    drivers: f.drivers,
    maxDriverMin: f.maxDriverMin,
    crowdThreshold: f.crowdThreshold,
    interventions: f.interventions,
  };
}

export function toStops(rows: StopRow[]): StopInput[] {
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    distanceKm: s.distanceKm,
    baseSharePct: s.baseSharePct,
    fullInterventionSharePct: s.fullInterventionSharePct,
    legacyBuses: s.legacyBuses,
  }));
}
