import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { SCENARIOS, type Scenario } from "@/lib/festflow/types";
import { loadBundle, toInputs, toStops } from "@/lib/festflow/repo";
import { buildPlanReport, scenarioSummary } from "@/lib/festflow/plan";
import { parseScenario } from "@/lib/festflow/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Planner view: forecast, dispatch plan, fleet check and simulated outcome for one scenario.
export async function GET(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const bundle = await loadBundle(id);
  if (!bundle) return Response.json({ error: "Festival not found" }, { status: 404 });

  const url = new URL(req.url);
  const scenario: Scenario = parseScenario(url.searchParams.get("scenario"));
  const inputs = toInputs(bundle.festival);
  const stops = toStops(bundle.stops);

  const report = buildPlanReport(inputs, stops, scenario);
  const forecasts = {} as Record<Scenario, ReturnType<typeof scenarioSummary>>;
  for (const sc of SCENARIOS) forecasts[sc] = scenarioSummary(inputs, stops, sc);

  const approved = await db
    .select({
      id: plans.id,
      scenario: plans.scenario,
      approvedBy: plans.approvedBy,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(eq(plans.festivalId, id))
    .orderBy(desc(plans.id))
    .limit(5);

  return Response.json({
    id,
    status: bundle.festival.status,
    inputs,
    stops,
    scenario,
    forecasts,
    report,
    approved,
  });
}
