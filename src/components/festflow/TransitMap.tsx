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

// Coordinates for Festival Venue and Terminals
const VENUE_COORDS: [number, number] = [-0.1585, 51.5072]; // Main Stage Arena
const DEPOT_COORDS: [number, number] = [-0.1402, 51.5085]; // Central Reserve Fleet Depot

const STOP_COORDINATES: [number, number][] = [
  [-0.1532, 51.5028], // Terminal 1: Main Gate Terminal (South)
  [-0.1635, 51.5135], // Terminal 2: North Plaza Shuttle (North)
  [-0.1738, 51.4988], // Terminal 3: South Park & Ride (Orbital)
];

// Transit line routes connecting Central Depot to Terminals via Highway Corridor
const TRANSIT_ROUTES: [number, number][][] = [
  // Route to Main Gate
  [
    DEPOT_COORDS,
    [-0.1465, 51.5065],
    [-0.1505, 51.5042],
    STOP_COORDINATES[0],
  ],
  // Route to North Plaza
  [
    DEPOT_COORDS,
    [-0.1485, 51.5115],
    [-0.1565, 51.5130],
    STOP_COORDINATES[1],
  ],
  // Route to South Park & Ride
  [
    DEPOT_COORDS,
    [-0.1480, 51.5020],
    [-0.1610, 51.4995],
    STOP_COORDINATES[2],
  ],
];

