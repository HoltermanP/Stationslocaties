import { rijwegen, type BBox } from "../analyse/bronnen";
import { naarRD } from "../analyse/rd";
import type { EigenLaag, KlicInfo, Lqs } from "../types";
import { THEMA } from "./lees";

// GESIMULEERDE KLIC-levering voor demo's: geen gegevens van het Kadaster of van netbeheerders.
// De leidingen volgen de echte rijwegen (BRT) op een vaste afstand uit de wegas, zoals kabels en leidingen in de praktijk
// in berm en trottoir liggen. Middenspanning ligt niet in elke straat: de MS-kabels lopen als strengen vanaf het
// aansluitpunt langs de kortste route over de weg naar de randen van het gebied. In een deel van de gebieden kruist een
// fictieve hogedrukgasleiding de rand van het zoekgebied. Ligging, aantallen en beheerders zijn verzonnen. De lagen krijgen dezelfde vorm als een ingelezen levering (verwerk.ts), zodat analyse,
// kaart en rapport er net zo mee werken.

/** Afstand uit de wegas (m, + is rechts van de rijrichting van de hartlijn), minimale weglengte per thema en kenmerken van de leiding. */
const LIGGING: { thema: string; afstand: number; vanaf: number; beheerder: string; diepte: [number, number]; kenmerk: string[]; materiaal: string[]; dwars: number }[] = [
  { thema: "datatransport", afstand: 3.8, vanaf: 0, beheerder: "Glasvezelnet (telecom)", diepte: [0.5, 0.7], kenmerk: ["Glasvezel 48 vezels", "Glasvezel 96 vezels", "Koper telefonie"], materiaal: ["HDPE-buis"], dwars: 45 },
  { thema: "laagspanning", afstand: 4.6, vanaf: 0, beheerder: "Enexis (elektriciteit)", diepte: [0.6, 0.8], kenmerk: ["0,4 kV, 4x150 Al", "0,4 kV, 4x240 Al"], materiaal: ["PILC", "XLPE"], dwars: 30 },
  { thema: "middenspanning", afstand: 5.5, vanaf: 150, beheerder: "Enexis (elektriciteit)", diepte: [0.8, 1.1], kenmerk: ["10 kV, 3x1x150 Al", "10 kV, 3x1x240 Al"], materiaal: ["XLPE"], dwars: 0 },
  { thema: "rioolVrijverval", afstand: 0, vanaf: 60, beheerder: "Gemeente (riolering)", diepte: [1.4, 2.6], kenmerk: ["Ø 300", "Ø 400", "Ø 600"], materiaal: ["Beton", "PVC"], dwars: 0 },
  { thema: "gasLageDruk", afstand: -4.4, vanaf: 0, beheerder: "Enexis (gas)", diepte: [0.6, 0.8], kenmerk: ["Ø 110, 200 mbar", "Ø 160, 200 mbar"], materiaal: ["PE", "PVC"], dwars: 35 },
  { thema: "water", afstand: -5.4, vanaf: 60, beheerder: "Vitens (drinkwater)", diepte: [1.0, 1.3], kenmerk: ["Ø 110", "Ø 160", "Ø 200"], materiaal: ["PVC", "PE", "Gietijzer"], dwars: 40 },
];

const lengte = (lijn: number[][]) => lijn.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - lijn[i][0], p[1] - lijn[i][1]), 0);

/** Vaste reeks per LQS, zodat een herberekende demo dezelfde leidingen krijgt. */
function reeks(zaad: string) {
  let h = 2166136261;
  for (const c of zaad) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5), ((h ^ (h >>> 13)) >>> 0) / 4294967296);
}

