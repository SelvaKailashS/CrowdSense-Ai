import { eq } from "drizzle-orm";
import { db } from "@/db";
import { festivals, plans } from "@/db/schema";
import { loadBundle, toInputs, toStops } from "@/lib/festflow/repo";
import { buildPlanReport } from "@/lib/festflow/plan";
import { parseScenario } from "@/lib/festflow/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Freeze the current plan as an approved snapshot for dispatch on the night.
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
  const scenario = parseScenario(body.scenario);
  const report = buildPlanReport(toInputs(bundle.festival), toStops(bundle.stops), scenario);

  const [row] = await db
    .insert(plans)
    .values({
      festivalId: id,
      scenario,
      approvedBy: "Transport planner",
      payload: report,
    })
    .returning({ id: plans.id });

  await db.update(festivals).set({ status: "approved" }).where(eq(festivals.id, id));
  return Response.json({ ok: true, planId: row.id });
}
