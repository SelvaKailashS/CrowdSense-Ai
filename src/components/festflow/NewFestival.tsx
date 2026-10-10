"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { btn, Card, inputCls } from "./ui";
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls } from "@/components/ui/map";
import {
  TAMIL_NADU_TEMPLES,
  searchTemples,
  geocodeTempleOnline,
  type TempleLocation,
} from "@/lib/templeLocations";

export function NewFestival() {
  const router = useRouter();
  const [selectedTemple, setSelectedTemple] = useState<TempleLocation>(TAMIL_NADU_TEMPLES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("Mallur Temple Festival, closing night");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filtered temple suggestions
  const suggestions = useMemo(() => {
    return searchTemples(searchQuery).slice(0, 6);
  }, [searchQuery]);

  const handleSelectTemple = (temple: TempleLocation) => {
    setSelectedTemple(temple);
    setName(`${temple.name} Festival, closing night`);
    setSearchQuery("");
  };

  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check local suggestions first
    const localMatch = searchTemples(searchQuery)[0];
    if (localMatch) {
      handleSelectTemple(localMatch);
      return;
    }

    // Geocode online via OpenStreetMap
    setSearching(true);
    const online = await geocodeTempleOnline(searchQuery);
    setSearching(false);
    if (online) {
      handleSelectTemple(online);
    } else {
      setErr(`Could not pinpoint "${searchQuery}". Please select a temple from the list.`);
    }
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/festivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${selectedTemple.name} Festival, closing night`,
          town: selectedTemple.town,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? "Could not create the festival");
        setBusy(false);
        return;
      }
      router.push(`/festivals/${j.id}`);
    } catch (e) {
      setErr("Failed to initialize festival workspace.");
      setBusy(false);
    }
  };

  return (
    <Card
      title="New festival"
      subtitle="Starts from the Mallur closing-night defaults and three boarding stops. Edit everything in the planner."
    >
      <div className="space-y-4">
        {/* Temple Search Input */}
        <div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              🛕 Search Temple Location (Tamil Nadu)
            </span>
            <div className="mt-1.5 flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any temple (e.g. Meenakshi Amman, Brihadeeswarar, Palani, Kapaleeshwarar)..."
              />
              <button
                type="button"
                onClick={handleCustomSearch}
                disabled={searching}
                className="neu-btn px-4 text-xs font-bold text-terra cursor-pointer"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </label>

          {/* Quick Select Temple Chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-ink-soft mr-1">Popular Temples:</span>
            {TAMIL_NADU_TEMPLES.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTemple(t)}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                  selectedTemple.id === t.id
                    ? "bg-terra text-white shadow-xs font-bold"
                    : "neu-flat text-ink-soft hover:text-ink"
                }`}
              >
                {t.name.split(" ")[0]} {t.town}
              </button>
            ))}
          </div>

          {/* Search suggestions dropdown */}
          {searchQuery.trim().length > 0 && suggestions.length > 0 && (
            <div className="mt-2 neu-raised p-2 rounded-xl border border-black/5 dark:border-white/5 space-y-1">
              <p className="text-[10px] font-bold text-ink-soft uppercase px-2 py-1">Matching Temple Locations:</p>
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTemple(t)}
                  className="w-full text-left p-2 rounded-lg text-xs hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-ink">🛕 {t.name}</span>
                    <span className="text-ink-soft text-[11px] ml-1.5">({t.town}, {t.district} District)</span>
                  </div>
                  <span className="text-[10px] text-terra font-mono font-bold">Select & Show Map ›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Festival Name Input */}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            Festival name
          </span>
          <input
            className={`${inputCls} mt-1.5 font-semibold text-ink`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mallur Temple Festival, closing night"
          />
        </label>

        {/* Interactive Mapcn Preview of Searched Temple */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink flex items-center gap-1.5">
              <span>📍</span> Temple Map Location: <strong className="text-terra">{selectedTemple.name}</strong>
            </span>
            <span className="font-mono text-[11px] text-ink-soft">
              {selectedTemple.town}, {selectedTemple.district} · [{selectedTemple.coords[0].toFixed(4)}°E, {selectedTemple.coords[1].toFixed(4)}°N]
            </span>
          </div>

          <div className="h-[220px] w-full rounded-xl overflow-hidden neu-inset relative border border-black/5 dark:border-white/5">
            <Map
              center={selectedTemple.coords}
              zoom={14.8}
              className="h-full w-full"
            >
              <MapControls position="top-right" />

              <MapMarker longitude={selectedTemple.coords[0]} latitude={selectedTemple.coords[1]}>
                <MarkerContent>
                  <div className="flex flex-col items-center cursor-pointer">
                    <div className="relative">
                      <span className="absolute -inset-2 rounded-full bg-terra animate-ping opacity-60" />
                      <div className="h-9 w-9 rounded-full bg-terra text-white flex items-center justify-center shadow-lg ring-3 ring-white font-bold text-sm">
                        🛕
                      </div>
                    </div>
                    <span className="mt-1 bg-white/95 dark:bg-stone-900/95 px-2 py-0.5 rounded text-[10px] font-bold text-ink shadow border border-black/5 dark:border-white/5 whitespace-nowrap">
                      {selectedTemple.name}
                    </span>
                  </div>
                </MarkerContent>
                <MarkerPopup>
                  <div className="p-2 text-xs">
                    <p className="font-bold text-ink">🛕 {selectedTemple.name}</p>
                    <p className="text-ink-soft text-[11px] mt-0.5">{selectedTemple.description}</p>
                    <p className="text-[10px] text-terra font-semibold mt-1">
                      Event Outflow & Boarding Stops Area
                    </p>
                  </div>
                </MarkerPopup>
              </MapMarker>
            </Map>
          </div>
        </div>

        {/* Create and Open Planner Button */}
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className={`${btn} w-full py-3 text-sm cursor-pointer shadow-md`}
        >
          {busy ? "Creating…" : "Create and open planner ›"}
        </button>

        {err && <p className="text-sm text-brick">{err}</p>}
      </div>
    </Card>
  );
}
