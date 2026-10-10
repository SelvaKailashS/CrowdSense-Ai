import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { festivals } from "@/db/schema";
import { NewFestival } from "@/components/festflow/NewFestival";
import { Card, Pill, btnGhost } from "@/components/festflow/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", t: "Forecast (T-7)", d: "Programme, weather and past footfall give riders, bus share and a 15-minute departure curve, low to high." },
  { n: "2", t: "Plan by stop and slot", d: "Buses are sized per stop from peak circulation, pre-positioned before minute 0, with 10–15% held in reserve." },
  { n: "3", t: "Run the control room", d: "Queues per stop, rule-based dispatch, reserve buses, crowd alerts and a re-forecast every 15 minutes." },
  { n: "4", t: "Learn (post-event)", d: "Forecast against actual, peak queues, waits, stranded riders and reserve use, against last year's placement." },
];

export default async function HomePage() {
  const rows = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      town: festivals.town,
      eventDate: festivals.eventDate,
      status: festivals.status,
      fleetBuses: festivals.fleetBuses,
    })
    .from(festivals)
    .orderBy(desc(festivals.id));

  return (
    <main className="space-y-8">
      <section className="neu-raised p-8 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terra">FestFlow</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          Put the buses where the crowd will be, before the crowd arrives.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
          A closing night can send 40,000 people to one town within two hours. FestFlow forecasts the outflow a week ahead,
          plans buses per stop and slot, and corrects the plan live from queue counts.
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="neu-inset p-5">
              <p className="font-display text-sm italic text-terra">Step {s.n}</p>
              <p className="mt-1.5 text-sm font-semibold text-ink">{s.t}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Festivals"
          className="lg:col-span-2"
          subtitle="Each festival has its own inputs, stop split, plan, live replay and report."
        >
          {rows.length === 0 ? (
            <p className="text-sm text-ink-soft">No festivals yet. Create one to start planning.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {rows.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div>
                    <p className="font-display text-lg text-ink">{f.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {f.town} · {f.eventDate} · fleet {f.fleetBuses} buses
                    </p>
                    <div className="mt-3">
                      <Pill tone={f.status === "approved" ? "good" : f.status === "live" ? "info" : "neutral"}>{f.status}</Pill>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/festivals/${f.id}`} className={btnGhost}>
                      Planner
                    </Link>
                    <Link href={`/festivals/${f.id}/live`} className={btnGhost}>
                      Control room
                    </Link>
                    <Link href={`/festivals/${f.id}/report`} className={btnGhost}>
                      Report
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <NewFestival />
      </div>
    </main>
  );
}
