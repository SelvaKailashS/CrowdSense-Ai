// Discrete-event simulation of one night at the bus stops (5-minute ticks).
// Rules modelled:
//  - Dispatch: a bus leaves when full, or after waiting MAX_WAIT_MIN minutes with a queue.
//  - Reserve: if a stop's queue exceeds what its ready (and soon-returning) buses can load,
//    send one reserve bus from the depot to that stop.
//  - Crowd alert: when a stop's queue reaches the threshold.
//  - Re-forecast: every 15 minutes, scale the planned total by the observed arrivals.
// Legacy mode: no reserve, no rules, buses wait for a phone dispatch (lagMin).
import { GRID_END, GRID_START, SLOT_MIN, TICK_MIN } from "./types";
import { cumDeparted, type CurveParams } from "./forecast";
import { clockAt, fmtInt } from "./math";

export interface EngineStop {
  id: number;
  name: string;
  buses: number; // buses assigned to this stop (pre-positioned at GRID_START)
  transitMin: number; // depot -> stop transit for reserve buses
}

export interface EngineInput {
  riders: number; // actual riders tonight
  shares: number[]; // actual stop split, aligned with stops
  actual: CurveParams;
  planned: CurveParams;
  plannedRiders: number;
  stops: EngineStop[];
  reserveBuses: number;
  capacity: number;
  rtMin: number;
  lastBusMin: number;
  threshold: number;
  rules: boolean;
  lagMin: number;
  maxWaitMin: number;
  lastEventEnd: string;
}

export interface TickRow {
  t: number;
  clock: string;
  queues: number[];
  ready: number[];
  onTrip: number;
  reserveLeft: number;
  arrived: number;
  boarded: number;
}

export type EventKind = "dispatch" | "reserve" | "alert" | "reforecast" | "cutoff";

export interface EngineEvent {
  t: number;
  clock: string;
  kind: EventKind;
  stopId: number | null;
  message: string;
}

export interface SlotStopRow {
  stopId: number;
  arrivals: number;
  departures: number;
  queueEnd: number;
}

export interface SlotRow {
  minute: number;
  clock: string;
  stops: SlotStopRow[];
}

export interface ReforecastRow {
  t: number;
  clock: string;
  estimate: number;
  low: number;
  high: number;
}

export interface StopOutcome {
  stopId: number;
  name: string;
  arrived: number;
  boarded: number;
  stranded: number;
  peakQueue: number;
  peakClock: string;
  avgWaitMin: number;
  dispatches: number;
  reserveDispatches: number;
}

export interface EngineTotals {
  riders: number;
  arrived: number;
  boarded: number;
  stranded: number;
  strandedPct: number;
  peakQueue: number; // largest queue at any single stop
  peakClock: string;
  peakStop: string;
  peakTotalQueue: number; // largest queue summed over all stops
  avgWaitMin: number;
  dispatches: number;
  ruleDispatches: number;
  rulePct: number;
  reserveUsed: number;
  alerts: number;
}

