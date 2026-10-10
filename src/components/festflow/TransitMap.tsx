"use client";

import React, { useState } from "react";
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

// Geographic reference coordinates
const VENUE_COORDS: [number, number] = [-0.1585, 51.5072]; // Main Stage Arena
const DEPOT_COORDS: [number, number] = [-0.1402, 51.5085]; // Central Reserve Fleet Depot

const STOP_COORDINATES: [number, number][] = [
  [-0.1532, 51.5028], // Terminal 1: Main Gate Terminal (South)
  [-0.1635, 51.5135], // Terminal 2: North Plaza Shuttle (North)
  [-0.1738, 51.4988], // Terminal 3: South Park & Ride (Orbital)
];

// Transit road arteries connecting Depot to Terminals
const TRANSIT_ROUTES: [number, number][][] = [
  // Corridor 1: West Park Avenue -> Terminal 1
  [
    DEPOT_COORDS,
    [-0.1465, 51.5065],
    [-0.1505, 51.5042],
    STOP_COORDINATES[0],
  ],
  // Corridor 2: North Radial Expressway -> Terminal 2
  [
    DEPOT_COORDS,
    [-0.1485, 51.5115],
    [-0.1565, 51.5130],
    STOP_COORDINATES[1],
  ],
  // Corridor 3: South Orbital Highway -> Terminal 3
  [
    DEPOT_COORDS,
    [-0.1480, 51.5020],
    [-0.1610, 51.4995],
    STOP_COORDINATES[2],
  ],
];

