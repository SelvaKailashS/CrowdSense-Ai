import { neon } from "@neondatabase/serverless";

const NEON_STORAGE_KEY = "crowdsense_neon_db_url";

export function getStoredNeonUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NEON_STORAGE_KEY) || (import.meta as any).env?.VITE_DATABASE_URL || "";
  } catch {
    return "";
  }
}

export function saveNeonUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NEON_STORAGE_KEY, url.trim());
  } catch (e) {
    console.error("Failed to save Neon DB URL:", e);
  }
}

export function clearNeonUrl(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(NEON_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear Neon DB URL:", e);
  }
}

export async function testNeonConnection(url?: string): Promise<{ success: boolean; version?: string; error?: string }> {
  const dbUrl = url || getStoredNeonUrl();
  if (!dbUrl) {
    return { success: false, error: "No connection string provided" };
  }

  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT version(), current_database() as db_name, now() as timestamp;`;
    if (rows && rows.length > 0) {
      return {
        success: true,
        version: `${rows[0].version?.split(" ")[0]} ${rows[0].version?.split(" ")[1]} (Database: ${rows[0].db_name})`,
      };
    }
    return { success: false, error: "Empty query response" };
  } catch (err: any) {
    console.error("Neon connection test failed:", err);
    return {
      success: false,
      error: err.message || "Failed to reach Neon serverless database",
    };
  }
}

export async function initializeNeonSchema(url?: string): Promise<{ success: boolean; error?: string }> {
  const dbUrl = url || getStoredNeonUrl();
  if (!dbUrl) return { success: false, error: "No connection string provided" };

  try {
    const sql = neon(dbUrl);

    // Create tables matching schema.ts
    await sql`
      CREATE TABLE IF NOT EXISTS festivals (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        town TEXT NOT NULL,
        event_date TEXT NOT NULL,
        last_event_end TEXT NOT NULL,
        day_type TEXT NOT NULL,
        past_footfall INTEGER NOT NULL,
        growth_pct REAL NOT NULL,
        rain_chance INTEGER NOT NULL,
        mode_share_base_pct REAL NOT NULL,
        last_bus_min INTEGER NOT NULL,
        bus_capacity INTEGER NOT NULL,
        round_trip_min INTEGER NOT NULL,
        fleet_buses INTEGER NOT NULL,
        reserve_pct REAL NOT NULL,
        drivers INTEGER NOT NULL,
        max_driver_min INTEGER NOT NULL,
        crowd_threshold INTEGER NOT NULL,
        interventions JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS stops (
        id SERIAL PRIMARY KEY,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        distance_km REAL NOT NULL,
        base_share_pct REAL NOT NULL,
        full_intervention_share_pct REAL NOT NULL,
        legacy_buses INTEGER NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS live_counts (
        id SERIAL PRIMARY KEY,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        stop_id INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        waiting INTEGER NOT NULL,
        load_factor_pct REAL NOT NULL,
        cctv_density REAL NOT NULL,
        source TEXT NOT NULL,
        alert INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS live_runs (
        id SERIAL PRIMARY KEY,
        festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        planned_scenario TEXT NOT NULL,
        actual_scenario TEXT NOT NULL,
        actual_rain_chance INTEGER NOT NULL,
        actual_shift_min INTEGER NOT NULL,
        guidance_drift_pts REAL NOT NULL,
        summary JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initialize Neon schema" };
  }
}

// Push local festivals & state up to Neon PostgreSQL
export async function pushToNeon(festivalsList: any[], url?: string): Promise<{ success: boolean; insertedCount?: number; error?: string }> {
  const dbUrl = url || getStoredNeonUrl();
  if (!dbUrl) return { success: false, error: "No connection string" };

  try {
    const initRes = await initializeNeonSchema(dbUrl);
    if (!initRes.success) return initRes;

    const sql = neon(dbUrl);

    for (const fest of festivalsList) {
      await sql`
        INSERT INTO festivals (
          id, name, town, event_date, last_event_end, day_type, past_footfall, growth_pct,
          rain_chance, mode_share_base_pct, last_bus_min, bus_capacity, round_trip_min,
          fleet_buses, reserve_pct, drivers, max_driver_min, crowd_threshold, interventions,
          status, created_at
        ) VALUES (
          ${fest.id}, ${fest.name}, ${fest.town}, ${fest.eventDate || "2026-11-08"}, ${fest.inputs.lastEventEnd},
          ${fest.inputs.dayType}, ${fest.inputs.pastFootfall}, ${fest.inputs.growthPct}, ${fest.inputs.rainChance},
          ${fest.inputs.modeShareBasePct}, ${fest.inputs.lastBusMin}, ${fest.inputs.busCapacity}, ${fest.inputs.roundTripMin},
          ${fest.fleetBuses || 100}, ${fest.inputs.reservePct}, ${fest.inputs.drivers}, ${fest.inputs.maxDriverMin},
          ${fest.inputs.crowdThreshold}, ${JSON.stringify(fest.inputs.interventions)}, ${fest.status || "planning"},
          ${fest.createdAt ? new Date(fest.createdAt) : new Date()}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          town = EXCLUDED.town,
          rain_chance = EXCLUDED.rain_chance,
          fleet_buses = EXCLUDED.fleet_buses,
          crowd_threshold = EXCLUDED.crowd_threshold,
          status = EXCLUDED.status;
      `;
    }

    return { success: true, insertedCount: festivalsList.length };
  } catch (err: any) {
    console.error("Failed to push to Neon:", err);
    return { success: false, error: err.message || "Push to Neon failed" };
  }
}

// Pull latest festivals from Neon PostgreSQL
export async function pullFromNeon(url?: string): Promise<{ success: boolean; festivals?: any[]; error?: string }> {
  const dbUrl = url || getStoredNeonUrl();
  if (!dbUrl) return { success: false, error: "No connection string" };

  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT * FROM festivals ORDER BY id ASC;`;
    return { success: true, festivals: rows };
  } catch (err: any) {
    return { success: false, error: err.message || "Pull from Neon failed" };
  }
}
