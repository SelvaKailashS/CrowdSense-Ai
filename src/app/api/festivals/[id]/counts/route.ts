import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { festivals, liveCounts } from "@/db/schema";
import { clamp } from "@/lib/festflow/math";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const rows = await db
    .select()
    .from(liveCounts)
    .where(eq(liveCounts.festivalId, id))
    .orderBy(desc(liveCounts.id))
    .limit(30);
  return Response.json({ counts: rows });
}

// Operator records a manual count (marshal, conductor, or CCTV density) for one stop.
export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const [festival] = await db
    .select({ threshold: festivals.crowdThreshold })
    .from(festivals)
    .where(eq(festivals.id, id))
    .limit(1);
  if (!festival) return Response.json({ error: "Festival not found" }, { status: 404 });

  const waiting = Math.round(clamp(Number(body.waiting ?? 0), 0, 1000000));
  const alert = waiting >= festival.threshold;
  const [row] = await db
    .insert(liveCounts)
    .values({
      festivalId: id,
      stopId: Math.round(Number(body.stopId ?? 0)),
      minute: Math.round(clamp(Number(body.minute ?? 0), -30, 360)),
      waiting,
      loadFactorPct: clamp(Number(body.loadFactorPct ?? 0), 0, 200),
      cctvDensity: clamp(Number(body.cctvDensity ?? 0), 0, 10),
      source: typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 60) : "Marshal count",
      alert: alert ? 1 : 0,
    })
    .returning();
  return Response.json({ count: row, alert }, { status: 201 });
}
