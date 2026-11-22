import { TRACE } from "../config";
import type { Raster } from "./raster";

// Terreinklasse per rastercel voor het kabeltracé.
export const K_BEBOUWD = 0, K_WEG = 1, K_OVERIG = 2, K_BORING = 3;
// Routeringsgewicht per meter, ten opzichte van een meter langs de weg. Bebouwing is geen harde grens, zodat
// een aansluitpunt in een bestaand station bereikbaar blijft; het gewicht is zo hoog dat het tracé er anders nooit doorheen gaat.
const GEWICHT = [150, 1, TRACE.strafOverig, TRACE.strafBoring];

export type Kostenveld = { kost: Float64Array; meters: Float32Array; vorige: Int32Array };

/** Goedkoopste tracé vanaf de doelcellen naar elke cel (Dijkstra, acht richtingen). */
export function kostenveld(R: Raster, klasse: Uint8Array, doelen: number[]): Kostenveld {
  const { w, h, n, cel } = R;
  const kost = new Float64Array(n).fill(Infinity);
  const meters = new Float32Array(n);
  const vorige = new Int32Array(n).fill(-1);
  // binaire heap op (kost, cel); verouderde items worden bij het uitnemen overgeslagen
  let hk = new Float64Array(1 << 16), hi = new Int32Array(1 << 16), len = 0;
  const duw = (k: number, i: number) => {
    if (len === hk.length) {
      const nk = new Float64Array(len * 2), ni = new Int32Array(len * 2);
      nk.set(hk); ni.set(hi); hk = nk; hi = ni;
    }
    let p = len++;
    while (p > 0) {
      const o = (p - 1) >> 1;
      if (hk[o] <= k) break;
      hk[p] = hk[o]; hi[p] = hi[o]; p = o;
    }
    hk[p] = k; hi[p] = i;
  };
  const neem = () => {
    const top = hi[0];
    const k = hk[--len], i = hi[len];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= len) break;
      if (c + 1 < len && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[p] = hk[c]; hi[p] = hi[c]; p = c;
    }
    hk[p] = k; hi[p] = i;
    return top;
  };
  for (const d of doelen) { kost[d] = 0; duw(0, d); }
  const dc = [1, -1, 0, 0, 1, 1, -1, -1], dr = [0, 0, 1, -1, 1, -1, 1, -1];
  while (len) {
    const k0 = hk[0], i = neem();
    if (k0 > kost[i]) continue;
    const c = i % w, r = (i - c) / w;
    for (let q = 0; q < 8; q++) {
      const cc = c + dc[q], rr = r + dr[q];
      if (cc < 0 || rr < 0 || cc >= w || rr >= h) continue;
      const j = rr * w + cc;
      const stap = q < 4 ? cel : cel * Math.SQRT2;
      const nk = k0 + stap * 0.5 * (GEWICHT[klasse[i]] + GEWICHT[klasse[j]]);
      if (nk < kost[j]) { kost[j] = nk; meters[j] = meters[i] + stap; vorige[j] = i; duw(nk, j); }
    }
  }
  return { kost, meters, vorige };
}

/** Douglas-Peucker: haalt de trapjes van het raster uit de lijn. */
function vereenvoudig(p: number[][], tol: number): number[][] {
  if (p.length < 3) return p;
  const houd = new Uint8Array(p.length);
  houd[0] = houd[p.length - 1] = 1;
  const stapel = [[0, p.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop()!;
    const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], l = Math.hypot(dx, dy) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (p[i][0] - p[a][0]) - dx * (p[i][1] - p[a][1])) / l;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { houd[idx] = 1; stapel.push([a, idx], [idx, b]); }
  }
  return p.filter((_, i) => houd[i]);
}

/** Tracé van (x, y) naar het doel: lijn in RD en meters per terreinklasse. */
export function volgTrace(R: Raster, klasse: Uint8Array, veld: Kostenveld, x: number, y: number) {
  const { w, h, cel } = R;
  const i = Math.min(h - 1, Math.max(0, R.rij(y))) * w + Math.min(w - 1, Math.max(0, R.kol(x)));
  if (!isFinite(veld.kost[i])) return null;
  const punten: number[][] = [[x, y]];
  const perKlasse = [0, 0, 0, 0];
  let rasterLengte = 0;
  for (let j = i; j >= 0; j = veld.vorige[j]) {
    const c = j % w, r = (j - c) / w;
    punten.push([R.x(c), R.y(r)]);
    const v = veld.vorige[j];
    if (v >= 0) {
      const stap = Math.abs(v - j) === 1 || Math.abs(v - j) === w ? cel : cel * Math.SQRT2;
      perKlasse[klasse[j]] += stap;
      rasterLengte += stap;
    }
  }
  const lijn = vereenvoudig(punten, cel * 1.2);
  let lengte = 0;
  for (let k = 1; k < lijn.length; k++) lengte += Math.hypot(lijn[k][0] - lijn[k - 1][0], lijn[k][1] - lijn[k - 1][1]);
  // verdeling over de klassen volgt het rasterpad; de lengte komt van de vereenvoudigde lijn
  const f = rasterLengte ? lengte / rasterLengte : 0;
  const langsWeg = perKlasse[K_WEG] * f, boring = perKlasse[K_BORING] * f, overig = Math.max(0, lengte - langsWeg - boring);
  const kosten = Math.round((langsWeg * TRACE.weg + overig * TRACE.overig + boring * TRACE.boring) / 100) * 100;
  return { lijn, lengte: Math.round(lengte), langsWeg: Math.round(langsWeg), overig: Math.round(overig), boring: Math.round(boring), kosten };
}
