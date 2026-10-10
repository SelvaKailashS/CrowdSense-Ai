import { desc } from "drizzle-orm";
import { db } from "@/db";
import { festivals, stops } from "@/db/schema";
import { DEMO_FESTIVAL, DEMO_STOPS } from "@/lib/festflow/types";
import { parseInputs } from "@/lib/festflow/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      town: festivals.town,
      eventDate: festivals.eventDate,
      status: festivals.status,
      fleetBuses: festivals.fleetBuses,
      createdAt: festivals.createdAt,
    })
    .from(festivals)
    .orderBy(desc(festivals.id));
  return Response.json({ festivals: rows });
}

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const inputs = parseInputs(body, DEMO_FESTIVAL);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(festivals)
      .values({ ...inputs, status: "planning" })
      .returning({ id: festivals.id });
    await tx.insert(stops).values(
      DEMO_STOPS.map((s, idx) => ({
        festivalId: row.id,
        position: idx,
        name: s.name,
        distanceKm: s.distanceKm,
        baseSharePct: s.baseSharePct,
        fullInterventionSharePct: s.fullInterventionSharePct,
        legacyBuses: s.legacyBuses,
      })),
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
