import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { liveRuns } from "@/db/schema";
import { loadBundle, toInputs, toStops } from "@/lib/festflow/repo";
import { runNight } from "@/lib/festflow/plan";
import { curveFor, curvePeakMinute, outflowFor } from "@/lib/festflow/forecast";
import { clockAt, fmtInt } from "@/lib/festflow/math";
import { parseScenario } from "@/lib/festflow/validate";
import { Card, Pill, Stat, STOP_COLORS, Well, btnGhost } from "@/components/festflow/ui";

export const dynamic = "force-dynamic";

const TH = "py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fid = Number(id);
  const bundle = await loadBundle(fid);
  if (!bundle) notFound();

  const inputs = toInputs(bundle.festival);
  const stops = toStops(bundle.stops);
  const [last] = await db
    .select()
    .from(liveRuns)
    .where(eq(liveRuns.festivalId, fid))
    .orderBy(desc(liveRuns.id))
    .limit(1);

  const spec = {
    plannedScenario: parseScenario(last?.plannedScenario ?? "base"),
    actualScenario: parseScenario(last?.actualScenario ?? "base"),
    actualRainChance: last?.actualRainChance ?? inputs.rainChance,
    actualShiftMin: last?.actualShiftMin ?? 0,
    guidanceDriftPts: last?.guidanceDriftPts ?? 0,
  };
  const ff = runNight(inputs, stops, { ...spec, mode: "festflow" });
  const lg = runNight(inputs, stops, { ...spec, mode: "legacy" });
  const T = ff.result.totals;
  const L = lg.result.totals;

  const peakRed = L.peakQueue > 0 ? (1 - T.peakQueue / L.peakQueue) * 100 : 0;
  const waitRed = L.avgWaitMin > 0 ? (1 - T.avgWaitMin / L.avgWaitMin) * 100 : 0;
  const volErr = ff.actualRiders > 0 ? (Math.abs(ff.plannedRiders - ff.actualRiders) / ff.actualRiders) * 100 : 0;
  const plannedPeak = curvePeakMinute(curveFor(inputs.rainChance, 0));
  const timingErr = ff.actualPeakMinute - plannedPeak;
  const outflow = outflowFor(inputs);
  const actualShare = outflow > 0 ? (ff.actualRiders / outflow) * 100 : 0;
  const plannedShare = inputs.modeShareBasePct * (spec.plannedScenario === "low" ? 0.7 : spec.plannedScenario === "high" ? 1.3 : 1);

  const targets = [
    { metric: "Peak queue at any single stop", legacy: fmtInt(L.peakQueue), ff: fmtInt(T.peakQueue), change: `${peakRed.toFixed(0)}% lower`, target: "At least 50% lower", ok: peakRed >= 50 },
    { metric: "Average wait", legacy: `${L.avgWaitMin} min`, ff: `${T.avgWaitMin} min`, change: `${waitRed.toFixed(0)}% lower`, target: "At least 40% lower", ok: waitRed >= 40 },
    { metric: "Riders stranded at last-bus cutoff", legacy: `${L.strandedPct}%`, ff: `${T.strandedPct}%`, change: "n/a", target: "Below 2% of riders", ok: T.strandedPct < 2 },
    { metric: "Buses sent by rule, not phone", legacy: `${L.rulePct}%`, ff: `${T.rulePct}%`, change: "n/a", target: "Above 90%", ok: T.rulePct > 90 },
    { metric: "Crowd alerts (threshold breaches)", legacy: `${L.alerts}`, ff: `${T.alerts}`, change: "n/a", target: "Zero", ok: T.alerts === 0 },
  ];
  const forecastChecks = [
    { metric: "Total volume error", value: `${volErr.toFixed(1)}%`, target: "Within 15%", ok: volErr <= 15 },
    { metric: "Peak timing error", value: `${Math.abs(timingErr)} min`, target: "Within 20 min", ok: Math.abs(timingErr) <= 20 },
  ];

  const notes: string[] = [];
  if (!last) notes.push("No actual night is saved yet. The report replays the default night, so forecast and actual match. Save a control-room replay, or enter real counts, to measure forecast error.");
  if (volErr > 15) notes.push(`Riders were ${volErr.toFixed(0)}% off the forecast. Re-fit the outflow base and the mode-share prior from this festival's counts.`);
  if (Math.abs(actualShare - plannedShare) > 2) notes.push(`Implied bus share was ${actualShare.toFixed(1)}% against ${plannedShare.toFixed(1)}% planned. Update the mode-share prior for this festival type.`);
  if (Math.abs(timingErr) > 20) notes.push(`Peak ${timingErr > 0 ? "came later" : "came earlier"} than forecast by ${Math.abs(timingErr)} min. Re-fit the departure curve, including rain effect.`);
  if (spec.guidanceDriftPts > 0) notes.push(`Crowd ignored guidance by ${spec.guidanceDriftPts} points. Review signage and shuttle placement for the next festival.`);
  if (T.reserveUsed >= ff.reserveBuses && ff.reserveBuses > 0) notes.push("The whole reserve was used. Consider a larger reserve or an earlier shuttle.");
  if (notes.length === 0) notes.push("Forecast and plan were within targets for this night. Keep the same model settings and collect counts for the next festival.");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage">Post-event report</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{inputs.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {last
              ? `Actual night: saved replay #${last.id}, ${last.actualScenario} crowd, rain ${last.actualRainChance}%, lateness ${last.actualShiftMin} min.`
              : "No saved actual night yet. Showing the default replay."}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/festivals/${fid}`} className={btnGhost}>
            Planner
          </Link>
          <Link href={`/festivals/${fid}/live`} className={btnGhost}>
            Control room
          </Link>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Riders on buses (actual)" value={fmtInt(ff.actualRiders)} sub={`Planned ${fmtInt(ff.plannedRiders)}`} />
        <Stat
          label="Peak queue, FestFlow"
          value={fmtInt(T.peakQueue)}
          sub={`Last year: ${fmtInt(L.peakQueue)}`}
          tone={T.peakQueue >= inputs.crowdThreshold ? "bad" : "good"}
        />
        <Stat label="Average wait, FestFlow" value={`${T.avgWaitMin} min`} sub={`Last year: ${L.avgWaitMin} min`} />
        <Stat label="Reserve used" value={`${T.reserveUsed} / ${ff.reserveBuses}`} sub="Reserve buses sent by rule" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Old plan vs FestFlow" className="xl:col-span-2" subtitle="Same actual night, two ways of running it.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>Metric</th>
                  <th className={TH}>Last year</th>
                  <th className={TH}>FestFlow</th>
                  <th className={TH}>Change</th>
                  <th className={TH}>Target</th>
                  <th className={TH}>Met</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {targets.map((t) => (
                  <tr key={t.metric}>
                    <td className="py-3 pr-4 font-medium text-ink">{t.metric}</td>
                    <td className="py-3 pr-4 tabular-nums">{t.legacy}</td>
                    <td className="py-3 pr-4 font-display text-base tabular-nums text-terra">{t.ff}</td>
                    <td className="py-3 pr-4">{t.change}</td>
                    <td className="py-3 pr-4 text-ink-soft">{t.target}</td>
                    <td className="py-3">{t.ok ? <Pill tone="good">Yes</Pill> : <Pill tone="bad">No</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Forecast against actual" subtitle="Feeds next year's model.">
          <div className="space-y-4">
            {forecastChecks.map((c) => (
              <div key={c.metric} className="neu-inset flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{c.metric}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{c.target}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl tabular-nums text-ink">{c.value}</span>
                  {c.ok ? <Pill tone="good">Within</Pill> : <Pill tone="bad">Outside</Pill>}
                </div>
              </div>
            ))}
            <Well>
              <p className="text-sm text-ink">
                Peak time: forecast <strong>{clockAt(inputs.lastEventEnd, plannedPeak)}</strong>, actual{" "}
                <strong>{clockAt(inputs.lastEventEnd, ff.actualPeakMinute)}</strong>
              </p>
              <p className="mt-2 text-sm text-ink">
                Bus share: forecast <strong>{plannedShare.toFixed(1)}%</strong>, actual <strong>{actualShare.toFixed(1)}%</strong>
              </p>
            </Well>
          </div>
        </Card>
      </div>

      <Card title="Stop-level results" subtitle="Buses placed, peaks and waits at each boarding point.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Stop</th>
                <th className={TH}>Actual share</th>
                <th className={TH}>Buses: last year → FestFlow</th>
                <th className={TH}>Peak queue: last year → FestFlow</th>
                <th className={TH}>Avg wait: last year → FestFlow</th>
                <th className={TH}>Stranded: FestFlow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {ff.result.stops.map((s, i) => (
                <tr key={s.stopId}>
                  <td className="py-3 pr-4 font-medium">
                    <span className="neu-dot mr-2.5 align-middle" style={{ background: STOP_COLORS[i % STOP_COLORS.length] }} />
                    {s.name}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{(ff.actualShares[i] * 100).toFixed(0)}%</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {lg.buses[i]} → <span className="font-display text-base text-terra">{ff.buses[i]}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {fmtInt(lg.result.stops[i].peakQueue)} → <span className="font-display text-base text-terra">{fmtInt(s.peakQueue)}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {lg.result.stops[i].avgWaitMin} → <span className="font-display text-base text-terra">{s.avgWaitMin}</span> min
                  </td>
                  <td className="py-3 tabular-nums">{fmtInt(s.stranded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Calibration notes" subtitle="What to change in the model and the plan before the next festival.">
        <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-ink marker:text-terra">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-ink-soft">
          Figures come from the night model. Replace them with real counts, ticket logs and CCTV densities once the shadow-mode data is collected.
        </p>
      </Card>
    </div>
  );
}