export interface EngineResult {
  ticks: TickRow[];
  events: EngineEvent[];
  slots: SlotRow[];
  reforecasts: ReforecastRow[];
  stops: StopOutcome[];
  totals: EngineTotals;
}

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function simulateEngine(inp: EngineInput): EngineResult {
  const n = inp.stops.length;
  const cap = Math.max(1, inp.capacity);
  const lag = inp.lagMin;
  const cutoff = inp.lastBusMin;
  const rt = inp.rtMin;
  const clockOf = (t: number) => clockAt(inp.lastEventEnd, t);

  // Each bus is an entry holding the minute it is next free (back at the stop).
  // A bus can depart when free + lag <= t.
  const pools: number[][] = inp.stops.map((s) =>
    Array.from({ length: Math.max(0, Math.round(s.buses)) }, () => GRID_START),
  );
  let reserveLeft = Math.max(0, Math.round(inp.reserveBuses));
  const queue: number[] = new Array<number>(n).fill(0);
  const queueSince: (number | null)[] = new Array<number | null>(n).fill(null);
  const alertOn: boolean[] = new Array<boolean>(n).fill(false);
  const arrived: number[] = new Array<number>(n).fill(0);
  const boarded: number[] = new Array<number>(n).fill(0);
  const dispatches: number[] = new Array<number>(n).fill(0);
  const reserveDispatches: number[] = new Array<number>(n).fill(0);
  const peakQ: number[] = new Array<number>(n).fill(0);
  const peakQt: number[] = new Array<number>(n).fill(GRID_START);
  const waitPM: number[] = new Array<number>(n).fill(0);

  let dispatchTotal = 0;
  let ruleDispatches = 0;
  let reserveUsed = 0;
  let alerts = 0;
  let peakTotal = 0;
  let peakTotalT = GRID_START;
  let cutoffLogged = false;

  const ticks: TickRow[] = [];
  const events: EngineEvent[] = [];
  const reforecasts: ReforecastRow[] = [];
  const pushEvent = (t: number, kind: EventKind, stopId: number | null, message: string) =>
    events.push({ t, clock: clockOf(t), kind, stopId, message });

  const slotCount = Math.round((GRID_END - GRID_START) / SLOT_MIN);
  const slots: SlotRow[] = Array.from({ length: slotCount }, (_, k) => {
    const minute = GRID_START + k * SLOT_MIN;
    return {
      minute,
      clock: clockOf(minute),
      stops: inp.stops.map((s) => ({ stopId: s.id, arrivals: 0, departures: 0, queueEnd: 0 })),
    };
  });

  for (let t = GRID_START; t < GRID_END; t += TICK_MIN) {
    const slot = slots[Math.floor((t - GRID_START) / SLOT_MIN)];
    const readyAt = (s: number) => pools[s].reduce((c, f) => c + (f + lag <= t ? 1 : 0), 0);

    // 1. Riders reach the stops.
    const frac = cumDeparted(inp.actual, t + TICK_MIN) - cumDeparted(inp.actual, t);
    for (let s = 0; s < n; s++) {
      const a = inp.riders * inp.shares[s] * frac;
      if (a <= 0) continue;
      if (queueSince[s] === null) queueSince[s] = t;
      queue[s] += a;
      arrived[s] += a;
      slot.stops[s].arrivals += a;
    }

    // 2. Reserve rule: queue larger than what ready and soon-returning buses can load.
    if (inp.rules && t < cutoff) {
      for (let s = 0; s < n && reserveLeft > 0; s++) {
        if (queue[s] < 1) continue;
        const inbound = pools[s].reduce(
          (c, f) => c + (f + lag > t && f + lag <= t + SLOT_MIN ? 1 : 0),
          0,
        );
        const capNext = (readyAt(s) + inbound) * cap;
        const transit = inp.stops[s].transitMin;
        if (queue[s] > capNext && t + transit < cutoff) {
          reserveLeft -= 1;
          reserveUsed += 1;
          reserveDispatches[s] += 1;
          pools[s].push(t + transit);
          pushEvent(
            t,
            "reserve",
            inp.stops[s].id,
            `Reserve bus sent to ${inp.stops[s].name}: ${fmtInt(queue[s])} waiting vs ${fmtInt(capNext)} the ready buses can load. ETA ${transit} min.`,
          );
        }
      }
    }

    // 3. Dispatch: full bus, or 10 minutes with a queue.
    for (let s = 0; s < n; s++) {
      while (t < cutoff && queue[s] >= 1) {
        let idx = -1;
        for (let j = 0; j < pools[s].length; j++) {
          const f = pools[s][j];
          if (f + lag <= t && (idx < 0 || f < pools[s][idx])) idx = j;
        }
        if (idx < 0) break;
        const waited = queueSince[s] === null ? 0 : t - (queueSince[s] as number);
        const full = queue[s] >= cap;
        if (!full && waited < inp.maxWaitMin) break;
        const load = Math.min(cap, queue[s]);
        queue[s] -= load;
        boarded[s] += load;
        dispatches[s] += 1;
        dispatchTotal += 1;
        if (inp.rules) ruleDispatches += 1;
        pools[s][idx] = t + rt;
        slot.stops[s].departures += 1;
        if (queue[s] < 1) {
          queue[s] = 0;
          queueSince[s] = null;
        } else {
          queueSince[s] = t;
        }
        pushEvent(
          t,
          "dispatch",
          inp.stops[s].id,
          `${full ? "Full" : "10-min"} bus, ${fmtInt(load)} riders, leaves ${inp.stops[s].name}${inp.rules ? "" : " (phone dispatch)"}.`,
        );
      }
    }

    // 4. Stats, crowd alerts, waiting time.
    let totalQ = 0;
    for (let s = 0; s < n; s++) {
      const q = queue[s];
      totalQ += q;
      if (t < cutoff) waitPM[s] += q * TICK_MIN;
      slot.stops[s].queueEnd = q;
      if (q > peakQ[s]) {
        peakQ[s] = q;
        peakQt[s] = t;
      }
      if (q >= inp.threshold && !alertOn[s]) {
        alertOn[s] = true;
        alerts += 1;
        pushEvent(
          t,
          "alert",
          inp.stops[s].id,
          `CROWD ALERT at ${inp.stops[s].name}: ${fmtInt(q)} waiting, threshold ${fmtInt(inp.threshold)}. Notify police and marshals.`,
        );
      } else if (q < inp.threshold * 0.9) {
        alertOn[s] = false;
      }
    }
    if (totalQ > peakTotal) {
      peakTotal = totalQ;
      peakTotalT = t;
    }
    if (t >= cutoff && !cutoffLogged) {
      cutoffLogged = true;
      pushEvent(t, "cutoff", null, `Last bus cutoff. ${fmtInt(totalQ)} riders still waiting will be stranded.`);
    }

    // 5. Re-forecast every 15 minutes from observed arrivals.
    if (t >= 0 && t % SLOT_MIN === 0) {
      const observed = arrived.reduce((a, b) => a + b, 0);
      // Arrivals counted so far run to the end of this tick, so compare with the plan at t + TICK_MIN.
      const pf = cumDeparted(inp.planned, t + TICK_MIN);
      let est = inp.plannedRiders;
      if (pf > 0.02) {
        const w = Math.min(1, pf / 0.3);
        est = w * (observed / pf) + (1 - w) * inp.plannedRiders;
      }
      est = Math.min(3 * inp.plannedRiders, Math.max(0.3 * inp.plannedRiders, est));
      reforecasts.push({ t, clock: clockOf(t), estimate: r0(est), low: r0(est * 0.7), high: r0(est * 1.3) });
      pushEvent(
        t,
        "reforecast",
        null,
        `Re-forecast from live counts: about ${fmtInt(est)} riders (${fmtInt(est * 0.7)}–${fmtInt(est * 1.3)}), plan assumed ${fmtInt(inp.plannedRiders)}.`,
      );
    }

    ticks.push({
      t,
      clock: clockOf(t),
      queues: queue.map((q) => r0(q)),
      ready: inp.stops.map((_, s) => readyAt(s)),
      onTrip: pools.reduce((c, p) => c + p.filter((f) => f > t).length, 0),
      reserveLeft,
      arrived: r0(arrived.reduce((a, b) => a + b, 0)),
      boarded: r0(boarded.reduce((a, b) => a + b, 0)),
    });
  }

  const stopsOut: StopOutcome[] = inp.stops.map((s, i) => ({
    stopId: s.id,
    name: s.name,
    arrived: r0(arrived[i]),
    boarded: r0(boarded[i]),
    stranded: r0(Math.max(0, arrived[i] - boarded[i])),
    peakQueue: r0(peakQ[i]),
    peakClock: clockOf(peakQt[i]),
    avgWaitMin: boarded[i] > 0 ? r1(waitPM[i] / boarded[i]) : 0,
    dispatches: dispatches[i],
    reserveDispatches: reserveDispatches[i],
  }));

  const totalArrived = arrived.reduce((a, b) => a + b, 0);
  const totalBoarded = boarded.reduce((a, b) => a + b, 0);
  const stranded = Math.max(0, totalArrived - totalBoarded);
  let worst: StopOutcome | null = null;
  for (const s of stopsOut) if (!worst || s.peakQueue > worst.peakQueue) worst = s;
  const totalWaitBeforeCutoff = waitPM.reduce((a, b) => a + b, 0);

  return {
    ticks,
    events,
    slots,
    reforecasts,
    stops: stopsOut,
    totals: {
      riders: r0(inp.riders),
      arrived: r0(totalArrived),
      boarded: r0(totalBoarded),
      stranded: r0(stranded),
      strandedPct: inp.riders > 0 ? r1((stranded / inp.riders) * 100) : 0,
      peakQueue: worst ? worst.peakQueue : 0,
      peakClock: worst ? worst.peakClock : clockOf(GRID_START),
      peakStop: worst ? worst.name : "-",
      peakTotalQueue: r0(peakTotal),
      avgWaitMin: totalBoarded > 0 ? r1(totalWaitBeforeCutoff / totalBoarded) : 0,
      dispatches: dispatchTotal,
      ruleDispatches,
      rulePct: dispatchTotal > 0 ? r0((ruleDispatches / dispatchTotal) * 100) : 0,
      reserveUsed,
      alerts,
    },
  };
}
