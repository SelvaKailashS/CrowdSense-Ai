import React, { useEffect, useState } from "react";
import { initMockApi } from "./lib/mockApi";
import PlannerView from "./components/festflow/PlannerView";
import LiveView from "./components/festflow/LiveView";
import ReportView from "./components/festflow/ReportView";
import { NewFestival } from "./components/festflow/NewFestival";
import { Card, Pill, btnGhost, btnTone } from "./components/festflow/ui";
import Link, { getEffectiveRoute, navigateTo } from "./shim/next-link";

// Initialize mock API interception
initMockApi();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; title?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; title?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="neu-raised p-8 text-center max-w-xl mx-auto my-12">
          <p className="text-3xl mb-2">⚠️</p>
          <h2 className="text-xl font-bold font-display text-brick">{this.props.title || "Module Error"}</h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred while loading this view."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="neu-btn px-4 py-2 text-xs font-bold text-terra cursor-pointer"
            >
              ↻ Reload Application
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem("crowdsense_festivals_v1");
                } catch {}
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="neu-btn px-4 py-2 text-xs font-semibold text-ochre cursor-pointer"
            >
              🧹 Reset Data Cache
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.hash = "/";
              }}
              className="neu-btn px-4 py-2 text-xs font-semibold text-ink-soft cursor-pointer"
            >
              Go to Overview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    t: "Control Room & Live Dispatch",
    d: "Per-stop queue tracking, marshal CCTV density, automated rule-based bus release, dynamic re-routing, and instant crowd risk alerts.",
  },
  {
    n: "4",
    t: "Post-Event Audit",
    d: "Algorithmic audit comparing legacy telephone dispatch vs AI queue management, benchmarking peak queues, wait times, and reserve usage.",
  },
];

