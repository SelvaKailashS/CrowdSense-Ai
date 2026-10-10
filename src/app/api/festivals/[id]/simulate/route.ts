import { db } from "@/db";
import { liveRuns } from "@/db/schema";
import { loadBundle, toInputs, toStops } from "@/lib/festflow/repo";
import { runNight, type NightSpec } from "@/lib/festflow/plan";
import { clamp } from "@/lib/festflow/math";
import { parseScenario } from "@/lib/festflow/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Replay a night on the control-room model. Optionally save it as the "actual" night for the report.
export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const bundle = await loadBundle(id);
  if (!bundle) return Response.json({ error: "Festival not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const inputs = toInputs(bundle.festival);
  const stops = toStops(bundle.stops);

  const spec: NightSpec = {
    mode: body.mode === "legacy" ? "legacy" : "festflow",
    plannedScenario: parseScenario(body.plannedScenario),
    actualScenario: parseScenario(body.actualScenario),
    actualRainChance: Math.round(clamp(Number(body.actualRainChance ?? inputs.rainChance), 0, 100)),
    actualShiftMin: Math.round(clamp(Number(body.actualShiftMin ?? 0), -30, 120)),
    guidanceDriftPts: clamp(Number(body.guidanceDriftPts ?? 0), 0, 40),
  };

  const run = runNight(inputs, stops, spec);

  if (body.save === true) {
    await db.insert(liveRuns).values({
      festivalId: id,
      mode: spec.mode,
      plannedScenario: spec.plannedScenario,
      actualScenario: spec.actualScenario,
      actualRainChance: spec.actualRainChance,
      actualShiftMin: spec.actualShiftMin,
      guidanceDriftPts: spec.guidanceDriftPts,
      summary: {
        ...run.result.totals,
        plannedRiders: Math.round(run.plannedRiders),
        actualRiders: Math.round(run.actualRiders),
        actualPeakMinute: run.actualPeakMinute,
        reserveBuses: run.reserveBuses,
      },
    });
  }

  return Response.json({
    run: {
      mode: spec.mode,
      spec,
      capacity: run.capacity,
      buses: run.buses,
      reserveBuses: run.reserveBuses,
      plannedRiders: Math.round(run.plannedRiders),
      actualRiders: Math.round(run.actualRiders),
      actualPeakMinute: run.actualPeakMinute,
      actualShares: run.actualShares,
      stopNames: stops.map((s) => s.name),
      stopIds: stops.map((s) => s.id),
      result: run.result,
    },
    saved: body.save === true,
  });
}
