"use client";

import React, { useState, useMemo } from "react";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapRoute,
} from "@/components/ui/map";
import { STOP_COLORS } from "./ui";
import { fmtInt } from "@/lib/festflow/math";
import {
  TAMIL_NADU_TEMPLES,
  searchTemples,
  geocodeTempleOnline,
  type TempleLocation,
} from "@/lib/templeLocations";

export interface TransitStopData {
  id: number;
  name: string;
  queue: number;
  readyBuses: number;
  assignedBuses: number;
  status: "ALERT" | "BEHIND" | "OK";
}

interface TransitMapProps {
  festivalName: string;
  stops: TransitStopData[];
  threshold: number;
  reserveLeft: number;
  busesOnTrip: number;
  onDispatch: (stopIndex: number) => void;
  onDeployReserve: (stopIndex: number) => void;
}

// Error Boundary for WebGL Map
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn("MapGL render fallback caught:", err);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function TransitMap({
  festivalName,
  stops,
  threshold,
  reserveLeft,
  busesOnTrip,
  onDispatch,
  onDeployReserve,
}: TransitMapProps) {
  // Find matching initial temple from festivalName or default to Mallur
  const initialTemple = useMemo(() => {
    const fn = (festivalName || "").toLowerCase();
    const match = TAMIL_NADU_TEMPLES.find(
      (t) => fn.includes(t.name.toLowerCase()) || fn.includes(t.town.toLowerCase())
    );
    return match || TAMIL_NADU_TEMPLES[0];
  }, [festivalName]);

  const [selectedTemple, setSelectedTemple] = useState<TempleLocation>(initialTemple);
  const [templeSearchOpen, setTempleSearchOpen] = useState(false);
  const [templeQuery, setTempleQuery] = useState("");
  const [searchingOnline, setSearchingOnline] = useState(false);

  // Layer toggles
  const [showCrowdAreas, setShowCrowdAreas] = useState(true);
  const [showTrafficAreas, setShowTrafficAreas] = useState(true);
  const [showTelecom, setShowTelecom] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showLiveBuses, setShowLiveBuses] = useState(true);
  const [blankMode, setBlankMode] = useState(false);
  const [priorityCleared, setPriorityCleared] = useState<Record<number, boolean>>({});
  const [simTick, setSimTick] = useState(0);

  // Periodic heartbeat animation for live bus GPS AIS-140 movement
  React.useEffect(() => {
    const timer = setInterval(() => {
      setSimTick((t) => (t + 1) % 1000);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Dynamic coordinates anchored around the selected temple
  const venueCoords = selectedTemple.coords;
  const depotCoords: [number, number] = [venueCoords[0] - 0.0085, venueCoords[1] + 0.0095];

  const stopCoords: [number, number][] = [
    [venueCoords[0] - 0.0020, venueCoords[1] - 0.0030], // Stop 1: Town Main Stand
    [venueCoords[0] + 0.0070, venueCoords[1] + 0.0035], // Stop 2: Temple Car Street
    [venueCoords[0] - 0.0090, venueCoords[1] - 0.0100], // Stop 3: Market / Park & Ride
  ];

  const transitRoutes: [number, number][][] = [
    // Corridor 1: Highway -> Main Bus Stand
    [
      depotCoords,
      [venueCoords[0] - 0.0060, venueCoords[1] + 0.0040],
      [venueCoords[0] - 0.0035, venueCoords[1] - 0.0005],
      stopCoords[0],
    ],
    // Corridor 2: North Arterial -> East Car Street
    [
      depotCoords,
      [venueCoords[0] - 0.0010, venueCoords[1] + 0.0080],
      [venueCoords[0] + 0.0040, venueCoords[1] + 0.0055],
      stopCoords[1],
    ],
    // Corridor 3: South Bypass -> Market Junction
    [
      depotCoords,
      [venueCoords[0] - 0.0075, venueCoords[1] + 0.0010],
      [venueCoords[0] - 0.0090, venueCoords[1] - 0.0055],
      stopCoords[2],
    ],
  ];

  // Interpolate bus positions along corridors for live GPS tracking
  const liveBuses = useMemo(() => {
    const buses: Array<{
      id: string;
      busNo: string;
      corridorIndex: number;
      targetStop: string;
      coords: [number, number];
      status: "In Transit" | "Boarding" | "Departing" | "Depot Staged";
      dwellMinutes: number;
      occupancy: number;
      speedKmh: number;
      progress: number;
    }> = [];

    const busPrefix = selectedTemple.town === "Mallur" || selectedTemple.town === "Salem" ? "TN-30-N" : "TN-58-N";

    // Generate dynamic live buses moving along the active corridors
    transitRoutes.forEach((route, corridorIdx) => {
      const stop = stops[corridorIdx] || { name: `Terminal ${corridorIdx + 1}`, queue: 50 };
      const stopName = stop.name;
      const numActive = Math.max(2, Math.min(6, (stop as any).assignedBuses ? Math.round((stop as any).assignedBuses / 3) : 3));

      for (let b = 0; b < numActive; b++) {
        // Compute cyclic movement along polyline
        const baseOffset = (b * (1 / numActive) + (simTick * 0.035)) % 1;
        const totalSegments = route.length - 1;
        const floatSeg = baseOffset * totalSegments;
        const segIdx = Math.min(totalSegments - 1, Math.floor(floatSeg));
        const segFraction = floatSeg - segIdx;

        const p1 = route[segIdx];
        const p2 = route[segIdx + 1] || route[segIdx];

        const lon = p1[0] + (p2[0] - p1[0]) * segFraction;
        const lat = p1[1] + (p2[1] - p1[1]) * segFraction;

        const isNearStop = baseOffset > 0.82;
        const isNearDepot = baseOffset < 0.15;
        const dwell = isNearStop ? Math.round(4 + (stop.queue / 40)) : 0;
        const occupancy = isNearStop ? Math.min(70, Math.round(stop.queue > 0 ? 50 + (b * 5) : 30)) : Math.round(35 + (b * 8));
        const speed = isNearStop ? 0 : Math.round(28 + Math.sin(simTick + b) * 8);

        buses.push({
          id: `bus-${corridorIdx}-${b}`,
          busNo: `${busPrefix}-${1040 + corridorIdx * 12 + b}`,
          corridorIndex: corridorIdx,
          targetStop: stopName,
          coords: [lon, lat],
          status: isNearStop ? (dwell > 7 ? "Boarding" : "Departing") : isNearDepot ? "Depot Staged" : "In Transit",
          dwellMinutes: dwell,
          occupancy,
          speedKmh: speed,
          progress: Math.round(baseOffset * 100),
        });
      }
    });

    return buses;
  }, [selectedTemple, transitRoutes, stops, simTick]);

  const trafficNodes = [
    {
      id: "traffic-1",
      name: `${selectedTemple.town} Highway Arterial Junction`,
      coords: [venueCoords[0] - 0.0055, venueCoords[1] + 0.0020] as [number, number],
      corridorIndex: 0,
    },
    {
      id: "traffic-2",
      name: `East Car Street & ${selectedTemple.name.split(" ")[0]} Arch`,
      coords: [venueCoords[0] + 0.0025, venueCoords[1] + 0.0045] as [number, number],
      corridorIndex: 1,
    },
    {
      id: "traffic-3",
      name: "Bypass Ring Road Crossing",
      coords: [venueCoords[0] - 0.0085, venueCoords[1] - 0.0070] as [number, number],
      corridorIndex: 2,
    },
  ];

  const telecomTowers = [
    {
      id: "telecom-1",
      name: `${selectedTemple.name.split(" ")[0]} Macro Cell (Sanctum Sector)`,
      coords: [venueCoords[0] + 0.0015, venueCoords[1] + 0.0018] as [number, number],
      devicesConnected: 14280,
      handoverTrend: "+28% inflow / 15 min",
      crowdEstimate: 16850,
    },
    {
      id: "telecom-2",
      name: `${selectedTemple.town} Central eNodeB (Bus Stand Sector)`,
      coords: [venueCoords[0] - 0.0030, venueCoords[1] - 0.0042] as [number, number],
      devicesConnected: 5640,
      handoverTrend: "+42% rapid queuing",
      crowdEstimate: 6650,
    },
    {
      id: "telecom-3",
      name: "Regional Highway Macro Tower (Depot & Bypass)",
      coords: [depotCoords[0] - 0.0010, depotCoords[1] - 0.0023] as [number, number],
      devicesConnected: 3120,
      handoverTrend: "+12% steady transit",
      crowdEstimate: 3680,
    },
  ];

  // Temple suggestions based on search query
  const templeSuggestions = useMemo(() => {
    return searchTemples(templeQuery).slice(0, 7);
  }, [templeQuery]);

  const handleSelectTemple = (temple: TempleLocation) => {
    setSelectedTemple(temple);
    setTempleSearchOpen(false);
    setTempleQuery("");
  };

  const handleOnlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templeQuery.trim()) return;

    const localMatch = searchTemples(templeQuery)[0];
    if (localMatch) {
      handleSelectTemple(localMatch);
      return;
    }

    setSearchingOnline(true);
    const online = await geocodeTempleOnline(templeQuery);
    setSearchingOnline(false);
    if (online) {
      handleSelectTemple(online);
    }
  };

  // Compute total waiting across stops
  const totalWaiting = stops.reduce((acc, s) => acc + (s.queue || 0), 0);

  // Dynamic traffic conditions calculated from queue severity
  const getTrafficStatus = (index: number) => {
    if (priorityCleared[index]) {
      return {
        level: "FLUID",
        color: "#22c55e",
        speed: "42 km/h",
        delay: "+0 min (Bus Priority Active)",
        desc: "Signal priority granted to transit fleet",
      };
    }
    const stopQueue = stops[index]?.queue ?? 0;
    if (stopQueue >= threshold) {
      return {
        level: "GRIDLOCK",
        color: "#ef4444",
        speed: "8 km/h",
        delay: "+14 min Transit Delay",
        desc: "Severe crowd egress bottleneck along corridor",
      };
    }
    if (stopQueue > threshold * 0.5) {
      return {
        level: "CONGESTED",
        color: "#f59e0b",
        speed: "21 km/h",
        delay: "+5 min Transit Delay",
        desc: "Heavy bus circulation & pedestrian spillover",
      };
    }
    return {
      level: "NORMAL",
      color: "#10b981",
      speed: "36 km/h",
      delay: "+1 min Transit Delay",
      desc: "Free-flowing transit corridor",
    };
  };

  const handleTogglePriority = (corridorIdx: number) => {
    setPriorityCleared((prev) => ({
      ...prev,
      [corridorIdx]: !prev[corridorIdx],
    }));
  };

  // Radar SVG Fallback in case of WebGL failure
  const renderFallbackRadar = () => (
    <div className="h-[460px] w-full bg-sand/30 dark:bg-stone-900/50 p-6 flex flex-col justify-between rounded-xl relative overflow-hidden">
      <div className="flex items-center justify-between z-10">
        <span className="text-xs font-bold text-ink flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sage animate-ping" />
          Real-Time Operations Radar ({selectedTemple.name}, {selectedTemple.town})
        </span>
        <span className="text-xs font-mono text-terra font-semibold">
          Active Fleet: {busesOnTrip} | Reserves: {reserveLeft}
        </span>
      </div>

      <svg className="w-full h-64 my-auto" viewBox="0 0 600 240">
        <circle cx="280" cy="110" r="30" className="fill-terra/20 stroke-terra stroke-2" />
        <circle cx="280" cy="110" r="12" className="fill-terra" />
        <text x="280" y="155" textAnchor="middle" className="text-[11px] fill-current font-bold">
          {selectedTemple.name}
        </text>

        <rect x="420" y="40" width="36" height="36" rx="6" className="fill-stone-800 dark:fill-stone-200" />
        <text x="438" y="90" textAnchor="middle" className="text-[10px] fill-current font-semibold">
          TNSTC Depot ({reserveLeft})
        </text>

        {stops.map((st, i) => {
          const x = 120 + i * 160;
          const y = 190;
          const traffic = getTrafficStatus(i);
          const isAlert = st.queue >= threshold;

          return (
            <g key={st.id || i}>
              <line
                x1="438"
                y1="58"
                x2={x}
                y2={y}
                stroke={traffic.color}
                strokeWidth={isAlert ? "4" : "2"}
                strokeDasharray={traffic.level === "GRIDLOCK" ? "6,4" : undefined}
                opacity="0.8"
              />
              <circle
                cx={x}
                cy={y}
                r={isAlert ? "24" : "18"}
                className={isAlert ? "fill-brick/30 stroke-brick stroke-2 animate-pulse" : "fill-sage/20 stroke-sage stroke-2"}
              />
              <circle cx={x} cy={y} r="8" fill={STOP_COLORS[i % STOP_COLORS.length]} />
              <text x={x} y={y + 30} textAnchor="middle" className="text-[11px] font-bold fill-current">
                {st.name} ({fmtInt(st.queue)})
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-2 justify-between z-10 text-xs">
        {stops.map((st, i) => (
          <button
            key={st.id || i}
            type="button"
            onClick={() => onDispatch(i)}
            className="neu-btn px-3 py-1.5 text-xs text-terra font-bold cursor-pointer"
          >
            ⚡ Dispatch to {st.name} ({st.queue} waiting)
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="neu-raised overflow-hidden rounded-2xl relative border border-black/5 dark:border-white/5 space-y-0">
      {/* Real-Time Operational Toolbar */}
      <div className="bg-sand-light/80 dark:bg-stone-900/80 backdrop-blur-md p-3.5 border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Temple Search / Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTempleSearchOpen((o) => !o)}
              className="neu-chip bg-amber-500/10 text-amber-900 dark:text-amber-300 font-bold text-xs px-2.5 py-1 cursor-pointer flex items-center gap-1.5 hover:bg-amber-500/20 shadow-xs border border-amber-500/20"
              title="Search and switch temple location in Tamil Nadu"
            >
              <span>🛕</span>
              <span className="font-display">{selectedTemple.name}</span>
              <span className="text-[10px] text-ink-soft">▼ Search</span>
            </button>

            {/* Temple Search Popover Modal */}
            {templeSearchOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-80 neu-raised p-3 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-black/5 dark:border-white/5">
                  <span className="text-xs font-bold text-ink flex items-center gap-1">
                    <span>🛕</span> Pinpoint Temple on Map
                  </span>
                  <button
                    type="button"
                    onClick={() => setTempleSearchOpen(false)}
                    className="text-xs text-ink-soft hover:text-ink cursor-pointer px-1"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleOnlineSearch} className="flex gap-1.5">
                  <input
                    type="text"
                    value={templeQuery}
                    onChange={(e) => setTempleQuery(e.target.value)}
                    placeholder="Search temple (e.g. Meenakshi, Palani)..."
                    className="neu-field text-xs py-1 px-2 flex-1"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={searchingOnline}
                    className="neu-btn px-2.5 text-xs font-bold text-terra cursor-pointer"
                  >
                    {searchingOnline ? "…" : "Find"}
                  </button>
                </form>

                <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                  <p className="text-[10px] uppercase font-bold text-ink-soft px-1">Tamil Nadu Temple Registry:</p>
                  {templeSuggestions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemple(t)}
                      className={`w-full text-left p-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        selectedTemple.id === t.id
                          ? "bg-terra/10 font-bold text-terra"
                          : "hover:bg-black/5 dark:hover:bg-white/5 text-ink"
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-[10px] text-ink-soft">{t.town}, {t.district} District</p>
                      </div>
                      <span className="text-[10px] text-terra">Show ›</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="neu-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-xs px-2.5 py-1">
            📍 {selectedTemple.town}, Tamil Nadu
          </span>

          {/* Crowd Areas Filter Toggle */}
          <button
            type="button"
            onClick={() => setShowCrowdAreas((v) => !v)}
            className={`neu-chip cursor-pointer text-xs font-semibold px-2.5 py-1 transition-all ${
              showCrowdAreas
                ? "bg-brick text-white ring-1 ring-brick/50 shadow-xs"
                : "bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink"
            }`}
          >
            👥 Crowd Surge Areas {showCrowdAreas ? "✓" : ""}
          </button>

          {/* Traffic Areas Filter Toggle */}
          <button
            type="button"
            onClick={() => setShowTrafficAreas((v) => !v)}
            className={`neu-chip cursor-pointer text-xs font-semibold px-2.5 py-1 transition-all ${
              showTrafficAreas
                ? "bg-amber-600 text-white ring-1 ring-amber-600/50 shadow-xs"
                : "bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink"
            }`}
          >
            🚦 Traffic Congestion {showTrafficAreas ? "✓" : ""}
          </button>

          {/* Aggregated Mobile Network Devices Toggle */}
          <button
            type="button"
            onClick={() => setShowTelecom((v) => !v)}
            className={`neu-chip cursor-pointer text-xs font-semibold px-2.5 py-1 transition-all ${
              showTelecom
                ? "bg-purple-700 text-white ring-1 ring-purple-700/50 shadow-xs"
                : "bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink"
            }`}
            title="Aggregated mobile network signaling & device density (No individual tracking)"
          >
            📶 Mobile Devices (Telecom) {showTelecom ? "✓" : ""}
          </button>

          {/* Transit Routes Filter Toggle */}
          <button
            type="button"
            onClick={() => setShowRoutes((v) => !v)}
            className={`neu-chip cursor-pointer text-xs font-semibold px-2.5 py-1 transition-all ${
              showRoutes
                ? "bg-terra text-white shadow-xs"
                : "bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink"
            }`}
          >
            🛣️ Corridors {showRoutes ? "✓" : ""}
          </button>

          {/* Live Bus AIS-140 GPS Tracking Toggle */}
          <button
            type="button"
            onClick={() => setShowLiveBuses((v) => !v)}
            className={`neu-chip cursor-pointer text-xs font-semibold px-2.5 py-1 transition-all ${
              showLiveBuses
                ? "bg-emerald-600 text-white ring-1 ring-emerald-600/50 shadow-xs"
                : "bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink"
            }`}
            title="Real-time live location of active buses tracked via AIS-140 GPS telemetry"
          >
            🚍 Live Buses ({liveBuses.length}) {showLiveBuses ? "✓" : ""}
          </button>

          {/* Style Mode Toggle */}
          <button
            type="button"
            onClick={() => setBlankMode((b) => !b)}
            className="neu-chip bg-white/80 dark:bg-stone-800/80 text-ink-soft hover:text-ink cursor-pointer text-xs px-2.5 py-1"
          >
            {blankMode ? "Street Map" : "High Contrast"}
          </button>
        </div>

        {/* Real-time Status Counters */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-ink-soft text-[11px]">Crowd Waiting:</span>
            <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
              totalWaiting >= threshold * 2 ? "bg-brick text-white" : "bg-terra/10 text-terra"
            }`}>
              {fmtInt(totalWaiting)} pax
            </span>
          </div>
          <div className="h-4 w-px bg-black/10 dark:bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-ink-soft text-[11px]">En-Route:</span>
            <span className="font-bold text-ink">{busesOnTrip} buses</span>
          </div>
          <div className="h-4 w-px bg-black/10 dark:bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-ink-soft text-[11px]">Depot Reserves:</span>
            <span className="font-bold text-sage">{reserveLeft} ready</span>
          </div>
        </div>
      </div>

      {/* Main Map Container */}
      <div className="h-[480px] w-full relative">
        <MapErrorBoundary fallback={renderFallbackRadar()}>
          <Map
            center={venueCoords}
            zoom={14.0}
            blank={blankMode}
            className="h-full w-full"
          >
            <MapControls position="top-right" showCompass showFullscreen />

            {/* Dynamic Real-Time Traffic Corridors */}
            {showRoutes &&
              transitRoutes.map((coords, rIdx) => {
                const traffic = getTrafficStatus(rIdx);
                const routeColor = showTrafficAreas ? traffic.color : STOP_COLORS[rIdx % STOP_COLORS.length];
                const routeWidth = traffic.level === "GRIDLOCK" ? 5 : 3.5;

                return (
                  <MapRoute
                    key={`route-${rIdx}-${selectedTemple.id}`}
                    coordinates={coords}
                    color={routeColor}
                    width={routeWidth}
                    opacity={0.88}
                  />
                );
              })}

            {/* Real-Time Traffic Chokepoint & Bottleneck Markers */}
            {showTrafficAreas &&
              trafficNodes.map((node) => {
                const traffic = getTrafficStatus(node.corridorIndex);
                const isChoke = traffic.level === "GRIDLOCK";

                return (
                  <MapMarker
                    key={`${node.id}-${selectedTemple.id}`}
                    longitude={node.coords[0]}
                    latitude={node.coords[1]}
                  >
                    <MarkerContent>
                      <div className="flex flex-col items-center cursor-pointer group">
                        <div className="relative">
                          {isChoke && (
                            <span className="absolute -inset-1 rounded-full bg-red-600 animate-ping opacity-75" />
                          )}
                          <div
                            className="h-7 w-7 rounded-full text-white flex items-center justify-center shadow-md ring-2 ring-white text-[11px] font-bold"
                            style={{ background: traffic.color }}
                          >
                            🚦
                          </div>
                        </div>
                        <span className="mt-0.5 bg-white/95 dark:bg-stone-900/95 px-1.5 py-0.5 rounded text-[9px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                          {traffic.speed} · {traffic.level}
                        </span>
                      </div>
                    </MarkerContent>
                    <MarkerPopup>
                      <div className="p-2.5 text-xs min-w-[210px]">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-xs text-ink">{node.name}</p>
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                            style={{ background: traffic.color }}
                          >
                            {traffic.level}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-soft mt-1">{traffic.desc}</p>
                        <div className="mt-2 bg-black/5 dark:bg-white/5 p-2 rounded text-[11px] space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span>Corridor Speed:</span>
                            <span className="font-bold text-ink">{traffic.speed}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Fleet Headway Delay:</span>
                            <span className="font-bold text-brick">{traffic.delay}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTogglePriority(node.corridorIndex)}
                          className="mt-2.5 w-full py-1.5 px-2 rounded bg-terra text-white font-bold text-[10px] hover:brightness-110 shadow cursor-pointer transition-all"
                        >
                          {priorityCleared[node.corridorIndex]
                            ? "↺ Revert Normal Traffic Flow"
                            : "⚡ Override: Activate Bus Signal Priority"}
                        </button>
                      </div>
                    </MarkerPopup>
                  </MapMarker>
                );
              })}

            {/* Aggregated Telecom Cellular Signaling & Device Density Towers */}
            {showTelecom &&
              telecomTowers.map((tower) => (
                <MapMarker
                  key={`${tower.id}-${selectedTemple.id}`}
                  longitude={tower.coords[0]}
                  latitude={tower.coords[1]}
                >
                  <MarkerContent>
                    <div className="flex flex-col items-center cursor-pointer group">
                      <div className="relative">
                        <span className="absolute -inset-2 rounded-full bg-purple-500/40 animate-pulse" />
                        <div className="h-7 w-7 rounded-full bg-purple-700 text-white flex items-center justify-center shadow-md ring-2 ring-white text-[11px] font-bold">
                          📡
                        </div>
                      </div>
                      <span className="mt-0.5 bg-white/95 dark:bg-stone-900/95 px-1.5 py-0.5 rounded text-[9px] font-bold text-purple-700 dark:text-purple-300 shadow border border-purple-500/20 whitespace-nowrap">
                        {fmtInt(tower.devicesConnected)} devices
                      </span>
                    </div>
                  </MarkerContent>
                  <MarkerPopup>
                    <div className="p-2.5 text-xs min-w-[230px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-xs text-ink">{tower.name}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                          Telecom Telemetry
                        </span>
                      </div>
                      <p className="text-[10px] text-ink-soft mt-1">
                        Aggregated mobile signaling density (Zero individual tracking)
                      </p>
                      <div className="mt-2.5 bg-purple-50/60 dark:bg-purple-950/20 p-2 rounded text-[11px] space-y-1 font-mono border border-purple-200/40 dark:border-purple-800/40">
                        <div className="flex justify-between">
                          <span className="text-ink-soft">Active Devices:</span>
                          <span className="font-bold text-ink">{fmtInt(tower.devicesConnected)} SIMs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-soft">Crowd Footfall Est:</span>
                          <span className="font-bold text-purple-600">{fmtInt(tower.crowdEstimate)} pax</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-soft">Tower Handover:</span>
                          <span className="font-bold text-emerald-600">{tower.handoverTrend}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-ink-soft flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>Feeds live predictive curve & queue build detection</span>
                      </div>
                    </div>
                  </MarkerPopup>
                </MapMarker>
              ))}

            {/* Festival Venue / Searched Temple Center Pin */}
            <MapMarker longitude={venueCoords[0]} latitude={venueCoords[1]}>
              <MarkerContent>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    {showCrowdAreas && (
                      <span className="absolute -inset-2.5 rounded-full bg-terra animate-ping opacity-35" />
                    )}
                    <div className="h-10 w-10 rounded-full bg-terra text-white flex items-center justify-center shadow-xl ring-4 ring-terra/30 font-bold text-base">
                      🛕
                    </div>
                  </div>
                  <span className="mt-1 bg-white/95 dark:bg-stone-900/95 px-2 py-0.5 rounded text-[10px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                    {selectedTemple.name}
                  </span>
                </div>
              </MarkerContent>
              <MarkerPopup>
                <div className="p-2.5 text-xs max-w-[230px]">
                  <p className="font-bold text-ink text-sm">🛕 {selectedTemple.name}</p>
                  <p className="text-ink-soft mt-1">{selectedTemple.description}</p>
                  <div className="mt-2 text-[11px] bg-sand/60 dark:bg-stone-800/60 p-2 rounded space-y-1">
                    <p className="text-terra font-semibold">📍 Location: {selectedTemple.town}, {selectedTemple.district} District</p>
                    <p className="text-ink-soft font-mono text-[10px]">[{venueCoords[0].toFixed(4)}°E, {venueCoords[1].toFixed(4)}°N]</p>
                  </div>
                </div>
              </MarkerPopup>
            </MapMarker>

            {/* Central Reserve Fleet Depot Marker */}
            <MapMarker longitude={depotCoords[0]} latitude={depotCoords[1]}>
              <MarkerContent>
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-ink text-sand flex items-center justify-center shadow-lg ring-3 ring-ink/20 font-bold text-xs">
                    🏢
                  </div>
                  <span className="mt-1 bg-white/95 dark:bg-stone-900/95 px-1.5 py-0.5 rounded text-[10px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                    TNSTC Depot ({reserveLeft})
                  </span>
                </div>
              </MarkerContent>
              <MarkerPopup>
                <div className="p-2.5 text-xs min-w-[200px]">
                  <p className="font-bold text-ink text-sm">🏢 TNSTC Fleet Bus Depot</p>
                  <p className="text-ink-soft mt-1">
                    Regional fleet holding station for {selectedTemple.town} & emergency operator staging.
                  </p>
                  <div className="mt-2 font-mono text-sage font-bold text-sm bg-sage/10 p-1.5 rounded">
                    {reserveLeft} Reserve Buses Ready for Deployment
                  </div>
                </div>
              </MarkerPopup>
            </MapMarker>

            {/* Boarding Terminals & Live Crowd Surge Areas */}
            {stops.map((st, i) => {
              const coords = stopCoords[i % stopCoords.length];
              const color = STOP_COLORS[i % STOP_COLORS.length];
              const isAlert = st.queue >= threshold;
              const isBehind = st.queue > 70 / 2;
              const densityPsm = (st.queue / 150).toFixed(1);

              return (
                <MapMarker key={`${st.id || i}-${selectedTemple.id}`} longitude={coords[0]} latitude={coords[1]}>
                  <MarkerContent>
                    <div className="flex flex-col items-center cursor-pointer group">
                      <div className="relative">
                        {showCrowdAreas && isAlert && (
                          <>
                            <span className="absolute -inset-4 rounded-full bg-brick animate-ping opacity-40" />
                            <span className="absolute -inset-2 rounded-full bg-brick/50 animate-pulse" />
                          </>
                        )}
                        {showCrowdAreas && !isAlert && isBehind && (
                          <span className="absolute -inset-2 rounded-full bg-amber-500/40 animate-pulse" />
                        )}

                        <div
                          className="h-9 w-9 rounded-full text-white flex items-center justify-center shadow-xl ring-2 ring-white text-xs font-bold transition-transform group-hover:scale-110"
                          style={{ background: isAlert ? "#a0392c" : color }}
                        >
                          🚍
                        </div>
                      </div>

                      <div className="mt-1 bg-white/95 dark:bg-stone-900/95 px-2 py-0.5 rounded-md shadow text-[10px] font-bold text-ink flex items-center gap-1.5 border border-black/5 dark:border-white/5">
                        <span>{st.name}</span>
                        <span
                          className={`font-mono px-1 rounded text-[9px] ${
                            isAlert
                              ? "bg-brick text-white"
                              : isBehind
                              ? "bg-amber-500 text-white"
                              : "bg-sage text-white"
                          }`}
                        >
                          {fmtInt(st.queue)} pax
                        </span>
                      </div>
                    </div>
                  </MarkerContent>
                  <MarkerPopup>
                    <div className="p-3 text-xs min-w-[220px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm text-ink">{st.name}</p>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white ${
                            isAlert ? "bg-brick" : isBehind ? "bg-amber-500" : "bg-sage"
                          }`}
                        >
                          {st.status}
                        </span>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-ink-soft bg-black/5 dark:bg-white/5 p-2 rounded">
                        <div>
                          <span className="text-[10px] uppercase block">Crowd In Queue</span>
                          <p className="font-display text-base font-bold text-ink">
                            {fmtInt(st.queue)} pax
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase block">Crowd Density</span>
                          <p className={`font-mono text-sm font-bold ${isAlert ? "text-brick" : "text-ink"}`}>
                            {densityPsm} pax/m²
                          </p>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-black/5 dark:border-white/5 flex justify-between">
                          <span className="text-[10px]">Staged Fleet:</span>
                          <span className="font-bold text-sage font-mono">
                            {st.readyBuses} ready / {st.assignedBuses} total
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 pt-2 border-t border-black/10 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() => onDispatch(i)}
                          className="w-full py-1.5 px-2 rounded bg-sage text-white font-bold text-[11px] hover:brightness-110 shadow cursor-pointer transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>⚡</span> Dispatch Bus Now ({Math.min(70, st.queue)} pax)
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeployReserve(i)}
                          className="w-full py-1 px-2 rounded neu-btn text-ochre font-semibold text-[10px] hover:text-ink cursor-pointer transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>🚨</span> Deploy Emergency Reserve Bus
                        </button>
                      </div>
                    </div>
                  </MarkerPopup>
                </MapMarker>
              );
            })}

            {/* Live Moving Buses with AIS-140 GPS Telemetry */}
            {showLiveBuses &&
              liveBuses.map((bus) => {
                const isChoked = bus.status === "Boarding" && bus.dwellMinutes >= 8;
                return (
                  <MapMarker
                    key={bus.id}
                    longitude={bus.coords[0]}
                    latitude={bus.coords[1]}
                  >
                    <MarkerContent>
                      <div className="flex flex-col items-center cursor-pointer group">
                        <div className="relative">
                          {isChoked && (
                            <span className="absolute -inset-1.5 rounded-full bg-brick animate-ping opacity-75" />
                          )}
                          <div
                            className={`h-7 w-7 rounded-full text-white flex items-center justify-center shadow-lg ring-2 ring-white text-[11px] font-bold transition-transform group-hover:scale-125 ${
                              isChoked
                                ? "bg-brick"
                                : bus.status === "Boarding"
                                ? "bg-amber-600"
                                : bus.status === "Depot Staged"
                                ? "bg-stone-700"
                                : "bg-emerald-600"
                            }`}
                          >
                            🚌
                          </div>
                        </div>
                        <span className="mt-0.5 bg-stone-900/90 text-white font-mono text-[8px] font-bold px-1 rounded shadow">
                          {bus.busNo.slice(-4)}
                        </span>
                      </div>
                    </MarkerContent>
                    <MarkerPopup>
                      <div className="p-3 text-xs min-w-[210px] space-y-2">
                        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1.5">
                          <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            {bus.busNo}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white ${
                              isChoked
                                ? "bg-brick"
                                : bus.status === "Boarding"
                                ? "bg-amber-600"
                                : "bg-emerald-600"
                            }`}
                          >
                            {bus.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-black/5 dark:bg-white/5 p-2 rounded font-mono">
                          <div>
                            <span className="text-[9px] text-ink-soft block uppercase">GPS Speed</span>
                            <span className="font-bold text-ink">{bus.speedKmh} km/h</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-ink-soft block uppercase">Occupancy</span>
                            <span className="font-bold text-ink">{bus.occupancy}/70 pax</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-ink-soft block uppercase">Dwell Time</span>
                            <span className={`font-bold ${isChoked ? "text-brick" : "text-ink"}`}>
                              {bus.dwellMinutes} min
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-ink-soft block uppercase">Destination</span>
                            <span className="font-bold text-terra truncate block">{bus.targetStop}</span>
                          </div>
                        </div>

                        {isChoked ? (
                          <div className="bg-brick/10 border border-brick/30 text-brick p-1.5 rounded text-[10px] font-semibold">
                            ⚠️ Dwell Anomaly: Loading time exceeded 8m. Severe queue pressure detected!
                          </div>
                        ) : (
                          <div className="text-[10px] text-ink-soft">
                            AIS-140 GPS Telemetry active · 1500ms update rate
                          </div>
                        )}
                      </div>
                    </MarkerPopup>
                  </MapMarker>
                );
              })}
          </Map>
        </MapErrorBoundary>
      </div>
    </div>
  );
}