export function App() {
  const [route, setRoute] = useState<string>(getEffectiveRoute);
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

  // Neon PostgreSQL state
  const [showNeonModal, setShowNeonModal] = useState(false);
  const [neonUrl, setNeonUrl] = useState(() => {
    try {
      return localStorage.getItem("crowdsense_neon_db_url") || "";
    } catch {
      return "";
    }
  });
  const [neonConnected, setNeonConnected] = useState(() => Boolean(neonUrl));
  const [neonTesting, setNeonTesting] = useState(false);
  const [neonStatusMsg, setNeonStatusMsg] = useState<string | null>(null);

  const handleTestNeon = async () => {
    if (!neonUrl.trim()) {
      setNeonStatusMsg("Please enter a valid Neon PostgreSQL connection string");
      return;
    }
    setNeonTesting(true);
    setNeonStatusMsg("Pinging Neon cloud database…");
    const { testNeonConnection, saveNeonUrl } = await import("./lib/neonClient");
    const res = await testNeonConnection(neonUrl);
    setNeonTesting(false);
    if (res.success) {
      saveNeonUrl(neonUrl);
      setNeonConnected(true);
      setNeonStatusMsg(`Connected successfully! Server: ${res.version}`);
    } else {
      setNeonConnected(false);
      setNeonStatusMsg(`Connection failed: ${res.error}`);
    }
  };

  const handleSyncToNeon = async () => {
    if (!neonUrl.trim()) return;
    setNeonTesting(true);
    setNeonStatusMsg("Initializing schema and migrating festival data to Neon…");
    const { pushToNeon, saveNeonUrl } = await import("./lib/neonClient");
    saveNeonUrl(neonUrl);
    const res = await pushToNeon(festivalsList, neonUrl);
    setNeonTesting(false);
    if (res.success) {
      setNeonConnected(true);
      setNeonStatusMsg(`Successfully migrated ${res.insertedCount} festivals to Neon PostgreSQL tables!`);
    } else {
      setNeonStatusMsg(`Sync error: ${res.error}`);
    }
  };

  const handleDisconnectNeon = async () => {
    const { clearNeonUrl } = await import("./lib/neonClient");
    clearNeonUrl();
    setNeonUrl("");
    setNeonConnected(false);
    setNeonStatusMsg("Disconnected from Neon.");
  };

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
    const handleRoute = (override?: string) => {
      const current = typeof override === "string" ? override : getEffectiveRoute();
      setRoute(current);
    };

    const handleCustomNav = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail) handleRoute(ce.detail);
    };

    window.addEventListener("hashchange", () => handleRoute());
    window.addEventListener("popstate", () => handleRoute());
    window.addEventListener("crowdsense-nav", handleCustomNav);

    return () => {
      window.removeEventListener("hashchange", () => handleRoute());
      window.removeEventListener("popstate", () => handleRoute());
      window.removeEventListener("crowdsense-nav", handleCustomNav);
    };
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

  // Robust Route Parsing
  let match;
  let activeFestivalId = 1;
  let view: "home" | "planner" | "live" | "report" = "home";

  if (
    (match = route.match(/^\/festivals\/(\d+)\/live/)) ||
    route === "/live" ||
    route === "/control-room" ||
    route === "/live-dispatch"
  ) {
    if (match) activeFestivalId = Number(match[1]);
    view = "live";
  } else if ((match = route.match(/^\/festivals\/(\d+)\/report/)) || route === "/report") {
    if (match) activeFestivalId = Number(match[1]);
    view = "report";
  } else if ((match = route.match(/^\/festivals\/(\d+)/)) || route === "/planner") {
    if (match) activeFestivalId = Number(match[1]);
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
              className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                view === "live" ? "neu-inset text-terra font-bold ring-1 ring-terra/30" : "text-ink-soft hover:text-ink"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-sage animate-pulse" />
              Control Room · Live Dispatch
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
              onClick={() => setShowNeonModal(true)}
              className="neu-chip bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold text-xs px-2.5 py-1.5 cursor-pointer hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
              title="Connect Neon Serverless PostgreSQL Database"
            >
              <span>🐘</span>
              <span>{neonConnected ? "Neon DB Connected ✓" : "Connect Neon DB"}</span>
            </button>
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

      {/* Neon Database Connection Modal */}
      {showNeonModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="neu-raised max-w-lg w-full p-6 space-y-4 relative">
            <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐘</span>
                <div>
                  <h3 className="font-display font-bold text-base text-ink">Neon Serverless PostgreSQL</h3>
                  <p className="text-[11px] text-ink-soft">Direct cloud database synchronization for festival events & telemetry</p>
                </div>
              </div>
              <button
                onClick={() => setShowNeonModal(false)}
                className="text-ink-soft hover:text-ink font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Neon Database Connection String (Postgres URI)</label>
                <input
                  type="password"
                  placeholder="postgresql://neondb_owner:***@ep-***-pooler.c-***.neon.tech/neondb?sslmode=require"
                  value={neonUrl}
                  onChange={(e) => setNeonUrl(e.target.value)}
                  className="neu-field w-full text-xs font-mono py-2"
                />
                <p className="text-[10px] text-ink-soft mt-1">
                  Copy from your <strong>Neon Console &gt; Connection details &gt; Pooled connection</strong>.
                </p>
              </div>

              {neonStatusMsg && (
                <div
                  className={`p-2.5 rounded text-xs font-medium ${
                    neonConnected ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20" : "bg-brick/10 text-brick border border-brick/20"
                  }`}
                >
                  {neonStatusMsg}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                <button
                  type="button"
                  disabled={neonTesting}
                  onClick={handleTestNeon}
                  className="neu-btn px-3 py-1.5 font-bold text-terra cursor-pointer text-xs"
                >
                  {neonTesting ? "Testing Ping…" : "🔌 Test Connection"}
                </button>
                <button
                  type="button"
                  disabled={neonTesting || !neonUrl}
                  onClick={handleSyncToNeon}
                  className="neu-btn px-3 py-1.5 font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer text-xs"
                >
                  🚀 Initialize Tables & Sync Data
                </button>
                {neonConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectNeon}
                    className="neu-btn px-3 py-1.5 font-semibold text-brick cursor-pointer text-xs ml-auto"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <div
                    key={s.n}
                    onClick={() => {
                      if (s.n === "3") navigateTo(`/festivals/${activeFestivalId}/live`);
                      else if (s.n === "1" || s.n === "2") navigateTo(`/festivals/${activeFestivalId}`);
                      else if (s.n === "4") navigateTo(`/festivals/${activeFestivalId}/report`);
                    }}
                    className="neu-inset p-5 transition-transform hover:-translate-y-0.5 cursor-pointer group"
                    title={`Click to open ${s.t}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-display text-sm italic font-bold text-terra">Stage 0{s.n}</p>
                      <span className="text-xs text-ink-soft group-hover:text-terra">↗</span>
                    </div>
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
                subtitle="Select an event to calibrate demand scenarios, open live control room dispatch, or review operational performance."
              >
                {festivalsList.length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-soft">Loading event directory…</div>
                ) : (
                  <ul className="divide-y divide-black/5 dark:divide-white/5">
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
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/festivals/${f.id}`} className={btnGhost}>
                            Capacity Planner
                          </Link>
                          <Link
                            href={`/festivals/${f.id}/live`}
                            className={`${btnTone("good")} text-xs font-bold shadow-sm`}
                          >
                            ⚡ Control Room & Live Dispatch
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

        {view === "planner" && (
          <ErrorBoundary title="Planner Error">
            <PlannerView festivalId={activeFestivalId} />
          </ErrorBoundary>
        )}
        {view === "live" && (
          <ErrorBoundary title="Control Room Error">
            <LiveView festivalId={activeFestivalId} />
          </ErrorBoundary>
        )}
        {view === "report" && (
          <ErrorBoundary title="Audit Report Error">
            <ReportView festivalId={activeFestivalId} />
          </ErrorBoundary>
        )}
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
