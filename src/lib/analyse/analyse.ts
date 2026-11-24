import { randomUUID } from "node:crypto";
import type { Analyse, AutoScore, Kandidaat, LaagResultaat, LngLat, Lqs } from "../types";
import { HAND_CRITERIA, STATION_TYPEN, TRACE } from "../config";
import { BRONNEN, panden, percelenRD, rijwegen, type BBox } from "./bronnen";
import { Raster, png } from "./raster";
import { naarRD, naarWGS } from "./rd";
import { K_BEBOUWD, K_BORING, K_OVERIG, K_WEG, kostenveld, volgTrace, type Kostenveld } from "./trace";

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL")}`;

const hex = (k: string) => [parseInt(k.slice(1, 3), 16), parseInt(k.slice(3, 5), 16), parseInt(k.slice(5, 7), 16)];
const rond = (n: number) => Math.round(n);

function trap(waarde: number, grenzen: number[], oplopend: boolean) {
  // oplopend: hogere waarde = betere score
  let s = 1;
  for (const g of grenzen) if (waarde >= g) s++;
  return oplopend ? s : 6 - s;
}

/** GeoJSON (WGS84) → lijst geometrieën in RD. */
function geometrieenRD(gj: unknown): { type: string; coordinates: unknown }[] {
  const uit: { type: string; coordinates: unknown }[] = [];
  // Coördinaten boven 180 zijn geen graden: het bestand staat dan al in RD (EPSG:28992).
  const punt = (c: number[]) => (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 180 ? [c[0], c[1]] : naarRD(c));
  const conv = (c: unknown): unknown => (typeof (c as number[])[0] === "number" ? punt(c as number[]) : (c as unknown[]).map(conv));
  const loop = (o: unknown) => {
    const x = o as { type?: string; features?: unknown[]; geometry?: unknown; geometries?: unknown[]; coordinates?: unknown };
    if (!x?.type) return;
    if (x.type === "FeatureCollection") x.features?.forEach(loop);
    else if (x.type === "Feature") loop(x.geometry);
    else if (x.type === "GeometryCollection") x.geometries?.forEach(loop);
    else if (x.coordinates) uit.push({ type: x.type, coordinates: conv(x.coordinates) });
  };
  loop(gj);
  return uit;
}

