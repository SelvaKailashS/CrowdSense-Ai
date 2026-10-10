import { DEMO_FESTIVAL, DEMO_STOPS, FestivalInputs, StopInput, Scenario, Mode, SCENARIOS } from "./festflow/types";
import { buildPlanReport, scenarioSummary, runNight } from "./festflow/plan";
import { parseInputs, parseScenario } from "./festflow/validate";

export interface StoredFestival {
  id: number;
  name: string;
  town: string;
  eventDate: string;
  status: string;
  fleetBuses: number;
  createdAt: string;
  inputs: FestivalInputs;
  stops: StopInput[];
  approved: { id: number; scenario: string; approvedBy: string; createdAt: string }[];
  latestRun?: any;
  counts: any[];
}

const STORAGE_KEY = "crowdsense_festivals_v1";

function getStored(): StoredFestival[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load local storage", e);
  }

  // Initial seed
  const initial: StoredFestival[] = [
    {
      id: 1,
      name: "Mallur Temple Festival, closing night",
      town: "Mallur",
      eventDate: "2026-11-08",
      status: "planning",
      fleetBuses: 100,
      createdAt: new Date().toISOString(),
      inputs: { ...DEMO_FESTIVAL },
      stops: DEMO_STOPS.map((s, idx) => ({ ...s, id: idx + 1 })),
      approved: [],
      counts: [
        {
          id: 1,
          stopId: 1,
          minute: 30,
          waiting: 420,
          loadFactorPct: 85,
          cctvDensity: 2.1,
          source: "Marshal count",
          alert: 0,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          stopId: 2,
          minute: 45,
          waiting: 650,
          loadFactorPct: 92,
          cctvDensity: 2.8,
          source: "CCTV density",
          alert: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ];
  saveStored(initial);
  return initial;
}

function saveStored(data: StoredFestival[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save local storage", e);
  }
}

export function initMockApi() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (!urlStr.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const url = new URL(urlStr, window.location.origin);
    const path = url.pathname;
    const method = init?.method?.toUpperCase() || "GET";

    let bodyData: any = {};
    if (init?.body && typeof init.body === "string") {
      try {
        bodyData = JSON.parse(init.body);
      } catch {
        bodyData = {};
      }
    }

    const festivals = getStored();

    // GET /api/festivals
    if (path === "/api/festivals" && method === "GET") {
      return new Response(JSON.stringify({ festivals }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /api/festivals
    if (path === "/api/festivals" && method === "POST") {
      const inputs = parseInputs(bodyData, DEMO_FESTIVAL);
      const nextId = festivals.length > 0 ? Math.max(...festivals.map((f) => f.id)) + 1 : 1;
      const newFest: StoredFestival = {
        id: nextId,
        name: inputs.name,
        town: inputs.town,
        eventDate: inputs.eventDate,
        status: "planning",
        fleetBuses: inputs.fleetBuses,
        createdAt: new Date().toISOString(),
        inputs,
        stops: DEMO_STOPS.map((s, idx) => ({ ...s, id: idx + 1 })),
        approved: [],
        counts: [],
      };
      festivals.push(newFest);
      saveStored(festivals);
      return new Response(JSON.stringify({ id: nextId }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Match /api/festivals/:id/approve
    const approveMatch = path.match(/^\/api\/festivals\/(\d+)\/approve$/);
    if (approveMatch && method === "POST") {
      const id = Number(approveMatch[1]);
      const fest = festivals.find((f) => f.id === id);
      if (!fest) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      fest.status = "approved";
      fest.approved.push({
        id: fest.approved.length + 1,
        scenario: bodyData.scenario || "base",
        approvedBy: bodyData.approvedBy || "Control Room Chief",
        createdAt: new Date().toISOString(),
      });
      saveStored(festivals);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Match /api/festivals/:id/plan
    const planMatch = path.match(/^\/api\/festivals\/(\d+)\/plan$/);
    if (planMatch && method === "GET") {
      const id = Number(planMatch[1]);
      const fest = festivals.find((f) => f.id === id);
      if (!fest) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      const scenario = parseScenario(url.searchParams.get("scenario") || "base");
      const report = buildPlanReport(fest.inputs, fest.stops, scenario);
      const forecasts = {} as any;
      for (const sc of SCENARIOS) forecasts[sc] = scenarioSummary(fest.inputs, fest.stops, sc);

      return new Response(
        JSON.stringify({
          id: fest.id,
          status: fest.status,
          inputs: fest.inputs,
          stops: fest.stops,
          scenario,
          forecasts,
          report,
          approved: fest.approved,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Match /api/festivals/:id/simulate
    const simMatch = path.match(/^\/api\/festivals\/(\d+)\/simulate$/);
    if (simMatch && method === "POST") {
      const id = Number(simMatch[1]);
      const fest = festivals.find((f) => f.id === id);
      if (!fest) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      const run = runNight(fest.inputs, fest.stops, {
        mode: (bodyData.mode as Mode) || "festflow",
        plannedScenario: parseScenario(bodyData.plannedScenario || "base"),
        actualScenario: parseScenario(bodyData.actualScenario || "base"),
        actualRainChance: bodyData.actualRainChance ?? fest.inputs.rainChance,
        actualShiftMin: bodyData.actualShiftMin ?? 0,
        guidanceDriftPts: bodyData.guidanceDriftPts ?? 0,
      });

      if (bodyData.save) {
        fest.latestRun = {
          mode: bodyData.mode || "festflow",
          plannedScenario: bodyData.plannedScenario || "base",
          actualScenario: bodyData.actualScenario || "base",
          actualRainChance: bodyData.actualRainChance ?? fest.inputs.rainChance,
          actualShiftMin: bodyData.actualShiftMin ?? 0,
          guidanceDriftPts: bodyData.guidanceDriftPts ?? 0,
          summary: run.result.totals,
          createdAt: new Date().toISOString(),
        };
        fest.status = "live";
        saveStored(festivals);
      }

      return new Response(JSON.stringify({ run }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Match /api/festivals/:id/counts
    const countsMatch = path.match(/^\/api\/festivals\/(\d+)\/counts$/);
    if (countsMatch) {
      const id = Number(countsMatch[1]);
      const fest = festivals.find((f) => f.id === id);
      if (!fest) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      if (method === "GET") {
        return new Response(JSON.stringify({ counts: fest.counts || [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "POST") {
        const waiting = Number(bodyData.waiting) || 0;
        const alert = waiting > fest.inputs.crowdThreshold ? 1 : 0;
        const newCount = {
          id: (fest.counts?.length || 0) + 1,
          stopId: Number(bodyData.stopId) || 1,
          minute: Number(bodyData.minute) || 0,
          waiting,
          loadFactorPct: Number(bodyData.loadFactorPct) || 80,
          cctvDensity: Number(bodyData.cctvDensity) || 2.0,
          source: bodyData.source || "Marshal count",
          alert,
          createdAt: new Date().toISOString(),
        };
        fest.counts = fest.counts || [];
        fest.counts.unshift(newCount);
        saveStored(festivals);
        return new Response(JSON.stringify({ id: newCount.id, alert }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Match /api/festivals/:id
    const festMatch = path.match(/^\/api\/festivals\/(\d+)$/);
    if (festMatch) {
      const id = Number(festMatch[1]);
      const fest = festivals.find((f) => f.id === id);
      if (!fest) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      if (method === "GET") {
        return new Response(JSON.stringify({ festival: fest, inputs: fest.inputs, stops: fest.stops }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "PATCH" || method === "PUT") {
        if (bodyData.inputs) fest.inputs = { ...fest.inputs, ...bodyData.inputs };
        if (bodyData.stops) fest.stops = bodyData.stops;
        fest.name = fest.inputs.name;
        fest.town = fest.inputs.town;
        fest.fleetBuses = fest.inputs.fleetBuses;
        fest.eventDate = fest.inputs.eventDate;
        saveStored(festivals);
        return new Response(JSON.stringify({ ok: true, inputs: fest.inputs, stops: fest.stops }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (path === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", app: "CrowdSense AI" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not handled" }), { status: 404 });
  };
}