export function TransitMap({
  festivalName,
  stops,
  threshold,
  reserveLeft,
  busesOnTrip,
  onDispatch,
  onDeployReserve,
}: TransitMapProps) {
  const [showRoutes, setShowRoutes] = useState(true);
  const [blankMode, setBlankMode] = useState(false);
  const [activeStop, setActiveStop] = useState<number | null>(null);

  return (
    <div className="neu-raised overflow-hidden rounded-2xl relative border border-black/5 dark:border-white/5">
      {/* Map Control Bar Overlay */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        <div className="neu-chip bg-white/90 dark:bg-stone-900/90 backdrop-blur-md px-3 py-1.5 shadow-md flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sage animate-ping" />
          <span className="text-xs font-bold text-ink">mapcn Live Fleet Telemetry</span>
        </div>
        <button
          type="button"
          onClick={() => setShowRoutes((v) => !v)}
          className={`neu-chip cursor-pointer transition-all text-xs font-semibold px-2.5 py-1 ${
            showRoutes ? "bg-terra text-white" : "bg-white/80 dark:bg-stone-900/80 text-ink-soft"
          }`}
        >
          {showRoutes ? "Transit Corridors ✓" : "Show Routes"}
        </button>
        <button
          type="button"
          onClick={() => setBlankMode((b) => !b)}
          className="neu-chip bg-white/80 dark:bg-stone-900/80 text-ink-soft hover:text-ink cursor-pointer text-xs px-2.5 py-1"
        >
          {blankMode ? "Street Tiles" : "High Contrast"}
        </button>
      </div>

      {/* Floating Status Summary Badge */}
      <div className="absolute bottom-4 left-4 z-20 hidden sm:flex items-center gap-3 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-black/5 dark:border-white/5 text-xs">
        <div>
          <span className="text-[10px] uppercase font-bold text-ink-soft">En-Route Buses</span>
          <p className="font-bold font-mono text-terra text-sm">{busesOnTrip} active</p>
        </div>
        <div className="h-6 w-px bg-black/10 dark:bg-white/10" />
        <div>
          <span className="text-[10px] uppercase font-bold text-ink-soft">Depot Reserves</span>
          <p className="font-bold font-mono text-sage text-sm">{reserveLeft} ready</p>
        </div>
      </div>

      {/* MapContainer with mapcn */}
      <div className="h-[430px] w-full relative">
        <Map
          center={[-0.158, 51.506]}
          zoom={13.6}
          blank={blankMode}
          className="h-full w-full"
        >
          <MapControls position="top-right" showCompass showFullscreen />

          {/* Bus Transit Route Corridors */}
          {showRoutes &&
            TRANSIT_ROUTES.map((coords, rIdx) => (
              <MapRoute
                key={`route-${rIdx}`}
                coordinates={coords}
                color={STOP_COLORS[rIdx % STOP_COLORS.length]}
                width={3.5}
                opacity={0.85}
              />
            ))}

          {/* Festival Arena / Main Stage Marker */}
          <MapMarker longitude={VENUE_COORDS[0]} latitude={VENUE_COORDS[1]}>
            <MarkerContent>
              <div className="flex flex-col items-center">
                <div className="h-9 w-9 rounded-full bg-terra text-white flex items-center justify-center shadow-lg ring-4 ring-terra/20 font-bold text-xs">
                  🎪
                </div>
                <span className="mt-1 bg-white/90 dark:bg-stone-900/90 px-2 py-0.5 rounded text-[10px] font-bold text-ink shadow whitespace-nowrap">
                  {festivalName || "Main Arena"}
                </span>
              </div>
            </MarkerContent>
            <MarkerPopup>
              <div className="p-2 text-xs">
                <p className="font-bold text-ink text-sm">🎪 {festivalName || "Main Event Area"}</p>
                <p className="text-ink-soft mt-1">Egress Outflow Origin Zone</p>
                <p className="text-[11px] text-terra font-semibold mt-1">
                  Crowds exit towards perimeter Terminals 1, 2, and 3.
                </p>
              </div>
            </MarkerPopup>
          </MapMarker>

          {/* Central Reserve Fleet Depot Marker */}
          <MapMarker longitude={DEPOT_COORDS[0]} latitude={DEPOT_COORDS[1]}>
            <MarkerContent>
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-ink text-sand flex items-center justify-center shadow-lg ring-4 ring-ink/20 font-bold text-xs">
                  🏢
                </div>
                <span className="mt-1 bg-white/90 dark:bg-stone-900/90 px-1.5 py-0.5 rounded text-[10px] font-bold text-ink shadow whitespace-nowrap">
                  Depot ({reserveLeft})
                </span>
              </div>
            </MarkerContent>
            <MarkerPopup>
              <div className="p-2 text-xs">
                <p className="font-bold text-ink text-sm">🏢 Central Bus Depot</p>
                <p className="text-ink-soft mt-1">
                  Emergency fleet reserve & rapid dispatch staging.
                </p>
                <div className="mt-2 font-mono text-sage font-bold">
                  {reserveLeft} reserve buses available
                </div>
              </div>
            </MarkerPopup>
          </MapMarker>

          {/* Boarding Terminals Markers */}
          {stops.map((st, i) => {
            const coords = STOP_COORDINATES[i % STOP_COORDINATES.length];
            const color = STOP_COLORS[i % STOP_COLORS.length];
            const isAlert = st.queue >= threshold;
            const isBehind = st.queue > 70 / 2;

            return (
              <MapMarker key={st.id} longitude={coords[0]} latitude={coords[1]}>
                <MarkerContent>
                  <div className="flex flex-col items-center cursor-pointer group">
                    <div className="relative">
                      {isAlert && (
                        <span className="absolute -inset-1 rounded-full bg-brick animate-ping opacity-75" />
                      )}
                      <div
                        className="h-9 w-9 rounded-full text-white flex items-center justify-center shadow-xl ring-2 ring-white text-xs font-bold transition-transform group-hover:scale-110"
                        style={{ background: isAlert ? "#a0392c" : color }}
                      >
                        🚍
                      </div>
                    </div>
                    <div className="mt-1 bg-white/95 dark:bg-stone-900/95 px-2 py-0.5 rounded-md shadow text-[10px] font-bold text-ink flex items-center gap-1 border border-black/5 dark:border-white/5">
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
                        {fmtInt(st.queue)}
                      </span>
                    </div>
                  </div>
                </MarkerContent>
                <MarkerPopup>
                  <div className="p-3 text-xs min-w-[200px]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm text-ink">{st.name}</p>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isAlert
                            ? "bg-brick text-white"
                            : isBehind
                            ? "bg-amber-500 text-white"
                            : "bg-sage text-white"
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-ink-soft">
                      <div>
                        <span className="text-[10px] uppercase">Queue</span>
                        <p className="font-display text-base font-bold text-ink">
                          {fmtInt(st.queue)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase">Ready Fleet</span>
                        <p className="font-display text-base font-bold text-sage">
                          {st.readyBuses} of {st.assignedBuses}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 pt-2 border-t border-black/10 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => onDispatch(i)}
                        className="w-full py-1.5 px-2 rounded bg-sage text-white font-bold text-[11px] hover:brightness-110 shadow cursor-pointer"
                      >
                        ⚡ Dispatch Bus ({Math.min(70, st.queue)} riders)
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeployReserve(i)}
                        className="w-full py-1 px-2 rounded neu-btn text-ochre font-semibold text-[10px] hover:text-ink cursor-pointer"
                      >
                        🚨 Deploy Reserve Bus
                      </button>
                    </div>
                  </div>
                </MarkerPopup>
              </MapMarker>
            );
          })}
        </Map>
      </div>
    </div>
  );
}
