import React, { useEffect, useState } from "react";
import { AdvisorContext, AdvisorRecommendation, generateTacticalAdvice } from "@/lib/geminiAdvisor";
import { Card, Pill, Well, btnGhost, type Tone } from "./ui";

export function AiAdvisor({ context }: { context: AdvisorContext }) {
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

  const statusTone: Record<string, Tone> = {
    NORMAL: "good",
    ELEVATED: "warn",
    CRITICAL: "bad",
  };

  return (
    <Card
      title="CrowdSense AI Tactical Copilot"
      subtitle="Hybrid Intelligence: Gemini AI Tactical Reasoner + Continuous Poisson/Gaussian Flow Engine"
      right={
        <div className="flex items-center gap-2">
          {advice && <Pill tone={statusTone[advice.statusLevel]}>{advice.statusLevel} RISK</Pill>}
          <button
            onClick={() => setShowKeyInput((v) => !v)}
            className="text-xs font-semibold text-ink-soft hover:text-terra transition-colors underline"
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
            Connect your Gemini API key to activate live real-time LLM inference, or leave blank to use the built-in deterministic offline engine.
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
        <p className="text-xs text-ink-soft">Synthesizing telemetry…</p>
      ) : advice ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">🤖</span>
            <div>
              <p className="font-semibold text-sm text-ink">{advice.headline}</p>
              <p className="text-xs text-ink-soft mt-0.5">
                Timestamp: {context.currentClock} (T+{context.minute}m) · Monitored Terminals: {context.stops.length}
              </p>
            </div>
          </div>

          <Well className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-terra">Recommended Tactical Directives:</p>
            <ul className="space-y-1.5 text-xs text-ink">
              {advice.tacticalActions.map((act, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-terra font-bold">›</span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </Well>

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