export async function voerAnalyseUit(lqs: Lqs): Promise<{ analyse: Analyse; kandidaten: Kandidaat[] }> {
  if (!lqs.zoekgebied) throw new Error("Geen zoekgebied vastgelegd");
  const t0 = Date.now();
  const ring = lqs.zoekgebied.coordinates.map((r) => r.map(naarRD));
  const xs = ring[0].map((p) => p[0]), ys = ring[0].map((p) => p[1]);
  const marge = 150; // context buiten het zoekgebied (woningen/wegen net over de grens tellen mee)
  const bbox: BBox = [Math.min(...xs) - marge, Math.min(...ys) - marge, Math.max(...xs) + marge, Math.max(...ys) + marge];
  // een aansluitpunt net buiten het zoekgebied valt binnen het rekengebied, zodat het kabeltracé te bepalen is
  if (lqs.aansluitpunt) {
    const [ax, ay] = naarRD(lqs.aansluitpunt);
    if (Math.max(bbox[0] - ax, ax - bbox[2], bbox[1] - ay, ay - bbox[3]) <= 1500) {
      bbox[0] = Math.min(bbox[0], ax - 50); bbox[1] = Math.min(bbox[1], ay - 50);
      bbox[2] = Math.max(bbox[2], ax + 50); bbox[3] = Math.max(bbox[3], ay + 50);
    }
  }
  const breedte = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  if (breedte > 12000) throw new Error("Zoekgebied is groter dan 12 km; splits het zoekgebied op");
  const cel = Math.max(2, Math.ceil(breedte / 800));
  const R = new Raster(bbox[0], bbox[1], bbox[2], bbox[3], cel);
  const { w, h, n } = R;
  const celM2 = cel * cel;

  const gebied = new Uint8Array(n);
  R.polygoon(gebied, ring);
  let gebiedCellen = 0;
  for (let i = 0; i < n; i++) gebiedCellen += gebied[i];

  // --- lagen ophalen en rasteren ---
  type Laag = LaagResultaat & { mask: Uint8Array; ruw: Uint8Array; rol?: string; functie?: string };
  const defs = [
    ...BRONNEN.map((b) => {
      const inst = lqs.lagen[b.id];
      // zonder eigen instelling geldt bij woningen de afstand die bij het stationstype hoort (50 m bij transformatoren)
      const standaard = b.id === "woningen" ? (STATION_TYPEN.find((t) => t.id === lqs.stationType)?.woningAfstand ?? b.buffer) : b.buffer;
      return { ...b, soort: inst?.soort ?? b.soort, buffer: inst?.buffer ?? standaard, functie: undefined as string | undefined };
    }),
    ...lqs.eigenLagen.map((e, i) => ({
      id: e.id, naam: e.naam, thema: "Aangeleverde data", bron: e.vertrouwelijk ? "Enexis (vertrouwelijk)" : "Eigen upload",
      soort: e.soort, buffer: e.buffer, kleur: ["#0e7490", "#be185d", "#a16207", "#4338ca"][i % 4], rol: undefined, functie: e.functie || undefined,
      haal: async () => geometrieenRD(e.geojson).map((g) => ({ geometry: g, properties: null })),
    })),
  ];
  const lagen: Laag[] = await Promise.all(
    defs.map(async (d): Promise<Laag> => {
      const basis = { id: d.id, naam: d.naam, thema: d.thema, bron: d.bron, soort: d.soort, buffer: d.buffer, kleur: d.kleur, rol: d.rol, functie: d.functie };
      const leeg = new Uint8Array(n);
      if (d.soort === "uit" && !d.rol && !d.functie) return { ...basis, aantal: 0, oppM2: 0, pct: 0, status: "ok", mask: leeg, ruw: leeg };
      try {
        const fs = await d.haal(bbox);
        const ruw = new Uint8Array(n);
        for (const f of fs) R.geometrie(ruw, f.geometry as never);
        const mask = d.soort === "uit" ? leeg : R.buffer(ruw, d.buffer);
        let cellen = 0;
        for (let i = 0; i < n; i++) if (mask[i] && gebied[i]) cellen++;
        return { ...basis, aantal: fs.length, oppM2: cellen * celM2, pct: gebiedCellen ? (100 * cellen) / gebiedCellen : 0, status: "ok", mask, ruw };
      } catch (e) {
        return { ...basis, aantal: 0, oppM2: 0, pct: 0, status: "fout", fout: e instanceof Error ? e.message : String(e), mask: leeg, ruw: leeg };
      }
    }),
  );

  // --- vrije ruimte ---
  const uitgesloten = new Uint8Array(n);
  const aandacht = new Uint8Array(n);
  for (const l of lagen) {
    const doel = l.soort === "uitsluiten" ? uitgesloten : l.soort === "aandacht" ? aandacht : null;
    if (doel) for (let i = 0; i < n; i++) if (l.mask[i]) doel[i] = 1;
  }
  const blok = new Uint8Array(n);
  let vrijCellen = 0, uitCellen = 0;
  for (let i = 0; i < n; i++) {
    blok[i] = !gebied[i] || uitgesloten[i] ? 1 : 0;
    if (gebied[i]) uitgesloten[i] ? uitCellen++ : vrijCellen++;
  }

  // --- kavel inpassen (rechthoek, beide oriëntaties, as-parallel aan RD) ---
  const W1 = w + 1;
  const som = new Int32Array(W1 * (h + 1));
  for (let r = 0; r < h; r++) {
    let rij = 0;
    for (let c = 0; c < w; c++) {
      rij += blok[r * w + c];
      som[(r + 1) * W1 + c + 1] = som[r * W1 + c + 1] + rij;
    }
  }
  const past = (c: number, r: number, hx: number, hy: number) => {
    const c0 = c - hx, c1 = c + hx, r0 = r - hy, r1 = r + hy;
    if (c0 < 0 || r0 < 0 || c1 >= w || r1 >= h) return false;
    return som[(r1 + 1) * W1 + c1 + 1] - som[r0 * W1 + c1 + 1] - som[(r1 + 1) * W1 + c0] + som[r0 * W1 + c0] === 0;
  };
  const hB = Math.ceil(lqs.kavelB / 2 / cel), hL = Math.ceil(lqs.kavelL / 2 / cel);
  const inpas = new Uint8Array(n); // 1 = B oost-west, 2 = L oost-west
  let inpasCellen = 0;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (blok[i]) continue;
      if (past(c, r, hL, hB)) inpas[i] = 2;
      else if (past(c, r, hB, hL)) inpas[i] = 1;
    }
  // oppervlak waar een kavel kan liggen = inpasbare middelpunten uitgebreid met de kavel zelf
  const dekking = R.buffer(inpas.map((v) => (v ? 1 : 0)), Math.min(lqs.kavelB, lqs.kavelL) / 2);
  for (let i = 0; i < n; i++) if (dekking[i] && !blok[i]) inpasCellen++;

  // --- afstandskaarten voor scoring ---
  const dBlok = R.afstand(blok);
  const woningLaag = lagen.find((l) => l.rol === "woningen");
  const wegLaag = lagen.find((l) => l.rol === "weg");
  const dWoning = woningLaag?.status === "ok" ? R.afstand(woningLaag.ruw) : null;
  const dWeg = wegLaag?.status === "ok" ? R.afstand(wegLaag.ruw) : null;
  const kruisLaag = lagen.find((l) => l.rol === "kruising");
  const dKruising = kruisLaag?.status === "ok" ? R.afstand(kruisLaag.ruw) : null;
  // aangeleverde kabel- en leidinglagen: afstandskaart per laag
  const leidingLagen = lagen.filter((l) => l.functie && l.status === "ok" && l.aantal > 0).map((l) => ({ l, d: R.afstand(l.ruw) }));
  const netLagen = leidingLagen.filter((x) => x.l.functie === "net");
  let net: [number, number];
  let netBron: string;
  if (lqs.aansluitpunt) { net = naarRD(lqs.aansluitpunt); netBron = "aansluitpunt"; }
  else {
    let sx = 0, sy = 0, k = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (gebied[r * w + c]) { sx += R.x(c); sy += R.y(r); k++; }
    net = [sx / k, sy / k]; netBron = "zwaartepunt zoekgebied";
  }
  const schaal = Math.sqrt(gebiedCellen * celM2); // maat voor omvang zoekgebied

  // --- kabeltracé: goedkoopste route langs de weg naar het aansluitpunt of het aangeleverde net ---
  const klasse = new Uint8Array(n).fill(K_OVERIG);
  let veld: Kostenveld | null = null;
  let traceDoel = "";
  const doelen: number[] = [];
  if (lqs.aansluitpunt) {
    const c = R.kol(net[0]), r = R.rij(net[1]);
    if (c >= 0 && r >= 0 && c < w && r < h) { doelen.push(r * w + c); traceDoel = "het aansluitpunt"; }
  } else if (netLagen.length) {
    for (let i = 0; i < n; i++) if (netLagen.some((nl) => nl.l.ruw[i])) doelen.push(i);
    traceDoel = "het aangeleverde net";
  }
  if (doelen.length && wegLaag?.status === "ok") {
    const metRol = (rol: string) => lagen.find((l) => l.rol === rol && l.status === "ok")?.ruw;
    const corridor = R.buffer(wegLaag.ruw, TRACE.corridor);
    const pand = metRol("bebouwing"), water = metRol("water"), spoorRuw = metRol("spoor");
    const spoor = spoorRuw ? R.buffer(spoorRuw, 10) : null;
    for (let i = 0; i < n; i++)
      klasse[i] = pand?.[i] ? K_BEBOUWD : wegLaag.ruw[i] ? K_WEG : water?.[i] || spoor?.[i] ? K_BORING : corridor[i] ? K_WEG : K_OVERIG;
    veld = kostenveld(R, klasse, doelen);
  }

  const beoordeel = (x: number, y: number) => {
    const c = Math.min(w - 1, Math.max(0, R.kol(x))), r = Math.min(h - 1, Math.max(0, R.rij(y))), i = r * w + c;
    const ruimte = Math.max(0, dBlok[i] - Math.min(lqs.kavelB, lqs.kavelL) / 2);
    const dn = Math.hypot(x - net[0], y - net[1]);
    // zonder aangewezen aansluitpunt geldt de afstand tot het aangeleverde net
    const dNet = !lqs.aansluitpunt && netLagen.length ? Math.min(...netLagen.map((nl) => nl.d[i])) : null;
    const geraakt: string[] = [];
    for (const l of lagen) {
      if (l.soort !== "aandacht") continue;
      let raak = false;
      for (let rr = Math.max(0, r - hL); rr <= Math.min(h - 1, r + hL) && !raak; rr++)
        for (let cc = Math.max(0, c - hL); cc <= Math.min(w - 1, c + hL); cc++) if (l.mask[rr * w + cc]) { raak = true; break; }
      if (raak) geraakt.push(l.naam);
    }
    const tr = veld && isFinite(veld.kost[i]) ? veld.meters[i] : null;
    const auto: Record<string, AutoScore> = {
      ruimte: { waarde: rond(ruimte), score: trap(ruimte, [5, 15, 30, 60], true), toelichting: `${rond(ruimte)} m vrije ruimte rondom de kavel` },
      woningen: dWoning
        ? { waarde: rond(dWoning[i]), score: trap(dWoning[i], [15, 30, 60, 120], true), toelichting: dWoning[i] > 1e5 ? "geen woningen in de omgeving" : `${rond(dWoning[i])} m tot dichtstbijzijnde woning` }
        : { waarde: null, score: 3, toelichting: "woningdata niet beschikbaar – handmatig controleren" },
      weg: dWeg
        ? { waarde: rond(dWeg[i]), score: trap(dWeg[i], [20, 40, 80, 150], false), toelichting: dWeg[i] > 1e5 ? "geen weg in de omgeving" : `${rond(dWeg[i])} m tot dichtstbijzijnde weg` }
        : { waarde: null, score: 3, toelichting: "wegdata niet beschikbaar – handmatig controleren" },
      net: tr !== null
        ? { waarde: rond(tr), score: lqs.aansluitpunt ? trap(tr / schaal, [0.13, 0.26, 0.45, 0.65], false) : trap(tr, [65, 200, 400, 800], false), toelichting: `circa ${rond(tr)} m kabeltracé tot ${traceDoel}` }
        : dNet !== null
        ? { waarde: rond(dNet), score: trap(dNet, [50, 150, 300, 600], false), toelichting: `${rond(dNet)} m hemelsbreed tot het aangeleverde net` }
        : { waarde: rond(dn), score: trap(dn / schaal, [0.1, 0.2, 0.35, 0.5], false), toelichting: `${rond(dn)} m hemelsbreed tot ${netBron}` },
      aandacht: { waarde: geraakt.length, score: Math.max(1, 5 - 2 * geraakt.length), toelichting: geraakt.length ? `raakt: ${geraakt.join(", ")}` : "geen aandachtsgebieden geraakt" },
      kruising: dKruising
        ? { waarde: rond(dKruising[i]), score: trap(dKruising[i], [25, 40, 60, 100], true), toelichting: dKruising[i] > 1e5 ? "geen kruising in de omgeving" : `${rond(dKruising[i])} m tot de dichtstbijzijnde kruising` }
        : { waarde: null, score: 3, toelichting: "wegendata niet beschikbaar – handmatig controleren" },
    };
    const inUit = !gebied[i] ? ["buiten zoekgebied"] : lagen.filter((l) => l.soort === "uitsluiten" && l.mask[i]).map((l) => l.naam);
    return { auto, inUit, i, hemelsbreed: rond(dNet ?? dn) };
  };
  // definitief tracé per locatie; de lengte van de uitgewerkte lijn vervangt de schatting uit het raster
  const traceBij = (x: number, y: number, b: ReturnType<typeof beoordeel>) => {
    const t = veld && volgTrace(R, klasse, veld, x, y);
    if (!t) return null;
    b.auto.net = {
      waarde: t.lengte,
      score: lqs.aansluitpunt ? trap(t.lengte / schaal, [0.13, 0.26, 0.45, 0.65], false) : trap(t.lengte, [65, 200, 400, 800], false),
      toelichting: `${t.lengte} m kabeltracé tot ${traceDoel} (hemelsbreed ${b.hemelsbreed} m), indicatie ${euro(t.kosten)}`,
    };
    return { ...t, lijn: t.lijn.map(naarWGS) as LngLat[], doel: traceDoel, hemelsbreed: b.hemelsbreed };
  };
  const leidingenBij = (x: number, y: number) => {
    const c = Math.min(w - 1, Math.max(0, R.kol(x))), r = Math.min(h - 1, Math.max(0, R.rij(y)));
    return leidingLagen.map(({ l, d }) => {
      let inKavel = false;
      for (let rr = Math.max(0, r - hL); rr <= Math.min(h - 1, r + hL) && !inKavel; rr++)
        for (let cc = Math.max(0, c - hL); cc <= Math.min(w - 1, c + hL); cc++) if (l.ruw[rr * w + cc]) { inKavel = true; break; }
      return { laag: l.naam, afstand: rond(d[r * w + c]), inKavel };
    });
  };
  const gew = lqs.gewichten;
  const autoTotaal = (a: Record<string, AutoScore>) => Object.entries(a).reduce((s, [k, v]) => s + (gew[k] ?? 1) * v.score, 0);

  // --- kandidaten kiezen: beste score, onderling gespreid ---
  const cellen: { i: number; s: number }[] = [];
  const stap = Math.max(1, Math.round(6 / cel)); // om de ~6 m bemonsteren
  for (let r = 0; r < h; r += stap)
    for (let c = 0; c < w; c += stap) {
      const i = r * w + c;
      if (inpas[i]) cellen.push({ i, s: autoTotaal(beoordeel(R.x(c), R.y(r)).auto) });
    }
  cellen.sort((a, b) => b.s - a.s);
  const spreiding = Math.max(75, 2.5 * lqs.kavelL, schaal / 8);
  const gekozen: { x: number; y: number; i: number }[] = [];
  for (const k of cellen) {
    if (gekozen.length >= Math.max(1, 6 - lqs.aangedragen.length)) break; // de template van Enexis heeft zes locatiepagina's (A t/m F)
    const x = R.x(k.i % w), y = R.y(Math.floor(k.i / w));
    if (gekozen.every((g) => Math.hypot(g.x - x, g.y - y) >= spreiding)) gekozen.push({ x, y, i: k.i });
  }

  const leegHand = () => Object.fromEntries(HAND_CRITERIA.map((c) => [c.id, { score: null, notitie: "" }]));
  // --- kavel richten: lange zijde evenwijdig aan de dichtstbijzijnde rijweg (programma van eisen Enexis), voorzijde naar de weg.
  // Zonder weg binnen 150 m volgt de kavel de richting van het dichtstbijzijnde gebouw; anders ligt hij noord-zuid. ---
  type Vec = [number, number];
  const wegen = await rijwegen(bbox).catch(() => [] as number[][][]);
  const gevels = (await panden(bbox).catch(() => [])).flatMap((f) => {
    const g = f.geometry;
    return g?.type === "Polygon" ? [(g.coordinates as number[][][])[0]] : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]).map((q) => q[0]) : [];
  });
  const dichtstbij = (lijnen: number[][][], x: number, y: number) => {
    let beste: { d: number; t: Vec; voet: Vec; lengte: number } | null = null;
    for (const lijn of lijnen)
      for (let i = 0; i + 1 < lijn.length; i++) {
        const [x1, y1] = lijn[i], [x2, y2] = lijn[i + 1], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 2) continue;
        const f = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (len * len)));
        const vx = x1 + f * dx, vy = y1 + f * dy, d = Math.hypot(x - vx, y - vy);
        if (!beste || d < beste.d) beste = { d, t: [dx / len, dy / len], voet: [vx, vy], lengte: len };
      }
    return beste;
  };
  const richting = (x: number, y: number): { t: Vec; n: Vec; naar: string } => {
    const weg = dichtstbij(wegen, x, y), gevel = dichtstbij(gevels, x, y);
    const basis = weg && weg.d <= 150 ? weg : gevel && gevel.d <= 100 ? gevel : weg ?? gevel;
    if (!basis) return { t: [1, 0], n: [0, 1], naar: "noord-zuid (geen weg of gebouw in de buurt)" };
    const t = basis.t;
    // n wijst van de weg af, zodat de voorzijde naar de weg ligt
    const anker = weg ?? basis;
    let n: Vec = [-t[1], t[0]];
    if (n[0] * (x - anker.voet[0]) + n[1] * (y - anker.voet[1]) < 0) n = [-n[0], -n[1]];
    return { t, n, naar: basis === weg ? "evenwijdig aan de weg" : "in lijn met de bebouwing" };
  };
  const rechthoek = (x: number, y: number, t: Vec, n: Vec, langs: number, diep: number): number[][] => {
    const a = langs / 2, b = diep / 2;
    return [[x - a * t[0] - b * n[0], y - a * t[1] - b * n[1]], [x + a * t[0] - b * n[0], y + a * t[1] - b * n[1]], [x + a * t[0] + b * n[0], y + a * t[1] + b * n[1]], [x - a * t[0] + b * n[0], y - a * t[1] + b * n[1]]];
  };
  const isVrij = (x: number, y: number, t: Vec, n: Vec, langs: number, diep: number) => {
    const straal = Math.hypot(langs, diep) / 2;
    for (let r = Math.max(0, R.rij(y + straal)); r <= Math.min(h - 1, R.rij(y - straal)); r++)
      for (let c = Math.max(0, R.kol(x - straal)); c <= Math.min(w - 1, R.kol(x + straal)); c++) {
        const dx = R.x(c) - x, dy = R.y(r) - y;
        if (Math.abs(dx * t[0] + dy * t[1]) <= langs / 2 && Math.abs(dx * n[0] + dy * n[1]) <= diep / 2 && blok[r * w + c]) return false;
      }
    return true;
  };
  /** Legt de kavel gericht neer; schuift hooguit 8 m als de gedraaide kavel anders net iets uitgeslotens raakt. */
  const plaats = (x: number, y: number, moetVrij: boolean): { x: number; y: number; hoeken: number[][]; ligging: string } => {
    const { t, n, naar } = richting(x, y);
    const L = Math.max(lqs.kavelB, lqs.kavelL), B = Math.min(lqs.kavelB, lqs.kavelL);
    const opties: { t: Vec; n: Vec; langs: number; diep: number; tekst: string }[] = [
      { t, n, langs: L, diep: B, tekst: `lange zijde ${naar}` },
      { t, n, langs: B, diep: L, tekst: `korte zijde ${naar.replace("evenwijdig aan", "aan")}` },
    ];
    if (!moetVrij) return { x, y, hoeken: rechthoek(x, y, t, n, L, B), ligging: opties[0].tekst };
    for (const o of opties)
      for (let straal = 0; straal <= 8; straal += 2)
        for (let hoek = 0; hoek < (straal ? 8 : 1); hoek++) {
          const px = x + straal * Math.cos((hoek * Math.PI) / 4), py = y + straal * Math.sin((hoek * Math.PI) / 4);
          if (isVrij(px, py, o.t, o.n, o.langs, o.diep)) return { x: px, y: py, hoeken: rechthoek(px, py, o.t, o.n, o.langs, o.diep), ligging: o.tekst };
        }
    // gedraaid past het niet: de kavel blijft liggen zoals hij in het raster is ingepast
    const lOW = inpas[Math.min(h - 1, Math.max(0, R.rij(y))) * w + Math.min(w - 1, Math.max(0, R.kol(x)))] === 2;
    return { x, y, hoeken: rechthoek(x, y, [1, 0], [0, 1], lOW ? lqs.kavelL : lqs.kavelB, lOW ? lqs.kavelB : lqs.kavelL), ligging: "niet gedraaid: evenwijdig aan de weg past de kavel hier niet" };
  };
  const kavelVan = (hoeken: number[][]) => ({ type: "Polygon" as const, coordinates: [[...hoeken, hoeken[0]].map(naarWGS)] });
  // --- op een groot terrein niet midden op het perceel, maar aan de rand bij de weg en het kabeltracé ---
  // Binnen een zoekstraal wordt de inpasbare plek (met minimale afstand tot weg en bebouwing) gekozen met het kortste tracé
  // (zonder tracé: het dichtst bij de weg). Een kavel die over meerdere kadastrale percelen valt, krijgt een straf: liever
  // binnen één perceel, want dan hoeft er maar met één eigenaar te worden gesproken. Een kleine straf voor de verplaatsing
  // voorkomt dat de locatie naar de andere kant van het terrein springt.
  const perceelId = new Int32Array(n); // 0 = geen perceel bekend
  try {
    const scratch = new Uint8Array(n);
    (await percelenRD(bbox)).forEach((f, idx) => {
      const g = f.geometry as { type?: string; coordinates?: unknown } | null;
      const delen = g?.type === "Polygon" ? [g.coordinates as number[][][]] : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
      for (const ringen of delen) {
        R.polygoon(scratch, ringen);
        const ys = ringen[0].map((q) => q[1]), r0 = Math.max(0, R.rij(Math.max(...ys))), r1 = Math.min(h - 1, R.rij(Math.min(...ys)));
        for (let i = r0 * w; i < (r1 + 1) * w; i++) if (scratch[i]) { perceelId[i] = idx + 1; scratch[i] = 0; }
      }
    });
  } catch { perceelId.fill(0); } // zonder kadasterdienst geldt alleen de afstand
  const randStraal = Math.max(100, 3 * lqs.kavelL);
  const naarRand = (x: number, y: number) => {
    const { t, n: nv } = richting(x, y);
    const L = Math.max(lqs.kavelB, lqs.kavelL), B = Math.min(lqs.kavelB, lqs.kavelL);
    const c0 = R.kol(x), r0 = R.rij(y), rc = Math.ceil(randStraal / cel);
    // meetpunten van de kavel: hoeken en zijmiddens
    const meet = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0]].map(([a, b]) => [a * L / 2 * 0.98, b * B / 2 * 0.98]);
    let beste = { x, y, kost: Infinity };
    for (let r = Math.max(0, r0 - rc); r <= Math.min(h - 1, r0 + rc); r++)
      for (let c = Math.max(0, c0 - rc); c <= Math.min(w - 1, c0 + rc); c++) {
        const i = r * w + c;
        if (!inpas[i] || !gebied[i]) continue;
        // voldoende afstand: minimaal 5 m tot uitgesloten gebied (gebouwen, water, hinderzones) en 8 m tussen kavelrand en weg
        if (dBlok[i] - Math.min(lqs.kavelB, lqs.kavelL) / 2 < 5) continue;
        if (dWeg && dWeg[i] - Math.hypot(lqs.kavelB, lqs.kavelL) / 2 < 8) continue;
        const px = R.x(c), py = R.y(r), d = Math.hypot(px - x, py - y);
        if (d > randStraal) continue;
        const basis = veld ? (isFinite(veld.kost[i]) ? veld.meters[i] : Infinity) : dWeg ? dWeg[i] : 0;
        const percelen = new Set<number>();
        for (const [a, b] of meet) {
          const qx = px + a * t[0] + b * nv[0], qy = py + a * t[1] + b * nv[1];
          const cc = R.kol(qx), rr = R.rij(qy);
          if (cc >= 0 && rr >= 0 && cc < w && rr < h && perceelId[rr * w + cc]) percelen.add(perceelId[rr * w + cc]);
        }
        const kost = basis + 0.3 * d + 80 * Math.max(0, percelen.size - 1);
        if (kost < beste.kost) beste = { x: px, y: py, kost };
      }
    return beste;
  };
  const verplaatst: { x: number; y: number; i: number }[] = [];
  for (const g of gekozen) {
    const nieuw = naarRand(g.x, g.y);
    const vrij = verplaatst.every((v) => Math.hypot(v.x - nieuw.x, v.y - nieuw.y) >= spreiding / 2);
    const x = vrij && isFinite(nieuw.kost) ? nieuw.x : g.x, y = vrij && isFinite(nieuw.kost) ? nieuw.y : g.y;
    verplaatst.push({ x, y, i: Math.min(h - 1, Math.max(0, R.rij(y))) * w + Math.min(w - 1, Math.max(0, R.kol(x))) });
  }
  gekozen.splice(0, gekozen.length, ...verplaatst);

  const oud = lqs.kandidaten;
  const hergebruik = (p: LngLat, bron: string, naam?: string) =>
    oud.find((o) => o.bron === bron && (bron === "aangedragen" ? o.naam === naam : Math.hypot(...(naarRD(o.punt).map((v, j) => v - naarRD(p)[j]) as [number, number])) < 25));

  const kandidaten: Kandidaat[] = [];
  gekozen.forEach((g0, idx) => {
    const pl = plaats(g0.x, g0.y, true);
    const g = { x: pl.x, y: pl.y };
    const punt = naarWGS([g.x, g.y]);
    const b = beoordeel(g.x, g.y);
    const trace = traceBij(g.x, g.y, b);
    const vorig = hergebruik(punt, "analyse");
    kandidaten.push({
      id: vorig?.id ?? randomUUID(), naam: `Locatie ${String.fromCharCode(65 + idx)}`, bron: "analyse", punt, rd: [rond(g.x), rond(g.y)],
      kavel: kavelVan(pl.hoeken), ligging: pl.ligging,
      inUitgesloten: [], auto: b.auto, leidingen: leidingenBij(g.x, g.y), handmatig: vorig?.handmatig ?? leegHand(), feiten: vorig?.feiten, voorstel: vorig?.voorstel, eigendom: vorig?.eigendom,
      trace, beeld: vorig?.beeld,
    });
  });
  for (const a of lqs.aangedragen) {
    const [x, y] = naarRD(a.punt);
    const b = beoordeel(x, y);
    const trace = traceBij(x, y, b);
    const vorig = hergebruik(a.punt, "aangedragen", a.naam);
    kandidaten.push({
      id: vorig?.id ?? randomUUID(), naam: a.naam, bron: "aangedragen", punt: a.punt, rd: [rond(x), rond(y)],
      kavel: kavelVan(plaats(x, y, false).hoeken), ligging: plaats(x, y, false).ligging, inUitgesloten: b.inUit, auto: b.auto, leidingen: leidingenBij(x, y), handmatig: vorig?.handmatig ?? leegHand(), feiten: vorig?.feiten, voorstel: vorig?.voorstel, eigendom: vorig?.eigendom,
      trace, beeld: vorig?.beeld,
    });
  }
  await Promise.all(kandidaten.map(async (k) => { k.adres = await adresBij(k.rd); }));
  await Promise.all(kandidaten.map(async (k) => { k.auto.terrein = await terrein(k); }));

  // --- overlay ---
  const rgba = new Uint8Array(n * 4);
  const zet = (i: number, [r, g, b]: number[], a: number) => { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a; };
  const volgorde = [...lagen].reverse();
  for (let i = 0; i < n; i++) {
    if (!gebied[i]) continue;
    if (dekking[i] && !blok[i]) zet(i, [34, 197, 94], 110);
    for (const l of volgorde) if (l.soort === "aandacht" && l.mask[i]) zet(i, hex(l.kleur), 110);
    for (const l of volgorde) if (l.soort === "uitsluiten" && l.mask[i]) zet(i, hex(l.kleur), 150);
  }

  // --- kaartbeeld per thema (hoofdstuk Ruimtelijke context in de template) ---
  const themas = [...new Set(lagen.filter((l) => l.soort !== "uit" && l.status === "ok").map((l) => l.thema))].map((naam) => {
    const beeld = new Uint8Array(n * 4);
    const eigen = volgorde.filter((l) => l.thema === naam && l.soort !== "uit");
    for (let i = 0; i < n; i++) {
      if (!gebied[i]) continue;
      for (const l of eigen) if (l.mask[i]) { const [r, g, b] = hex(l.kleur); beeld[i * 4] = r; beeld[i * 4 + 1] = g; beeld[i * 4 + 2] = b; beeld[i * 4 + 3] = l.soort === "uitsluiten" ? 170 : 120; }
    }
    return { naam, overlay: png(w, h, beeld), lagen: eigen.map((l) => l.id) };
  });

  // --- complexiteit ---
  const pct = (id: string) => lagen.find((l) => l.id === id)?.pct ?? 0;
  const inpasPct = gebiedCellen ? (100 * inpasCellen) / gebiedCellen : 0;
  const toel: string[] = [];
  let punten = 0;
  const tel = (p: number, t: string) => { if (p) { punten += p; toel.push(`${t} (+${p})`); } };
  tel(pct("bebouwing") > 25 ? 2 : pct("bebouwing") > 10 ? 1 : 0, `Stedelijkheid: ${pct("bebouwing").toFixed(0)}% bebouwd incl. buffer`);
  tel(inpasPct < 5 ? 3 : inpasPct < 15 ? 2 : inpasPct < 30 ? 1 : 0, `Beperkte inpasbare ruimte: ${inpasPct.toFixed(0)}% van het zoekgebied`);
  tel(gekozen.length < 3 ? 2 : 0, `Weinig kansrijke locaties gevonden (${gekozen.length})`);
  const geraakteAandacht = lagen.filter((l) => l.soort === "aandacht" && l.pct > 1).length;
  tel(Math.min(2, geraakteAandacht), `${geraakteAandacht} aandachtslaag/-lagen in het zoekgebied`);
  tel(lagen.some((l) => l.status === "fout") ? 1 : 0, "Eén of meer bronnen niet beschikbaar; handmatige controle nodig");
  tel(lqs.aangedragen.length > 2 ? 1 : 0, "Meerdere vooraf aangedragen locaties");
  if (!toel.length) toel.push("Ruim zoekgebied met weinig belemmeringen");

  const analyse: Analyse = {
    uitgevoerdOp: new Date().toISOString(), duurMs: Date.now() - t0, cel,
    hoeken: [[R.minX, R.maxY], [R.maxX, R.maxY], [R.maxX, R.minY], [R.minX, R.minY]].map(naarWGS) as LngLat[],
    overlay: png(w, h, rgba),
    oppZoekgebiedM2: gebiedCellen * celM2, uitgeslotenM2: uitCellen * celM2, vrijM2: vrijCellen * celM2, inpasbaarM2: inpasCellen * celM2,
    themas,
    lagen: lagen.map(({ mask: _m, ruw: _r, rol: _o, functie: _f, ...l }) => l),
    complexiteit: { klasse: punten >= 5 ? "Hoog" : punten >= 2 ? "Midden" : "Laag", punten, toelichting: toel },
  };
  return { analyse, kandidaten };
}