/** Lijn evenwijdig aan de gegeven lijn, op afstand d (m) naar rechts. */
function evenwijdig(lijn: number[][], d: number) {
  if (!d) return lijn;
  return lijn.map((p, i) => {
    const a = lijn[Math.max(0, i - 1)], b = lijn[Math.min(lijn.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + ((b[1] - a[1]) / len) * d, p[1] - ((b[0] - a[0]) / len) * d];
  });
}

/** Punt op afstand s langs de lijn, met de richting (eenheidsvector) op die plek. */
function opAfstand(lijn: number[][], s: number) {
  for (let i = 1; i < lijn.length; i++) {
    const l = Math.hypot(lijn[i][0] - lijn[i - 1][0], lijn[i][1] - lijn[i - 1][1]);
    if (s <= l || i === lijn.length - 1) {
      const t = l ? Math.min(1, s / l) : 0, dx = (lijn[i][0] - lijn[i - 1][0]) / (l || 1), dy = (lijn[i][1] - lijn[i - 1][1]) / (l || 1);
      return { p: [lijn[i - 1][0] + (lijn[i][0] - lijn[i - 1][0]) * t, lijn[i - 1][1] + (lijn[i][1] - lijn[i - 1][1]) * t], dx, dy };
    }
    s -= l;
  }
  return { p: lijn[0], dx: 1, dy: 0 };
}

/** Deel van een lijn tussen twee afstanden. */
function stuk(lijn: number[][], van: number, tot: number) {
  const uit = [opAfstand(lijn, van).p];
  let af = 0;
  for (let i = 1; i < lijn.length; i++) {
    af += Math.hypot(lijn[i][0] - lijn[i - 1][0], lijn[i][1] - lijn[i - 1][1]);
    if (af > van && af < tot) uit.push(lijn[i]);
  }
  uit.push(opAfstand(lijn, tot).p);
  return uit;
}

export type KlicBeheer = { elektra: string; gas: string; water: string };
const STANDAARD_BEHEER: KlicBeheer = { elektra: "Enexis", gas: "Enexis", water: "Vitens" };

/** Wegen waarlangs een MS-streng ligt: kortste routes over de weg van het startpunt naar de vier randen van het gebied. */
function msRoutes(wegen: number[][][], start: number[]): Set<number> {
  const sleutel = (p: number[]) => `${Math.round(p[0])},${Math.round(p[1])}`;
  const knopen = new Map<string, { p: number[]; buren: { naar: string; weg: number; len: number }[] }>();
  const knoop = (p: number[]) => { const k = sleutel(p); if (!knopen.has(k)) knopen.set(k, { p, buren: [] }); return k; };
  wegen.forEach((weg, i) => {
    const a = knoop(weg[0]), b = knoop(weg[weg.length - 1]), len = lengte(weg);
    knopen.get(a)!.buren.push({ naar: b, weg: i, len });
    knopen.get(b)!.buren.push({ naar: a, weg: i, len });
  });
  if (!knopen.size) return new Set();
  let begin = "", dMin = Infinity;
  for (const [k, v] of knopen) { const d = Math.hypot(v.p[0] - start[0], v.p[1] - start[1]); if (d < dMin) { dMin = d; begin = k; } }
  const afstand = new Map<string, number>([[begin, 0]]), via = new Map<string, { van: string; weg: number }>(), klaar = new Set<string>();
  for (;;) {
    let nu = "", best = Infinity;
    for (const [k, d] of afstand) if (!klaar.has(k) && d < best) { best = d; nu = k; }
    if (!nu) break;
    klaar.add(nu);
    for (const b of knopen.get(nu)!.buren) if (best + b.len < (afstand.get(b.naar) ?? Infinity)) { afstand.set(b.naar, best + b.len); via.set(b.naar, { van: nu, weg: b.weg }); }
  }
  const uit = new Set<number>(), p0 = knopen.get(begin)!.p;
  for (const [rx, ry] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let doel = "", ver = 60; // alleen een streng als er in die richting ook echt weg ligt
    for (const k of klaar) { const p = knopen.get(k)!.p, v = (p[0] - p0[0]) * rx + (p[1] - p0[1]) * ry; if (v > ver) { ver = v; doel = k; } }
    for (let k = doel; via.has(k); k = via.get(k)!.van) uit.add(via.get(k)!.weg);
  }
  return uit;
}

export async function simuleerKlic(l: Lqs, beheer: KlicBeheer = STANDAARD_BEHEER): Promise<{ eigenLagen: EigenLaag[]; klic: KlicInfo } | null> {
  if (!l.zoekgebied) return null;
  const rnd = reeks(l.code ?? l.id), tussen = ([a, b]: [number, number]) => Math.round((a + rnd() * (b - a)) * 100) / 100, kies = <T,>(x: T[]) => x[Math.floor(rnd() * x.length)];
  const p = l.zoekgebied.coordinates[0].map(naarRD), xs = p.map((c) => c[0]), ys = p.map((c) => c[1]);
  const vak: BBox = [Math.min(...xs) - 100, Math.min(...ys) - 100, Math.max(...xs) + 100, Math.max(...ys) + 100];
  const wegen = (await rijwegen(vak)).filter((w) => w.some(([x, y]) => x >= vak[0] && x <= vak[2] && y >= vak[1] && y <= vak[3]));

  type Lijn = { coordinates: number[][]; props: Record<string, unknown> };
  const themas: Record<string, Lijn[]> = {};
  const voeg = (thema: string, coordinates: number[][], props: Record<string, unknown>) => (themas[thema] ??= []).push({ coordinates, props: { thema, gesimuleerd: true, ...props } });

  const beheerder = (thema: string, standaard: string) =>
    thema === "laagspanning" || thema === "middenspanning" ? `${beheer.elektra} (elektriciteit)` : thema === "gasLageDruk" ? `${beheer.gas} (gas)` : thema === "water" ? `${beheer.water} (drinkwater)` : standaard;
  const midden = [(vak[0] + vak[2]) / 2, (vak[1] + vak[3]) / 2];
  const ms = msRoutes(wegen, l.aansluitpunt ? naarRD(l.aansluitpunt) : midden);
  for (const [nr, weg] of wegen.entries()) {
    const len = lengte(weg);
    for (const t of LIGGING) {
      // middenspanning alleen langs de strengen; zonder samenhangend wegennet langs de langere wegen
      if (t.thema === "middenspanning" ? (ms.size ? !ms.has(nr) : len < t.vanaf) : len < t.vanaf) continue;
      const hoofd = evenwijdig(weg, t.afstand);
      const eigen = { beheerder: beheerder(t.thema, t.beheerder), materiaal: kies(t.materiaal), kenmerk: kies(t.kenmerk), aanlegjaar: 1965 + Math.floor(rnd() * 58) };
      // hoofdleiding in stukken van 40-120 m, met een kleine wisseling van diepte en soms van materiaal
      for (let s = 0; s < len; ) {
        const e = Math.min(len, s + 40 + rnd() * 80);
        if (e - s > 3) voeg(t.thema, stuk(hoofd, s, e), { ...eigen, diepteM: tussen(t.diepte), aard: "hoofdleiding" });
        s = e;
      }
      // aansluitleidingen: dwars over de berm naar de percelen aan weerszijden
      if (t.dwars) {
        for (let s = 12 + rnd() * t.dwars; s < len - 8; s += t.dwars * (0.7 + rnd() * 0.8)) {
          const { p: [x, y], dx, dy } = opAfstand(weg, s);
          const zijde = t.afstand >= 0 ? 1 : -1, nx = dy * zijde, ny = -dx * zijde;
          const uit = Math.abs(t.afstand) + 6 + rnd() * 10;
          voeg(t.thema, [[x + nx * Math.abs(t.afstand), y + ny * Math.abs(t.afstand)], [x + nx * uit, y + ny * uit]], { ...eigen, kenmerk: t.thema === "water" ? "Ø 32 aansluiting" : t.thema === "gasLageDruk" ? "Ø 32 aansluiting" : t.thema === "datatransport" ? "Aansluitkabel" : "0,4 kV huisaansluiting", diepteM: tussen([Math.max(0.5, t.diepte[0] - 0.1), t.diepte[1]]), aard: "aansluiting" });
        }
      }
    }
  }
  // transportleiding: in ruim een derde van de gebieden kruist een hogedrukgasleiding de rand van het zoekgebied
  if (rnd() < 0.4) {
    const hoek = rnd() * Math.PI, tx = Math.cos(hoek), ty = Math.sin(hoek), half = Math.max(vak[2] - vak[0], vak[3] - vak[1]) / 2;
    const uit = (0.45 + 0.25 * rnd()) * (half - 100) * (rnd() < 0.5 ? 1 : -1);
    const cx = midden[0] - ty * uit, cy = midden[1] + tx * uit, knik = (rnd() - 0.5) * 30;
    voeg("gasHogeDruk", [[cx - tx * half * 1.3, cy - ty * half * 1.3], [cx - ty * knik, cy + tx * knik], [cx + tx * half * 1.3, cy + ty * half * 1.3]], {
      beheerder: "Gasunie Transport Services", kenmerk: "Ø 508, 40 bar", materiaal: "Staal", diepteM: 1.2, aanlegjaar: 1974, aard: "transportleiding",
    });
  }

  const afger = (c: number[][]) => c.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const lagen: EigenLaag[] = Object.entries(themas).map(([thema, lijnen]) => {
    const t = THEMA[thema] ?? { naam: thema };
    return {
      id: `klic-${thema}`,
      naam: `KLIC ${t.naam} (gesimuleerd)`,
      soort: t.zwaar ? "uitsluiten" : "aandacht",
      buffer: t.zwaar ? 5 : 1,
      vertrouwelijk: false,
      functie: "leidingen",
      geojson: { type: "FeatureCollection", features: lijnen.map((x) => ({ type: "Feature", properties: x.props, geometry: { type: "LineString", coordinates: afger(x.coordinates) } })) },
    };
  });
  const klic: KlicInfo = {
    meldnummer: `SIMULATIE-${l.code}`,
    ingelezenOp: new Date().toISOString(),
    bron: "simulatie",
    netbeheerders: [beheer.elektra === beheer.gas ? `${beheer.elektra} (elektriciteit en gas)` : `${beheer.elektra} (elektriciteit)`, ...(beheer.elektra === beheer.gas ? [] : [`${beheer.gas} (gas)`]), ...(themas.gasHogeDruk ? ["Gasunie Transport Services (gas hoge druk)"] : []), `${beheer.water} (drinkwater)`, "Gemeente (riolering)", "Glasvezelnet (telecom)"].map((naam, i) => ({ code: `SIM${i + 1}`, naam: `${naam} – gesimuleerd`, geleverd: true })),
    themas: Object.entries(themas).map(([thema, lijnen]) => ({ thema, naam: (THEMA[thema] ?? { naam: thema }).naam, leidingen: lijnen.length })),
  };
  return { eigenLagen: [...l.eigenLagen.filter((e) => !e.id.startsWith("klic-")), ...lagen], klic };
}
