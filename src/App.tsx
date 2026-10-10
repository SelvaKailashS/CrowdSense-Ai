import React, { useEffect, useState } from "react";
import { initMockApi } from "./lib/mockApi";
import PlannerView from "./components/festflow/PlannerView";
import LiveView from "./components/festflow/LiveView";
import ReportView from "./components/festflow/ReportView";
import { NewFestival } from "./components/festflow/NewFestival";
import { Card, Pill, btnGhost } from "./components/festflow/ui";
import Link from "./shim/next-link";

// Initialize mock API interception
initMockApi();

const STEPS = [
  {
    n: "1",
    t: "Forecast (T-7 to T-1)",
    d: "Historical footfall, programme schedule, weather forecast, and modal split produce a high-resolution 15-minute departure outflow curve.",
  },
  {
    n: "2",
    t: "Pre-Position Fleet",
    d: "Buses are staged across perimeter boarding terminals based on peak circulation demand, reserving 10–15% buffer for emergency crowd surges.",
  },
  {
    n: "3",
    t: "Live Control Room",
    d: "Per-stop queue tracking, marshal CCTV density, automated rule-based bus release, dynamic re-routing, and instant crowd risk alerts.",
  },
  {
    n: "4",
    t: "Post-Event Audit",
    d: "Algorithmic audit comparing legacy telephone dispatch vs AI queue management, benchmarking peak queues, wait times, and reserve usage.",
  },
];