async function opPunt(basis: string, laag: string, [x, y]: number[]): Promise<Record<string, unknown>[]> {
  const u = `${basis}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=${laag}&query_layers=${laag}&styles=&crs=EPSG:28992&bbox=${x - 1},${y - 1},${x + 1},${y + 1}&width=3&height=3&i=1&j=1&info_format=application/json&feature_count=5`;
  const r = await fetch(u, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (((await r.json()) as { features?: { properties: Record<string, unknown> }[] }).features ?? []).map((f) => f.properties);
}

/**
 * Programma van eisen Enexis: het station staat niet op een helling en niet in gebied met hoogwaterrisico.
 * Helling: hoogteverschil van het maaiveld (AHN, 0,5 m-raster) tussen midden en hoeken van de kavel.
 * Hoogwater: ligging volgens de Richtlijn Overstromingsrisico's; onbeschermd gebied (type A en D) telt als risico.
 */
async function terrein(k: Kandidaat): Promise<AutoScore> {
  const punten = [k.rd as number[], ...k.kavel.coordinates[0].slice(0, 4).map(naarRD)];
  const [hoogten, zones] = await Promise.all([
    Promise.all(punten.map((p) => opPunt("https://service.pdok.nl/rws/ahn/wms/v1_0", "dtm_05m", p).then((f) => Number(f[0]?.value_list)).catch(() => NaN))),
    opPunt("https://service.pdok.nl/rws/overstromingen-risicogebied/wms/v1_0", "NZ.RiskZone", k.rd).then((f) => f.map((z) => String(z.description ?? ""))).catch(() => null),
  ]);
  const geldig = hoogten.filter((h) => Number.isFinite(h) && Math.abs(h) < 500);
  const verval = geldig.length >= 3 ? Math.max(...geldig) - Math.min(...geldig) : null;
  const onbeschermd = zones?.find((z) => /onbeschermd|type [AD]\b/i.test(z));
  const delen: string[] = [];
  let score = 3;
  if (verval === null) delen.push("hoogteverschil niet te bepalen");
  else {
    score = trap(verval, [0.3, 0.6, 1, 2], false);
    delen.push(`${verval.toFixed(1).replace(".", ",")} m hoogteverschil over de kavel`);
  }
  if (zones === null) delen.push("hoogwaterrisico niet opgehaald");
  else if (onbeschermd) { score = Math.min(score, 2); delen.push(`ligt in onbeschermd gebied (${onbeschermd})`); }
  else if (zones.length) delen.push("achter een waterkering");
  else delen.push("buiten de aangewezen overstromingsrisicogebieden");
  return { waarde: verval === null ? null : +verval.toFixed(2), score, toelichting: delen.join("; ") };
}

async function adresBij([x, y]: [number, number]): Promise<string | undefined> {
  try {
    const r = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${x}&Y=${y}&type=adres&rows=1&distance=500`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const d = await r.json();
    const doc = d?.response?.docs?.[0];
    return doc ? `nabij ${doc.weergavenaam}` : undefined;
  } catch {
    return undefined;
  }
}
