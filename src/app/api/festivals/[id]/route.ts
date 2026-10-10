import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { festivals, stops as stopsTable } from "@/db/schema";
import { loadBundle, toInputs, toStops } from "@/lib/festflow/repo";
import { parseInputs, parseStops } from "@/lib/festflow/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const bundle = await loadBundle(id);
  if (!bundle) return Response.json({ error: "Festival not found" }, { status: 404 });
  return Response.json({
    id,
    status: bundle.festival.status,
    inputs: toInputs(bundle.festival),
    stops: toStops(bundle.stops),
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const bundle = await loadBundle(id);
  if (!bundle) return Response.json({ error: "Festival not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const inputs = parseInputs(body.inputs ?? {}, toInputs(bundle.festival));
    const existingIds = bundle.stops.map((s) => s.id);
    const stopsIn = body.stops !== undefined ? parseStops(body.stops) : toStops(bundle.stops);
    const keepIds = stopsIn.filter((s) => s.id > 0 && existingIds.includes(s.id)).map((s) => s.id);

    await db.transaction(async (tx) => {
      await tx.update(festivals).set(inputs).where(eq(festivals.id, id));
      await tx
        .delete(stopsTable)
        .where(and(eq(stopsTable.festivalId, id), notInArray(stopsTable.id, keepIds.length ? keepIds : [-1])));
      for (let idx = 0; idx < stopsIn.length; idx++) {
        const s = stopsIn[idx];
        const values = {
          position: idx,
          name: s.name,
          distanceKm: s.distanceKm,
          baseSharePct: s.baseSharePct,
          fullInterventionSharePct: s.fullInterventionSharePct,
          legacyBuses: s.legacyBuses,
        };
        if (s.id > 0 && keepIds.includes(s.id)) {
          await tx.update(stopsTable).set(values).where(eq(stopsTable.id, s.id));
        } else {
          await tx.insert(stopsTable).values({ ...values, festivalId: id });
        }
      }
    });

    const updated = await loadBundle(id);
    if (!updated) return Response.json({ error: "Festival not found" }, { status: 404 });
    return Response.json({
      id,
      status: updated.festival.status,
      inputs: toInputs(updated.festival),
      stops: toStops(updated.stops),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid festival data";
    return Response.json({ error: message }, { status: 400 });
  }
}