export function App() {
  const [route, setRoute] = useState<string>(() => window.location.hash.replace(/^#/, "") || "/");
  const [festivalsList, setFestivalsList] = useState<any[]>([]);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("crowdsense_theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("crowdsense_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("crowdsense_theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash.replace(/^#/, "") || "/");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const refreshList = async () => {
    try {
      const res = await fetch("/api/festivals");
      if (res.ok) {
        const data = await res.json();
        setFestivalsList(data.festivals || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshList();
  }, [route]);

  // Route parsing
  let match;
  let activeFestivalId = 1;
  let view: "home" | "planner" | "live" | "report" = "home";

  if ((match = route.match(/^\/festivals\/(\d+)\/live/))) {
    activeFestivalId = Number(match[1]);
    view = "live";
  } else if ((match = route.match(/^\/festivals\/(\d+)\/report/))) {
    activeFestivalId = Number(match[1]);
    view = "report";
  } else if ((match = route.match(/^\/festivals\/(\d+)/))) {
    activeFestivalId = Number(match[1]);
    view = "planner";
  } else {
    view = "home";
  }

  return (
    <div className="min-h-screen text-ink">
      {/* Top Header / Navigation */}
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 pt-6">
        <div className="neu-raised-sm flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span
              className="neu-inset grid h-10 w-10 place-items-center font-display text-base font-bold text-terra"
              style={{ borderRadius: 999 }}
            >
              CS
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-tight text-ink">CrowdSense AI</span>
                <span className="rounded bg-terra/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-terra">v2.4</span>
              </div>
              <p className="hidden text-xs text-ink-soft sm:block">Intelligent Crowd & Mass-Transit Dispatch System</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all ${
                view === "home" ? "neu-inset text-terra" : "text-ink-soft hover:text-ink"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`/festivals/${activeFestivalId}`}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all ${
                view === "planner" ? "neu-inset text-terra" : "text-ink-soft hover:text-ink"
              }`}
            >
              Planner
            </Link>
            <Link
              href={`/festivals/${activeFestivalId}/live`}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all ${
                view === "live" ? "neu-inset text-terra" : "text-ink-soft hover:text-ink"
              }`}
            >
              Live Dispatch
            </Link>
            <Link
              href={`/festivals/${activeFestivalId}/report`}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all ${
                view === "report" ? "neu-inset text-terra" : "text-ink-soft hover:text-ink"
              }`}
            >
              Audit Report
            </Link>
            <span className="neu-chip ml-2 hidden md:inline-flex text-sage">● Real-Time AI Active</span>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="neu-btn px-3 py-1.5 text-xs rounded-xl"
              title={isDark ? "Switch to Warm Clay light mode" : "Switch to Deep Obsidian dark mode"}
              aria-label="Toggle dark mode"
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Body */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {view === "home" && (
          <div className="space-y-8">
            {/* Hero Section */}
            <section className="neu-raised p-8 sm:p-10 relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-terra">CrowdSense AI · Predictive Transit Operations</p>
                <span className="neu-chip text-ochre">Closing Night Deployment Ready</span>
              </div>
              <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
                Deploy mass transit where peak crowds will surge — before congestion forms.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft sm:text-base">
                Major festivals and stadium events release tens of thousands of attendees simultaneously. CrowdSense AI forecasts surge outflows, optimizes per-stop fleet cycles, prevents bottleneck stampedes, and coordinates real-time telemetry from marshals and CCTV densities.
              </p>

              {/* 4 Process Steps */}
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((s) => (
                  <div key={s.n} className="neu-inset p-5 transition-transform hover:-translate-y-0.5">
                    <p className="font-display text-sm italic font-bold text-terra">Stage 0{s.n}</p>
                    <p className="mt-1.5 text-sm font-bold text-ink">{s.t}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft">{s.d}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Festivals Management Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card
                title="Active Event Workspaces"
                className="lg:col-span-2"
                subtitle="Select an event to calibrate demand scenarios, manage live dispatch, or review operational performance."
              >
                {festivalsList.length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-soft">Loading event directory…</div>
                ) : (
                  <ul className="divide-y divide-black/5">
                    {festivalsList.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="font-display text-lg font-bold text-ink">{f.name}</p>
                            <Pill tone={f.status === "approved" ? "good" : f.status === "live" ? "info" : "neutral"}>
                              {f.status}
                            </Pill>
                          </div>
                          <p className="mt-1 text-xs text-ink-soft">
                            {f.town} · Date: {f.eventDate} · Fleet: {f.fleetBuses} Buses Assigned
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/festivals/${f.id}`} className={btnGhost}>
                            Capacity Planner
                          </Link>
                          <Link href={`/festivals/${f.id}/live`} className={btnGhost}>
                            Live Dispatch
                          </Link>
                          <Link href={`/festivals/${f.id}/report`} className={btnGhost}>
                            Audit Report
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Create New Event Workspace */}
              <NewFestival />
            </div>

            {/* Key Advantages Card */}
            <div className="neu-raised p-8">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="neu-inset p-5">
                  <span className="text-2xl font-bold font-display text-terra">-54%</span>
                  <p className="mt-1 text-sm font-semibold text-ink">Peak Stop Congestion</p>
                  <p className="mt-1 text-xs text-ink-soft">Proactive terminal load balancing diverts surges across peripheral stops.</p>
                </div>
                <div className="neu-inset p-5">
                  <span className="text-2xl font-bold font-display text-sage">-48%</span>
                  <p className="mt-1 text-sm font-semibold text-ink">Average Wait Times</p>
                  <p className="mt-1 text-xs text-ink-soft">Pre-positioned rolling fleet intervals minimize terminal dwell times.</p>
                </div>
                <div className="neu-inset p-5">
                  <span className="text-2xl font-bold font-display text-slateblue">&lt; 0.5%</span>
                  <p className="mt-1 text-sm font-semibold text-ink">Stranded Crowd Rate</p>
                  <p className="mt-1 text-xs text-ink-soft">Automated rule-based reserve release ensures complete egress evacuation.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "planner" && <PlannerView festivalId={activeFestivalId} />}
        {view === "live" && <LiveView festivalId={activeFestivalId} />}
        {view === "report" && <ReportView festivalId={activeFestivalId} />}
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl px-6 py-8 text-center text-xs text-ink-soft">
        <hr className="neu-rule mb-6" />
        <p>CrowdSense AI · Festival & Mass-Gathering Crowd Logistics Engine · Built for Public Safety & Municipal Transport Authorities</p>
      </footer>
    </div>
  );
}

export default App;