// Traffic choke points / bottlenecks along key corridors
const TRAFFIC_BOTTLENECK_NODES = [
  {
    id: "traffic-1",
    name: "Park Avenue & Gate Chokepoint",
    coords: [-0.1485, 51.5055] as [number, number],
    corridorIndex: 0,
  },
  {
    id: "traffic-2",
    name: "North Ring Road Interchange",
    coords: [-0.1525, 51.5122] as [number, number],
    corridorIndex: 1,
  },
  {
    id: "traffic-3",
    name: "Orbital Overpass Junction",
    coords: [-0.1545, 51.5008] as [number, number],
    corridorIndex: 2,
  },
];

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
  // Layer toggles
  const [showCrowdAreas, setShowCrowdAreas] = useState(true);
  const [showTrafficAreas, setShowTrafficAreas] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [blankMode, setBlankMode] = useState(false);
  const [priorityCleared, setPriorityCleared] = useState<Record<number, boolean>>({});

  // Compute total waiting across stops
  const totalWaiting = stops.reduce((acc, s) => acc + (s.queue || 0), 0);

  // Dynamic traffic conditions calculated from queue severity
  const getTrafficStatus = (index: number) => {
    if (priorityCleared[index]) {
      return {
        level: "FLUID",
        color: "#22c55e", // Emerald
        speed: "42 km/h",
        delay: "+0 min (Bus Priority Active)",
        desc: "Signal priority granted to transit fleet",
      };
    }
    const stopQueue = stops[index]?.queue ?? 0;
    if (stopQueue >= threshold) {
      return {
        level: "GRIDLOCK",
        color: "#ef4444", // Red
        speed: "8 km/h",
        delay: "+14 min Transit Delay",
        desc: "Severe crowd egress bottleneck along corridor",
      };
    }
    if (stopQueue > threshold * 0.5) {
      return {
        level: "CONGESTED",
        color: "#f59e0b", // Amber
        speed: "21 km/h",
        delay: "+5 min Transit Delay",
        desc: "Heavy bus circulation & pedestrian spillover",
      };
    }
    return {
      level: "NORMAL",
      color: "#10b981", // Green
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
          Real-Time Operations Radar (Safe Telemetry Mode)
        </span>
        <span className="text-xs font-mono text-terra font-semibold">
          Active Fleet: {busesOnTrip} | Reserves: {reserveLeft}
        </span>
      </div>

      {/* Schematic SVG Map */}
      <svg className="w-full h-64 my-auto" viewBox="0 0 600 240">
        {/* Arena Center */}
        <circle cx="280" cy="110" r="30" className="fill-terra/20 stroke-terra stroke-2" />
        <circle cx="280" cy="110" r="12" className="fill-terra" />
        <text x="280" y="155" textAnchor="middle" className="text-[11px] fill-current font-bold">
          {festivalName || "Arena Arena"}
        </text>

        {/* Central Bus Depot */}
        <rect x="420" y="40" width="36" height="36" rx="6" className="fill-stone-800 dark:fill-stone-200" />
        <text x="438" y="90" textAnchor="middle" className="text-[10px] fill-current font-semibold">
          Bus Depot ({reserveLeft})
        </text>

        {/* Transit Arteries & Terminals */}
        {stops.map((st, i) => {
          const x = 120 + i * 160;
          const y = 190;
          const traffic = getTrafficStatus(i);
          const isAlert = st.queue >= threshold;

          return (
            <g key={st.id || i}>
              {/* Corridor Line */}
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
              {/* Terminal Circle */}
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
          <div className="neu-chip px-3 py-1 bg-white/90 dark:bg-stone-800/90 flex items-center gap-2 shadow-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-sage animate-ping" />
            <span className="text-xs font-bold text-ink">mapcn Real-Time Telemetry</span>
          </div>

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
            🚍 Transit Corridors {showRoutes ? "✓" : ""}
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
            center={[-0.158, 51.506]}
            zoom={13.6}
            blank={blankMode}
            className="h-full w-full"
          >
            <MapControls position="top-right" showCompass showFullscreen />

            {/* Dynamic Real-Time Traffic Corridors */}
            {showRoutes &&
              TRANSIT_ROUTES.map((coords, rIdx) => {
                const traffic = getTrafficStatus(rIdx);
                const routeColor = showTrafficAreas ? traffic.color : STOP_COLORS[rIdx % STOP_COLORS.length];
                const routeWidth = traffic.level === "GRIDLOCK" ? 5 : 3.5;

                return (
                  <MapRoute
                    key={`route-${rIdx}`}
                    coordinates={coords}
                    color={routeColor}
                    width={routeWidth}
                    opacity={0.88}
                  />
                );
              })}

            {/* Real-Time Traffic Chokepoint & Bottleneck Markers */}
            {showTrafficAreas &&
              TRAFFIC_BOTTLENECK_NODES.map((node) => {
                const traffic = getTrafficStatus(node.corridorIndex);
                const isChoke = traffic.level === "GRIDLOCK";
                const isHeavy = traffic.level === "CONGESTED";

                return (
                  <MapMarker
                    key={node.id}
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

            {/* Festival Arena / Main Stage Crowd Egress Center */}
            <MapMarker longitude={VENUE_COORDS[0]} latitude={VENUE_COORDS[1]}>
              <MarkerContent>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    {showCrowdAreas && (
                      <span className="absolute -inset-2 rounded-full bg-terra animate-ping opacity-30" />
                    )}
                    <div className="h-10 w-10 rounded-full bg-terra text-white flex items-center justify-center shadow-xl ring-4 ring-terra/30 font-bold text-sm">
                      🎪
                    </div>
                  </div>
                  <span className="mt-1 bg-white/95 dark:bg-stone-900/95 px-2 py-0.5 rounded text-[10px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                    {festivalName || "Main Arena Outflow"}
                  </span>
                </div>
              </MarkerContent>
              <MarkerPopup>
                <div className="p-2.5 text-xs max-w-[220px]">
                  <p className="font-bold text-ink text-sm">🎪 {festivalName || "Main Event Venue"}</p>
                  <p className="text-ink-soft mt-1">Primary Event Egress Outflow Origin</p>
                  <div className="mt-2 text-[11px] bg-sand/60 dark:bg-stone-800/60 p-2 rounded space-y-1">
                    <p className="text-terra font-semibold">🔥 Peak Outflow Surge Active</p>
                    <p className="text-ink-soft">Crowd dispersal splitting towards Terminals 1, 2, and 3.</p>
                  </div>
                </div>
              </MarkerPopup>
            </MapMarker>

            {/* Central Reserve Fleet Depot Marker */}
            <MapMarker longitude={DEPOT_COORDS[0]} latitude={DEPOT_COORDS[1]}>
              <MarkerContent>
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-ink text-sand flex items-center justify-center shadow-lg ring-3 ring-ink/20 font-bold text-xs">
                    🏢
                  </div>
                  <span className="mt-1 bg-white/95 dark:bg-stone-900/95 px-1.5 py-0.5 rounded text-[10px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                    Central Depot ({reserveLeft})
                  </span>
                </div>
              </MarkerContent>
              <MarkerPopup>
                <div className="p-2.5 text-xs min-w-[200px]">
                  <p className="font-bold text-ink text-sm">🏢 Central Bus Depot</p>
                  <p className="text-ink-soft mt-1">
                    Reserve fleet holding station & emergency operator staging.
                  </p>
                  <div className="mt-2 font-mono text-sage font-bold text-sm bg-sage/10 p-1.5 rounded">
                    {reserveLeft} Reserve Buses Ready for Deployment
                  </div>
                </div>
              </MarkerPopup>
            </MapMarker>

            {/* Boarding Terminals & Live Crowd Surge Areas */}
            {stops.map((st, i) => {
              const coords = STOP_COORDINATES[i % STOP_COORDINATES.length];
              const color = STOP_COLORS[i % STOP_COLORS.length];
              const isAlert = st.queue >= threshold;
              const isBehind = st.queue > 70 / 2;
              const densityPsm = (st.queue / 150).toFixed(1); // approximate pax / m² density

              return (
                <MapMarker key={st.id || i} longitude={coords[0]} latitude={coords[1]}>
                  <MarkerContent>
                    <div className="flex flex-col items-center cursor-pointer group">
                      <div className="relative">
                        {/* Live Crowd Heat Aura Ring */}
                        {showCrowdAreas && isAlert && (
                          <>
                            <span className="absolute -inset-4 rounded-full bg-brick animate-ping opacity-40" />
                            <span className="absolute -inset-2 rounded-full bg-brick/50 animate-pulse" />
                          </>
                        )}
                        {showCrowdAreas && !isAlert && isBehind && (
                          <span className="absolute -inset-2 rounded-full bg-amber-500/40 animate-pulse" />
                        )}

                        {/* Terminal Icon */}
                        <div
                          className="h-9 w-9 rounded-full text-white flex items-center justify-center shadow-xl ring-2 ring-white text-xs font-bold transition-transform group-hover:scale-110"
                          style={{ background: isAlert ? "#a0392c" : color }}
                        >
                          🚍
                        </div>
                      </div>

                      {/* Live Queue & Density Tag */}
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

                      {/* Real-time Crowd Density Stats */}
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

                      {/* Instant Operator Control Actions */}
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
          </Map>
        </MapErrorBoundary>
      </div>
    </div>
  );
}
