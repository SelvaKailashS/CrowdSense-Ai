import React, { useEffect, useState } from "react";
import { AdvisorContext, AdvisorRecommendation, generateTacticalAdvice } from "@/lib/geminiAdvisor";
import { Card, Pill, Well, btnGhost, type Tone } from "./ui";

interface AiAdvisorProps {
  context: AdvisorContext;
  onExecuteTransfer?: (donorIndex: number, recipientIndex: number, count: number) => void;
}

export function AiAdvisor({ context, onExecuteTransfer }: AiAdvisorProps) {
  const [advice, setAdvice] = useState<AdvisorRecommendation | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("crowdsense_gemini_key") || "";
    } catch {
      return "";
    }
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appliedTradeoffs, setAppliedTradeoffs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      const res = await generateTacticalAdvice(context, apiKey);
      if (active) {
        setAdvice(res);
        setLoading(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [
    context.currentClock,
    context.minute,
    context.totalAlerts,
    context.reserveUsed,
    context.rainChance,
    context.stops.map((s) => `${s.name}:${s.queue}`).join(","),
    apiKey,
  ]);

  const saveKey = (val: string) => {
    setApiKey(val);
    try {
      localStorage.setItem("crowdsense_gemini_key", val);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyTradeoff = (t: any) => {
    if (t.donorIndex !== undefined && t.recipientIndex !== undefined && onExecuteTransfer) {
      onExecuteTransfer(t.donorIndex, t.recipientIndex, t.busesMoved || 1);
      setAppliedTradeoffs((prev) => ({ ...prev, [t.id]: true }));
    }
  };

  const statusTone: Record<string, Tone> = {
    NORMAL: "good",
    ELEVATED: "warn",
    CRITICAL: "bad",
  };

  return (
    <Card
      title="CrowdSense AI Tactical Copilot"
      subtitle="Hybrid Intelligence: Gemini AI Tactical Reasoner + Constraint-2 Zero-Sum Fleet Reallocation Engine"
      right={
        <div className="flex items-center gap-2">
          {advice && <Pill tone={statusTone[advice.statusLevel]}>{advice.statusLevel} RISK</Pill>}
          <button
            onClick={() => setShowKeyInput((v) => !v)}
            className="text-xs font-semibold text-ink-soft hover:text-terra transition-colors underline cursor-pointer"
          >
            {apiKey ? "Gemini Key Configured ✓" : "Connect Live Gemini Key"}
          </button>
        </div>
      }
    >
      {showKeyInput && (
        <div className="neu-inset mb-4 p-4 text-xs">
          <p className="font-semibold text-ink mb-1">Google Gemini API Key (Optional)</p>
          <p className="text-ink-soft mb-2">
            Connect your Gemini API key to activate live real-time LLM inference under Constraint-2, or leave blank to use the built-in deterministic offline engine.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
              className="neu-field text-xs py-1"
            />
            <button onClick={() => setShowKeyInput(false)} className={btnGhost}>
              Done
            </button>
          </div>
        </div>
      )}

      {loading && !advice ? (
        <p className="text-xs text-ink-soft">Synthesizing telemetry under Constraint-2…</p>
      ) : advice ? (
        <div className="space-y-4">
          {/* Header Status & Fixed Fleet Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-3">
            <div className="flex items-start gap-3">
              <span className="text-xl">🤖</span>
              <div>
                <p className="font-semibold text-sm text-ink">{advice.headline}</p>
                <p className="text-xs text-ink-soft mt-0.5">
                  Timestamp: {context.currentClock} (T+{context.minute}m) · Active Terminals: {context.stops.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="neu-chip bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold px-2.5 py-1">
                🔒 Constraint-2 Verified: Fixed Fleet ({advice.fixedFleetSummary?.totalFleet || 100} Buses)
              </span>
            </div>
          </div>

          {/* Tactical Directives */}
          <Well className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-terra">Tactical Dispatch Directives:</p>
            <ul className="space-y-1.5 text-xs text-ink">
              {advice.tacticalActions.map((act, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-terra font-bold">›</span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </Well>

          {/* Constraint-2: Fixed Fleet Redistribution & Service Trade-Offs Matrix */}
          <div className="neu-inset p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink">
                    Constraint-2: Fixed-Fleet Redistribution & Service Trade-Offs
                  </span>
                  <span className="text-[10px] bg-terra/10 text-terra font-bold px-1.5 py-0.5 rounded">
                    Zero-Sum Rule
                  </span>
                </div>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  The fleet is fixed. Any bus moved to a surge terminal must explicitly declare the route that loses service and the resulting trade-off.
                </p>
              </div>
              <div className="text-right font-mono text-[11px] text-ink-soft">
                <span>Fleet Invariant: </span>
                <span className="font-bold text-ink">
                  {advice.fixedFleetSummary?.assignedBuses || 88} Active + {advice.fixedFleetSummary?.reserveBuses || 12} Reserve = {advice.fixedFleetSummary?.totalFleet || 100} Fixed
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              {advice.tradeoffs && advice.tradeoffs.length > 0 ? (
                advice.tradeoffs.map((t) => (
                  <div
                    key={t.id}
                    className="neu-flat p-3.5 rounded-xl border border-black/5 dark:border-white/5 space-y-2.5"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      {/* Service Lost (Donor) */}
                      <div className="bg-red-50/60 dark:bg-red-950/20 p-2.5 rounded-lg border border-red-200/50 dark:border-red-900/30">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                            <span>🔻</span> Service Lost (Donor Stop)
                          </span>
                          <span className="font-mono text-[10px] font-bold text-red-800 dark:text-red-300">
                            -{t.busesMoved} Bus(es)
                          </span>
                        </div>
                        <p className="font-bold text-ink text-xs">{t.donorStop}</p>
                        <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">{t.serviceLost}</p>
                      </div>

                      {/* Service Gained (Recipient) */}
                      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200/50 dark:border-emerald-900/30">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <span>🔺</span> Service Gained (Recipient Stop)
                          </span>
                          <span className="font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                            +{t.busesMoved} Bus(es)
                          </span>
                        </div>
                        <p className="font-bold text-ink text-xs">{t.recipientStop}</p>
                        <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">{t.serviceGained}</p>
                      </div>
                    </div>

                    {/* Operational Net Assessment & Justification */}
                    <div className="bg-black/5 dark:bg-white/5 p-2.5 rounded-lg text-[11px] flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-bold text-ink">Net Safety Impact: </span>
                        <span className="text-ink-soft">{t.netSafetyImpact}</span>
                      </div>

                      {t.donorIndex !== undefined && t.recipientIndex !== undefined && onExecuteTransfer && (
                        <button
                          type="button"
                          onClick={() => handleApplyTradeoff(t)}
                          disabled={appliedTradeoffs[t.id]}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer ${
                            appliedTradeoffs[t.id]
                              ? "neu-inset text-sage"
                              : "neu-btn text-terra hover:brightness-110"
                          }`}
                        >
                          {appliedTradeoffs[t.id]
                            ? "✓ Reallocation Transferred"
                            : `⚡ Execute Reallocation (${t.donorStop} → ${t.recipientStop})`}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-ink-soft">Fleet is in optimal steady-state equilibrium.</p>
              )}
            </div>
          </div>

          {/* Behavioral Psychology & Mathematical Queuing Rationale */}
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="neu-inset p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Crowd Psychology & Behavior</p>
              <p className="mt-1 text-ink-soft leading-relaxed">{advice.crowdPsychologyNote}</p>
            </div>
            <div className="neu-inset p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Mathematical Queuing Rationale</p>
              <p className="mt-1 text-ink-soft leading-relaxed">{advice.mathematicalRationale}</p>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
