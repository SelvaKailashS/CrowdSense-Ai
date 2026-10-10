// Numeric helpers: regularized incomplete gamma (the departure curve) and clock formatting.

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999385,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ln Gamma(z) via Lanczos approximation (z > 0).
export function lnGamma(z: number): number {
  const x0 = z - 1;
  let a = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (x0 + i);
  const t = x0 + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x0 + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a, x): the CDF of Gamma(shape a, scale 1) at x.
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lg = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let sum = del;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lg);
  }
  // Continued fraction for the upper tail (Lentz's method).
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lg) * h;
}

export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

// Clock time for a minute offset from the last event end (negative = before).
export function clockAt(endHHMM: string, relMin: number): string {
  let total = Math.round(parseHHMM(endHHMM) + relMin) % 1440;
  if (total < 0) total += 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function relMinLabel(t: number): string {
  if (t === 0) return "end";
  return t > 0 ? `+${t}m` : `${t}m`;
}
