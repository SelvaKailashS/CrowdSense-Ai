"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, Card, inputCls } from "./ui";

export function NewFestival() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/festivals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || undefined }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "Could not create the festival");
      setBusy(false);
      return;
    }
    router.push(`/festivals/${j.id}`);
  };

  return (
    <Card title="New festival" subtitle="Starts from the Mallur closing-night defaults and three boarding stops. Edit everything in the planner.">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">Festival name</span>
        <input
          className={`${inputCls} mt-2`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mallur Temple Festival, closing night"
        />
      </label>
      <button onClick={create} disabled={busy} className={`${btn} mt-5 w-full`}>
        {busy ? "Creating…" : "Create and open planner"}
      </button>
      {err && <p className="mt-3 text-sm text-brick">{err}</p>}
    </Card>
  );
}
