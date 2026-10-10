import React, { useEffect, useState } from "react";
import Link from "@/shim/next-link";
import { runNight } from "@/lib/festflow/plan";
import { curveFor, curvePeakMinute, outflowFor } from "@/lib/festflow/forecast";
import { clockAt, fmtInt } from "@/lib/festflow/math";
import { parseScenario } from "@/lib/festflow/validate";
import { Card, Pill, Stat, STOP_COLORS, Well, btnGhost } from "./ui";
import { FestivalInputs, StopInput } from "@/lib/festflow/types";

const TH = "py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function ReportView({ festivalId }: { festivalId: number }) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<{
    inputs: FestivalInputs;
    stops: StopInput[];
    latestRun?: any;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/festivals/${festivalId}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setBundle({
          inputs: data.inputs,
          stops: data.stops,
          latestRun: data.festival?.latestRun,
        });
      } catch (err) {
        console.error("Failed to load report bundle", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [festivalId]);

  if (loading) {
    return (
      <div className="neu-raised p-12 text-center text-ink-soft">
        <p className="font-display text-lg">Generating post-event crowd intelligence report…</p>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="neu-raised p-8 text-center text-brick">
        <p>Festival record not found.</p>
        <Link href="/" className={`${btnGhost} mt-4`}>Return to Overview</Link>
      </div>
    );
  }

  const { inputs, stops, latestRun: last } = bundle;

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
  if (!last) notes.push("No actual night is saved yet. The report replays the baseline simulation, so forecast and actual match. Run the control room live simulator and click 'Save replay as actual night' to measure real-world deviations.");
  if (volErr > 15) notes.push(`Riders were ${volErr.toFixed(0)}% off the forecast. Re-fit the outflow base and mode-share prior from this festival's counts.`);
  if (Math.abs(actualShare - plannedShare) > 2) notes.push(`Implied bus share was ${actualShare.toFixed(1)}% against ${plannedShare.toFixed(1)}% planned. Update the mode-share prior for this festival type.`);
  if (Math.abs(timingErr) > 20) notes.push(`Peak ${timingErr > 0 ? "came later" : "came earlier"} than forecast by ${Math.abs(timingErr)} min. Re-fit the departure curve, including rain effect.`);
  if (spec.guidanceDriftPts > 0) notes.push(`Crowd ignored guidance by ${spec.guidanceDriftPts} points. Review signage and shuttle placement for the next festival.`);
  if (T.reserveUsed >= ff.reserveBuses && ff.reserveBuses > 0) notes.push("The full reserve fleet was committed. Consider sizing a larger emergency reserve buffer or launching staggered shuttles.");
  if (notes.length === 0) notes.push("Forecast, fleet allocation, and queue dispatching were well within targets for this night.");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage">Post-Event Audit Report</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{inputs.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {last
              ? `Actual night: saved replay, ${last.actualScenario} crowd, rain ${last.actualRainChance}%, lateness ${last.actualShiftMin} min.`
              : "Showing calibrated baseline replay. (Run Live Control Room to simulate real night conditions)."}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/festivals/${festivalId}`} className={btnGhost}>
            Open Planner
          </Link>
          <Link href={`/festivals/${festivalId}/live`} className={btnGhost}>
            Control Room & Live Dispatch
          </Link>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Riders transported (actual)" value={fmtInt(ff.actualRiders)} sub={`Planned ${fmtInt(ff.plannedRiders)}`} />
        <Stat
          label="Peak queue, CrowdSense AI"
          value={fmtInt(T.peakQueue)}
          sub={`Legacy / Last year: ${fmtInt(L.peakQueue)}`}
          tone={T.peakQueue >= inputs.crowdThreshold ? "bad" : "good"}
        />
        <Stat label="Average wait, CrowdSense AI" value={`${T.avgWaitMin} min`} sub={`Legacy / Last year: ${L.avgWaitMin} min`} tone="good" />
        <Stat label="Reserve buses mobilized" value={`${T.reserveUsed} / ${ff.reserveBuses}`} sub="Automated rule dispatch" tone="info" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Legacy Manual System vs CrowdSense AI" className="xl:col-span-2" subtitle="Comparing identical crowd conditions under legacy ad-hoc phone dispatch vs AI algorithmic dispatch.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>Metric</th>
                  <th className={TH}>Legacy System</th>
                  <th className={TH}>CrowdSense AI</th>
                  <th className={TH}>Improvement</th>
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
                    <td className="py-3 pr-4 font-semibold text-sage">{t.change}</td>
                    <td className="py-3 pr-4 text-ink-soft">{t.target}</td>
                    <td className="py-3">{t.ok ? <Pill tone="good">Achieved</Pill> : <Pill tone="bad">Review</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Forecast vs Actual Variance" subtitle="Calibration metrics feeding next season's predictive models.">
          <div className="space-y-4">
            {forecastChecks.map((c) => (
              <div key={c.metric} className="neu-inset flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{c.metric}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{c.target}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl tabular-nums text-ink">{c.value}</span>
                  {c.ok ? <Pill tone="good">Within target</Pill> : <Pill tone="bad">Deviation</Pill>}
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

      <Card title="Boarding Stop Queue & Wait Analysis" subtitle="Buses placed, queues, wait times and stranded count per terminal.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Stop Name</th>
                <th className={TH}>Actual Share</th>
                <th className={TH}>Fleet Placed (Old → AI)</th>
                <th className={TH}>Peak Queue (Old → AI)</th>
                <th className={TH}>Avg Wait (Old → AI)</th>
                <th className={TH}>Stranded Count</th>
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
                    {lg.buses[i]} → <span className="font-display text-base text-terra font-bold">{ff.buses[i]}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {fmtInt(lg.result.stops[i].peakQueue)} → <span className="font-display text-base text-terra font-bold">{fmtInt(s.peakQueue)}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {lg.result.stops[i].avgWaitMin} → <span className="font-display text-base text-terra font-bold">{s.avgWaitMin}</span> min
                  </td>
                  <td className="py-3 tabular-nums font-semibold">{fmtInt(s.stranded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="AI Calibration & Operational Recommendations" subtitle="Actionable learnings for upcoming events.">
        <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-ink marker:text-terra">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-ink-soft">
          All calculations are generated by the CrowdSense AI queue simulation engine, factoring in arrival distributions, fleet cycles, driver work limits, and weather influence.
        </p>
      </Card>
    </div>
  );
}
