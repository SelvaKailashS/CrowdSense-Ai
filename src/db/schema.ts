import { integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Interventions } from "../lib/festflow/types";

// A festival night: programme, demand, fleet and policy inputs.
export const festivals = pgTable("festivals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  town: text("town").notNull(),
  eventDate: text("event_date").notNull(),
  lastEventEnd: text("last_event_end").notNull(),
  dayType: text("day_type").notNull(),
  pastFootfall: integer("past_footfall").notNull(),
  growthPct: real("growth_pct").notNull(),
  rainChance: integer("rain_chance").notNull(),
  modeShareBasePct: real("mode_share_base_pct").notNull(),
  lastBusMin: integer("last_bus_min").notNull(),
  busCapacity: integer("bus_capacity").notNull(),
  roundTripMin: integer("round_trip_min").notNull(),
  fleetBuses: integer("fleet_buses").notNull(),
  reservePct: real("reserve_pct").notNull(),
  drivers: integer("drivers").notNull(),
  maxDriverMin: integer("max_driver_min").notNull(),
  crowdThreshold: integer("crowd_threshold").notNull(),
  interventions: jsonb("interventions").$type<Interventions>().notNull(),
  status: text("status").notNull().default("planning"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Boarding points (stops) with the baseline and fully-intervened crowd split.
export const stops = pgTable("stops", {
  id: serial("id").primaryKey(),
  festivalId: integer("festival_id")
    .notNull()
    .references(() => festivals.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  distanceKm: real("distance_km").notNull(),
  baseSharePct: real("base_share_pct").notNull(),
  fullInterventionSharePct: real("full_intervention_share_pct").notNull(),
  legacyBuses: integer("legacy_buses").notNull(),
});

// Snapshot of a plan the planner approved (used for dispatch on the night).
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  festivalId: integer("festival_id")
    .notNull()
    .references(() => festivals.id, { onDelete: "cascade" }),
  scenario: text("scenario").notNull(),
  approvedBy: text("approved_by").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Saved control-room replays. The latest one is treated as the "actual" night for the report.
export const liveRuns = pgTable("live_runs", {
  id: serial("id").primaryKey(),
  festivalId: integer("festival_id")
    .notNull()
    .references(() => festivals.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  plannedScenario: text("planned_scenario").notNull(),
  actualScenario: text("actual_scenario").notNull(),
  actualRainChance: integer("actual_rain_chance").notNull(),
  actualShiftMin: integer("actual_shift_min").notNull(),
  guidanceDriftPts: real("guidance_drift_pts").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Manual counts from conductors, marshals, or CCTV density, entered by the operator.
export const liveCounts = pgTable("live_counts", {
  id: serial("id").primaryKey(),
  festivalId: integer("festival_id")
    .notNull()
    .references(() => festivals.id, { onDelete: "cascade" }),
  stopId: integer("stop_id").notNull(),
  minute: integer("minute").notNull(),
  waiting: integer("waiting").notNull(),
  loadFactorPct: real("load_factor_pct").notNull(),
  cctvDensity: real("cctv_density").notNull(),
  source: text("source").notNull(),
  alert: integer("alert").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
